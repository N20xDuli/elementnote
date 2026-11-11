/**
 * ElementNote 端到端测试（无第三方依赖）
 *
 * 用法：
 *   node tests/e2e.mjs
 *   set ELEMENTNOTE_BROWSER=C:\path\to\msedge.exe && node tests/e2e.mjs
 *
 * 说明：
 * - 新版 Google Chrome（137+）在品牌版里禁用了命令行 --load-extension，
 *   所以默认优先使用 Edge（同为 Chromium 内核，MV3 行为一致）。
 * - 测试会启动 headless 浏览器、加载 elementnote/、打开 demo 页，
 *   通过 CDP 模拟真实鼠标/键盘事件，断言 UI、存储、提示词与剪贴板。
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEMO_DIR = path.join(ROOT, 'demo');
const DOCS_DIR = path.join(ROOT, 'docs');
const STORAGE_KEY = 'annotations.v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBrowser() {
  const candidates = [
    process.env.ELEMENTNOTE_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  throw new Error('找不到 Chromium 浏览器，请设置 ELEMENTNOTE_BROWSER 指向 msedge.exe / chrome.exe');
}

function serveDemo() {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };
  const server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = path.resolve(DEMO_DIR, relative);
      if (!file.startsWith(DEMO_DIR)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, { 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    } catch {
      res.writeHead(500);
      res.end('error');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function waitFor(fn, { timeout = 10000, interval = 150, label = 'condition' } = {}) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw new Error('等待超时：' + label + (lastError ? '（最后一次错误：' + lastError.message + '）' : ''));
}

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.ws = null;
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', (event) => reject(new Error('WebSocket 连接失败：' + (event.message || 'unknown'))), { once: true });
    });
    this.ws.addEventListener('message', (event) => this.onMessage(event));
  }

  onMessage(event) {
    let message;
    try {
      message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    } catch {
      return;
    }
    if (!message.id || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.method + ' -> ' + JSON.stringify(message.error)));
    else pending.resolve(message.result);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error('断言失败：' + message);
  console.log('  ✓ ' + message);
}

async function main() {
  console.log('ElementNote E2E');
  const browserPath = findBrowser();
  console.log('浏览器：' + browserPath);

  const server = await serveDemo();
  const port = server.address().port;
  const origin = 'http://127.0.0.1:' + port;
  const demoUrl = origin + '/index.html';
  console.log('演示页：' + demoUrl);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'elementnote-e2e-'));
  const devPort = 9411;
  const browserArgs = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=' + devPort,
    '--user-data-dir=' + profile,
    '--load-extension=' + ROOT,
    '--disable-extensions-except=' + ROOT,
    '--window-size=1280,900',
    demoUrl
  ];
  const proc = spawn(browserPath, browserArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  let browserLog = '';
  proc.stdout.on('data', (chunk) => { browserLog += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { browserLog += chunk.toString(); });

  let cdp = null;
  let pageSession = null;
  let popupCdp = null;

  const debug = (label, error) => {
    console.error('\n✗ ' + label);
    console.error(error && error.stack ? error.stack : error);
    console.error('\n浏览器日志（尾部）：\n' + browserLog.split('\n').slice(-30).join('\n'));
  };

  try {
    await waitFor(async () => {
      const res = await fetch('http://127.0.0.1:' + devPort + '/json/version');
      return res.ok;
    }, { timeout: 20000, label: 'CDP 端口就绪' });

    const version = await (await fetch('http://127.0.0.1:' + devPort + '/json/version')).json();
    cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.connect();

    const targets = await waitFor(async () => {
      const list = await (await fetch('http://127.0.0.1:' + devPort + '/json/list')).json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith(demoUrl.split('?')[0]));
      const sw = list.find((t) => t.type === 'service_worker' && /\/src\/background\.js$/.test(t.url));
      return page && sw ? { list, page, sw } : null;
    }, { timeout: 20000, label: '页面与扩展 service worker' });

    const extensionId = new URL(targets.sw.url).host;
    console.log('扩展 ID：' + extensionId);

    pageSession = (await cdp.send('Target.attachToTarget', { targetId: targets.page.id, flatten: true })).sessionId;
    const swSession = (await cdp.send('Target.attachToTarget', { targetId: targets.sw.id, flatten: true })).sessionId;
    await cdp.send('Page.enable', {}, pageSession);
    await cdp.send('Runtime.enable', {}, pageSession);
    await cdp.send('Runtime.enable', {}, swSession);
    await cdp.send('Page.bringToFront', {}, pageSession);

    async function evalPage(expression, awaitPromise = false) {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true
      }, pageSession);
      if (result.exceptionDetails) {
        throw new Error('页面脚本异常：' + (result.exceptionDetails.text || '') + ' ' +
          JSON.stringify(result.exceptionDetails.exception && result.exceptionDetails.exception.description || ''));
      }
      return result.result ? result.result.value : undefined;
    }

    async function evalSw(expression) {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
      }, swSession);
      if (result.exceptionDetails) {
        throw new Error('service worker 异常：' + (result.exceptionDetails.text || '') + ' ' +
          JSON.stringify(result.exceptionDetails.exception && result.exceptionDetails.exception.description || ''));
      }
      return result.result ? result.result.value : undefined;
    }

    async function evalExtension(expression, awaitPromise = true) {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true
      }, swSession);
      if (result.exceptionDetails) throw new Error('扩展上下文异常：' + result.exceptionDetails.text);
      return result.result ? result.result.value : undefined;
    }

    async function sendToPage(type, extra = {}) {
      return evalExtension(`(async () => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => (t.url || '').startsWith(${JSON.stringify(origin)}));
        if (!tab) return { ok: false, error: 'tab-not-found', urls: tabs.map((t) => t.url) };
        try {
          const res = await chrome.tabs.sendMessage(tab.id, ${JSON.stringify(Object.assign({ type }, extra))});
          return { ok: true, tabId: tab.id, res };
        } catch (error) {
          return { ok: false, error: String((error && error.message) || error) };
        }
      })()`);
    }

    async function getAnnotations() {
      return evalExtension(`chrome.storage.local.get(null).then((data) => {
        const out = [];
        Object.keys(data || {}).forEach((key) => {
          if (key.indexOf('annotations.v1::') !== 0) return;
          if (Array.isArray(data[key])) out.push.apply(out, data[key]);
        });
        return out;
      })`);
    }

    async function uiState() {
      return evalPage(`(() => {
        const host = document.getElementById('elementnote-root');
        if (!host || !host.shadowRoot) return null;
        const s = host.shadowRoot;
        const text = (id) => { const el = s.getElementById(id); return el ? el.textContent : ''; };
        return {
          hintHidden: s.getElementById('enHint').hidden,
          toolbarHidden: s.getElementById('enToolbar').hidden,
          panelHidden: s.getElementById('enPanel').hidden,
          overlayHidden: s.getElementById('enOverlay').hidden,
          sizeText: text('enSize'),
          panelTitle: text('enPanelTitle'),
          panelTarget: text('enPanelTarget'),
          panelTargetTitle: s.getElementById('enPanelTarget').title,
          noteValue: s.getElementById('enNote').value,
          toast: s.getElementById('enToast').hidden ? '' : text('enToast'),
          count: text('enCount'),
          badges: s.querySelectorAll('.en-badge').length,
          modalHidden: s.getElementById('enModal').hidden,
          promptText: s.getElementById('enPromptText').value,
          toolbarActive: s.getElementById('enToolbar').classList.contains('en-active'),
          activeInsideShadow: s.activeElement ? s.activeElement.tagName : ''
        };
      })()`);
    }

    async function center(selector) {
      return evalPage(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
      })()`);
    }

    async function mouseMove(x, y) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0, pointerType: 'mouse' }, pageSession);
      await sleep(120);
    }

    async function clickAt(x, y) {
      await mouseMove(x, y);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse'
      }, pageSession);
      await sleep(60);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse'
      }, pageSession);
      await sleep(220);
    }

    async function pressKey(key, code, keyCode, modifiers = 0) {
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers
      }, pageSession);
      await sleep(60);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers
      }, pageSession);
      await sleep(120);
    }

    console.log('\n[1] 内容脚本与初始状态');
    await waitFor(async () => (await evalPage('!!document.getElementById("elementnote-root")')), { label: 'content script 注入' });
    let state = await uiState();
    assert(state && state.toolbarHidden === true, '初始状态工具栏隐藏');
    assert(state.hintHidden === true, '初始状态提示条隐藏');
    assert((await getAnnotations()).length === 0, '初始没有批注');

    console.log('\n[2] 激活元素拾取（等价于 Alt+Shift+C）');
    const activated = await sendToPage('EN_ACTIVATE');
    assert(activated.ok && activated.res && activated.res.active === true, '页面进入拾取模式');
    await sleep(200);
    state = await uiState();
    assert(state.hintHidden === false, '提示条已显示');
    assert(state.toolbarHidden === false && state.toolbarActive === true, '工具栏显示且为激活态');

    console.log('\n[3] 悬停高亮');
    const cta = await center('#primary-cta');
    assert(cta && cta.width > 0, '找到演示按钮 #primary-cta');
    await mouseMove(cta.x, cta.y);
    state = await uiState();
    assert(state.overlayHidden === false, '悬停出现高亮框');
    assert(state.sizeText.includes('#primary-cta'), '高亮标签包含元素定位：' + state.sizeText);

    console.log('\n[3.5] Shadow DOM 内部元素拾取');
    const shadowPoint = await evalPage(`(async () => {
      const host = document.querySelector('#shadow-demo');
      if (!host) return null;
      host.scrollIntoView({ block: 'center' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const button = host.shadowRoot && host.shadowRoot.getElementById('shadow-action');
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`, true);
    assert(!!shadowPoint, '找到 Shadow DOM 内的按钮');
    await mouseMove(shadowPoint.x, shadowPoint.y);
    state = await uiState();
    assert(state.overlayHidden === false, '可以悬停 Shadow DOM 内部元素');
    assert(state.sizeText.includes('#shadow-action'), '高亮标签指向 shadow 内部元素：' + state.sizeText);
    await clickAt(shadowPoint.x, shadowPoint.y);
    state = await uiState();
    assert(state.panelHidden === false, 'Shadow DOM 内部元素可打开批注面板');
    assert(state.panelTargetTitle.includes('>>'), '选择器包含 Shadow DOM 穿透路径：' + state.panelTargetTitle);
    await pressKey('Escape', 'Escape', 27);
    await sleep(150);
    await evalPage('window.scrollTo(0, 0)');
    await sleep(300);
    state = await uiState();
    assert(state.panelHidden === true && state.hintHidden === false, '关闭面板后仍在拾取模式');

    console.log('\n[3.6] iframe 容器拾取');
    const framePoint = await evalPage(`(async () => {
      const frame = document.querySelector('#iframe-demo');
      if (!frame) return null;
      frame.scrollIntoView({ block: 'center' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = frame.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`, true);
    assert(!!framePoint, '找到 iframe 容器');
    await mouseMove(framePoint.x, framePoint.y);
    state = await uiState();
    assert(state.overlayHidden === false, '可以悬停 iframe 本身');
    assert(state.sizeText.includes('iframe#iframe-demo'), '高亮标签指向 iframe 容器：' + state.sizeText);
    await clickAt(framePoint.x, framePoint.y);
    state = await uiState();
    assert(state.panelHidden === false, 'iframe 容器可打开批注面板');
    assert(state.panelTarget.includes('iframe#iframe-demo'), '面板目标是 iframe 容器');
    await pressKey('Escape', 'Escape', 27);
    await sleep(150);
    await evalPage('window.scrollTo(0, 0)');
    await sleep(300);

    console.log('\n[4] 点击选中并写批注');
    await clickAt(cta.x, cta.y);
    state = await uiState();
    assert(state.panelHidden === false, '点击后打开批注面板');
    assert(state.panelTitle.includes('添加批注'), '面板标题正确');
    assert(state.activeInsideShadow === 'TEXTAREA', '批注输入框已聚焦');

    await pressKey('Enter', 'Enter', 13);
    state = await uiState();
    assert(state.panelHidden === false, '空批注被拦截，面板保持打开');
    assert(state.toast.includes('先写一句'), '空批注提示正确');
    assert((await getAnnotations()).length === 0, '空批注没有写入存储');

    const noteA = '主按钮字号偏大，和右侧图标基线不齐，改成 14px 并与图标垂直居中';
    await cdp.send('Input.insertText', { text: noteA }, pageSession);
    await sleep(120);
    await pressKey('Enter', 'Enter', 13);
    await waitFor(async () => (await getAnnotations()).length === 1, { label: '批注写入 storage' });
    await sleep(250);
    state = await uiState();
    assert(state.panelHidden === true, '保存后关闭面板');
    assert(state.badges === 1, '页面出现 1 个批注徽标');
    assert(state.toast.includes('已添加批注'), '出现保存成功提示');
    let stored = await getAnnotations();
    stored = stored.filter((a) => (a.urlKey || '').startsWith(origin));
    assert(stored[0].note === noteA, '批注内容已持久化');
    assert(stored[0].target.selector === '#primary-cta', '选择器采集正确：' + stored[0].target.selector);
    assert(stored[0].target.rect.width > 0 && stored[0].target.rect.top > 0, '坐标采集有效');
    assert(stored[0].target.styles.includes('font-size'), '计算样式已采集');
    assert(stored[0].target.styles.includes('background-color: rgb(255, 255, 255)'), '计算样式未混入 :hover 值');
    assert(stored[0].urlKey === demoUrl, 'URL 已记录');
    const storageKeys = await evalExtension('chrome.storage.local.get(null).then((data) => Object.keys(data || {}))');
    assert(storageKeys.some(function (key) { return key.indexOf('annotations.v1::') === 0; }), '按页面 URL 分片存储');
    assert(storageKeys.indexOf('annotations.v1') === -1, '不再使用全局数组存储（避免并发覆盖）');

    console.log('\n[5] 组件栈探测（MAIN world）+ 第二条批注（真实点击保存按钮）');
    const componentBtn = await center('#component-demo');
    await clickAt(componentBtn.x, componentBtn.y);
    state = await uiState();
    assert(state.panelHidden === false, '第二个元素打开批注面板');
    await cdp.send('Input.insertText', { text: '这个按钮的组件层级需要确认' }, pageSession);
    await sleep(120);
    const saveButton = await evalPage(`(() => {
      const b = document.getElementById('elementnote-root').shadowRoot.getElementById('enSave');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, pe: getComputedStyle(b).pointerEvents };
    })()`);
    assert(saveButton && saveButton.pe === 'auto', '保存按钮可接受真实鼠标事件（pointer-events 修复）');
    await clickAt(saveButton.x, saveButton.y);
    await waitFor(async () => (await getAnnotations()).length === 2, { label: '第二条批注写入' });
    await sleep(250);
    stored = await getAnnotations();
    const componentRecord = stored.find((a) => a.target && a.target.id === 'component-demo');
    assert(!!componentRecord, '第二条批注针对 #component-demo');
    assert(!!componentRecord.target.component, '探测到组件信息');
    assert(componentRecord.target.component.framework === 'React', '框架识别为 React');
    assert(componentRecord.target.component.chain.includes('CardActions'), '组件栈包含 CardActions');
    assert(componentRecord.target.component.source.includes('Dashboard.tsx'), '采集到源码位置');

    console.log('\n[6] 提示词生成');
    const promptResponse = await sendToPage('EN_GET_PROMPT');
    assert(promptResponse.ok && promptResponse.res && promptResponse.res.prompt, '通过内容脚本生成提示词');
    const prompt = promptResponse.res.prompt;
    assert(prompt.includes('# 前端页面元素批注'), '提示词包含标题');
    assert(prompt.includes(demoUrl), '提示词包含页面 URL');
    assert(prompt.includes('本地开发页面'), '提示词识别本地开发环境');
    assert(prompt.includes('## 批注详情') && prompt.includes('### 批注 1') && prompt.includes('### 批注 2'), '提示词包含两条批注');
    assert(prompt.includes(noteA), '提示词包含批注原文');
    assert(prompt.includes('`#primary-cta`'), '提示词包含 CSS 选择器');
    assert(prompt.includes('XPath'), '提示词包含 XPath');
    assert(prompt.includes('文档坐标'), '提示词包含文档坐标');
    assert(prompt.includes('计算样式'), '提示词包含计算样式');
    assert(prompt.includes('CardActions') && prompt.includes('Dashboard.tsx'), '提示词包含组件栈与源码');
    assert(prompt.includes('任务要求'), '提示词包含任务要求');
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.writeFileSync(path.join(DOCS_DIR, 'prompt-example.md'), prompt);
    console.log('  已保存 docs/prompt-example.md');

    console.log('\n[7] 一键复制（C 键）');
    await cdp.send('Browser.grantPermissions', {
      origin: origin,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite']
    });
    await pressKey('c', 'KeyC', 67);
    await sleep(600);
    state = await uiState();
    assert(state.toast.includes('已复制'), '出现复制成功提示：' + state.toast);
    let clipboardText = '';
    try {
      clipboardText = await evalPage('navigator.clipboard.readText()', true);
    } catch (error) {
      console.log('  ! 读取剪贴板失败，跳过内容比对：' + error.message);
    }
    if (clipboardText) {
      // Windows 剪贴板会把 LF 规范成 CRLF；「生成时间」精确到秒，两次生成可能跨秒
      const normalizeClipboard = (text) => text
        .replace(/\r\n/g, '\n')
        .replace(/^- 生成时间：.*$/m, '- 生成时间：<TIME>');
      if (normalizeClipboard(clipboardText) !== normalizeClipboard(prompt)) {
        console.log('  ! 剪贴板长度 ' + clipboardText.length + '，生成提示词长度 ' + prompt.length);
        console.log('  ! 剪贴板开头：' + JSON.stringify(clipboardText.slice(0, 120)));
        console.log('  ! 提示词开头：' + JSON.stringify(prompt.slice(0, 120)));
      }
      assert(normalizeClipboard(clipboardText) === normalizeClipboard(prompt), '剪贴板内容与生成的提示词一致');
    }

    console.log('\n[8] 提示词预览弹窗（真实点击）');
    const previewButton = await evalPage(`(() => {
      const b = document.getElementById('elementnote-root').shadowRoot.getElementById('enPreview');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await clickAt(previewButton.x, previewButton.y);
    await sleep(250);
    state = await uiState();
    assert(state.modalHidden === false, '预览弹窗已打开');
    assert(state.promptText.includes(noteA), '预览内容包含批注');
    const modalClose = await evalPage(`(() => {
      const b = document.getElementById('elementnote-root').shadowRoot.querySelector('#enModal [data-act="modal-close"]');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await clickAt(modalClose.x, modalClose.y);
    await sleep(200);
    state = await uiState();
    assert(state.modalHidden === true, '预览弹窗已关闭');

    console.log('\n[9] 刷新后恢复批注与徽标');
    await cdp.send('Page.reload', {}, pageSession);
    await waitFor(async () => {
      try {
        return await evalPage('!!(document.getElementById("elementnote-root") && document.getElementById("elementnote-root").shadowRoot.querySelectorAll(".en-badge").length === 2)');
      } catch {
        return false;
      }
    }, { label: '刷新后恢复两个徽标', timeout: 12000 });
    assert(true, '刷新后两个批注徽标恢复');

    console.log('\n[9.2] hash 路由按 URL 分组');
    await evalPage(`history.pushState({}, '', location.pathname + location.search + '#/route/b')`);
    await waitFor(async () => {
      const current = await uiState();
      return current.badges === 0 && current.count === '0';
    }, { timeout: 8000, label: 'hash 路由切换后按新 URL 分组' });
    assert(true, 'hash 路由切换后不串页（徽标清空）');
    await evalPage('history.back()');
    await waitFor(async () => (await uiState()).badges === 2, { timeout: 8000, label: '返回原 hash 路由后批注恢复' });
    assert(true, '返回原 hash 路由后批注恢复');
    await sleep(300);

    console.log('\n[9.5] 点击徽标编辑批注（真实点击）');
    const badgePoint = await evalPage(`(() => {
      const b = document.getElementById('elementnote-root').shadowRoot.querySelector('.en-badge');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await clickAt(badgePoint.x, badgePoint.y);
    await sleep(250);
    state = await uiState();
    assert(state.panelHidden === false, '点击徽标打开编辑面板');
    assert(state.panelTitle.includes('编辑批注 #1'), '编辑面板编号正确：' + state.panelTitle);
    assert(state.noteValue === noteA, '编辑面板带出原批注内容');
    await pressKey('Escape', 'Escape', 27);
    await sleep(200);
    state = await uiState();
    assert(state.panelHidden === true, 'Esc 关闭编辑面板');

    console.log('\n[10] popup 管理与复制');
    const popupUrl = 'chrome-extension://' + extensionId + '/src/popup.html';
    const popupTarget = await cdp.send('Target.createTarget', { url: popupUrl });
    const popupSession = (await cdp.send('Target.attachToTarget', { targetId: popupTarget.targetId, flatten: true })).sessionId;
    await cdp.send('Runtime.enable', {}, popupSession);
    await cdp.send('Page.enable', {}, popupSession);

    async function evalPopup(expression, awaitPromise = false) {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true
      }, popupSession);
      if (result.exceptionDetails) throw new Error('popup 异常：' + result.exceptionDetails.text);
      return result.result ? result.result.value : undefined;
    }

    // 让 demo 页成为 active tab，再刷新 popup 页面，使其读取到当前页
    await cdp.send('Page.bringToFront', {}, pageSession);
    await evalPopup('location.reload()');
    await sleep(900);
    await waitFor(async () => {
      try {
        return (await evalPopup('document.getElementById("count").textContent')) === '2';
      } catch {
        return false;
      }
    }, { label: 'popup 显示 2 条批注', timeout: 12000 });
    assert(true, 'popup 显示当前页 2 条批注');

    await cdp.send('Page.bringToFront', {}, popupSession);
    await sleep(300);
    const popupCopy = await evalPopup(`(async () => {
      document.getElementById('copy').click();
      await new Promise((r) => setTimeout(r, 500));
      const status = document.getElementById('status');
      return { hidden: status.hidden, text: status.textContent, error: status.classList.contains('error') };
    })()`, true);
    assert(!popupCopy.hidden && popupCopy.text.includes('已复制'), 'popup 复制成功：' + popupCopy.text);
    assert(!popupCopy.error, 'popup 复制未报错');

    console.log('\n[11] 弹窗「定位」能力');
    const firstRecord = (await getAnnotations())[0];
    const focusResponse = await sendToPage('EN_FOCUS', { id: firstRecord.id });
    assert(focusResponse.ok && focusResponse.res && focusResponse.res.ok === true, 'EN_FOCUS 定位成功');

    console.log('\n[12] 截图');
    fs.mkdirSync(DOCS_DIR, { recursive: true });

    // popup 重新加载到干净状态，再切到浅色主题截图
    await cdp.send('Page.bringToFront', {}, pageSession);
    await evalPopup('location.reload()');
    await sleep(1000);
    await waitFor(async () => {
      try {
        return (await evalPopup('document.getElementById("count").textContent')) === '2';
      } catch {
        return false;
      }
    }, { label: 'popup 重新加载完成', timeout: 12000 });
    await cdp.send('Page.bringToFront', {}, popupSession);
    await cdp.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-color-scheme', value: 'light' }]
    }, popupSession);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 380, height: 600, deviceScaleFactor: 2, mobile: false
    }, popupSession);
    await sleep(350);
    const popupHeight = await evalPopup('Math.max(360, Math.min(600, Math.ceil(document.querySelector(".app").getBoundingClientRect().height)))');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 380, height: popupHeight, deviceScaleFactor: 2, mobile: false
    }, popupSession);
    await sleep(300);
    const popupDebug = await evalPopup(`(() => {
      const copy = document.getElementById('copy');
      const count = document.getElementById('count');
      const item = document.querySelector('.item');
      const cs = (el) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          display: s.display, bg: s.backgroundColor, color: s.color,
          border: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor,
          width: Math.round(r.width), height: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y)
        };
      };
      return {
        vars: {
          primary: getComputedStyle(document.documentElement).getPropertyValue('--primary'),
          border: getComputedStyle(document.documentElement).getPropertyValue('--border'),
          faint: getComputedStyle(document.documentElement).getPropertyValue('--faint'),
          font: getComputedStyle(document.documentElement).getPropertyValue('--font')
        },
        sheets: Array.from(document.styleSheets).map((s) => { try { return { href: s.href, rules: s.cssRules.length }; } catch (e) { return { href: s.href, error: String(e) }; } }),
        copy: cs(copy), copyText: copy && copy.textContent, count: cs(count), item: cs(item),
        body: cs(document.body),
        liveHidden: document.getElementById('live').hidden,
        media: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      };
    })()`);
    assert(popupDebug.vars.primary.trim() === '#4f7cff', 'popup 主题变量生效');
    assert(popupDebug.copy.bg !== 'rgba(0, 0, 0, 0)', '复制按钮有主色背景');
    assert(popupDebug.copy.border !== '0px none rgb(255, 255, 255)', '按钮边框样式生效');
    assert(popupDebug.liveHidden === true, '未拾取时“选择元素中”标签隐藏');
    const popupShot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, popupSession);
    fs.writeFileSync(path.join(DOCS_DIR, 'screenshot-popup.png'), Buffer.from(popupShot.data, 'base64'));
    console.log('  已保存 docs/screenshot-popup.png');

    await cdp.send('Page.bringToFront', {}, pageSession);
    await cdp.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-color-scheme', value: 'light' }]
    }, pageSession);
    await evalPage('window.scrollTo(0, 46)');
    await sleep(400);
    await sendToPage('EN_ACTIVATE');
    await sleep(250);
    const cta2 = await center('#primary-cta');
    await mouseMove(cta2.x, cta2.y);
    await sleep(350);
    const pageShot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, pageSession);
    fs.writeFileSync(path.join(DOCS_DIR, 'screenshot-page.png'), Buffer.from(pageShot.data, 'base64'));
    console.log('  已保存 docs/screenshot-page.png');

    console.log('\n全部通过 ✅');
  } catch (error) {
    debug('E2E 测试失败', error);
    process.exitCode = 1;
  } finally {
    try { cdp && cdp.close(); } catch { /* ignore */ }
    try { popupCdp && popupCdp.close(); } catch { /* ignore */ }
    try { proc.kill(); } catch { /* ignore */ }
    if (process.platform === 'win32' && proc.pid) {
      try {
        const { spawnSync } = await import('node:child_process');
        spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch { /* ignore */ }
    }
    try { server.close(); } catch { /* ignore */ }
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main();
