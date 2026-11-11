'use strict';

/**
 * ElementNote service worker
 *
 * 职责：
 * 1. 快捷键（Alt+Shift+C）切换元素拾取模式
 * 2. 在页面主世界（MAIN world）运行探测函数，读取 React / Vue / Angular 组件栈
 *    （content script 运行在隔离世界，读不到页面 JS 在 DOM 上挂的 __reactFiber$ 等属性）
 */

const PROBE_ATTR = 'data-elementnote-probe';

// Firefox 事件页用 browser.*（Promise）；Chrome/Edge service worker 用 chrome.*
const ext = (typeof browser !== 'undefined' && browser && browser.runtime) ? browser : chrome;

/**
 * 该函数会被 chrome.scripting.executeScript 序列化后注入页面主世界，
 * 因此必须完全自包含：不能引用本文件里的其它变量。
 */
function probeFrameworkInPage(marker) {
  var attr = 'data-elementnote-probe';
  var markerValue = String(marker);

  // document.querySelector 不能穿透 shadow root，需要递归进入 open shadow root 查找标记节点
  function deepFind(root, depth) {
    if (!root || depth > 8) return null;
    var found = null;
    try {
      found = root.querySelector('[' + attr + '="' + markerValue + '"]');
    } catch (e) { /* ignore */ }
    if (found) return found;
    var all = [];
    try {
      all = root.querySelectorAll('*');
    } catch (e) {
      return null;
    }
    for (var i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) {
        var inner = deepFind(all[i].shadowRoot, depth + 1);
        if (inner) return inner;
      }
    }
    return null;
  }

  var el = deepFind(document, 0);
  if (!el) return null;

  const IGNORED = [
    'Fragment', 'StrictMode', 'Suspense', 'SuspenseList', 'Profiler',
    'Provider', 'Consumer', 'ForwardRef', 'Memo', 'Anonymous'
  ];

  // ---------- React ----------
  try {
    const key = Object.keys(el).find(function (k) {
      return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0;
    });
    if (key) {
      let fiber = el[key];
      const names = [];
      let source = '';
      let node = fiber;
      for (let i = 0; node && i < 100 && names.length < 6; i++) {
        const type = node.type;
        let name = '';
        if (typeof type === 'function') {
          name = type.displayName || type.name || '';
        } else if (type && typeof type === 'object') {
          name = type.displayName || type.name || '';
        }
        if (name && IGNORED.indexOf(name) === -1 && names[names.length - 1] !== name) {
          names.push(name);
        }
        if (!source) {
          const ds = node._debugSource || (node._debugOwner && node._debugOwner._debugSource);
          if (ds && ds.fileName) {
            source = ds.fileName + (ds.lineNumber ? ':' + ds.lineNumber : '') +
              (ds.columnNumber ? ':' + ds.columnNumber : '');
          }
        }
        node = node.return;
      }
      if (names.length || source) {
        return { framework: 'React', chain: names, source: source };
      }
    }
  } catch (e) { /* ignore */ }

  // ---------- Vue 3 / Vue 2 ----------
  try {
    let inst = el.__vueParentComponent || el.__vue__ || null;
    const names = [];
    let source = '';
    let node = inst;
    let guard = 0;
    while (node && guard++ < 40) {
      const opt = node.type || node.$options || {};
      const name = opt.__name || opt.name || (node.$options && node.$options.name) || '';
      if (name && names.indexOf(name) === -1) names.push(name);
      if (!source) {
        source = opt.__file || (node.$options && node.$options.__file) || '';
      }
      node = node.parent || node.$parent || null;
    }
    if (names.length || source) {
      return { framework: 'Vue', chain: names.slice(0, 6), source: source };
    }
  } catch (e) { /* ignore */ }

  // ---------- Angular（仅在 dev mode 下可用） ----------
  try {
    if (typeof window.ng !== 'undefined' && typeof window.ng.getComponent === 'function') {
      const comp = window.ng.getComponent(el);
      if (comp && comp.constructor && comp.constructor.name) {
        return { framework: 'Angular', chain: [comp.constructor.name], source: '' };
      }
    }
  } catch (e) { /* ignore */ }

  return null;
}

ext.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-picker') return;
  let target = tab && tab.id != null ? tab : null;
  if (!target) {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    target = tabs && tabs[0];
  }
  if (!target || target.id == null) return;
  try {
    await ext.tabs.sendMessage(target.id, { type: 'EN_TOGGLE' });
  } catch (e) {
    // chrome://、扩展商店、PDF 等页面不允许内容脚本运行，静默忽略
    console.warn('[ElementNote] 当前页面不支持批注：', e && e.message);
  }
});

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'EN_PROBE') return undefined;

  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) {
    sendResponse({ ok: false, error: 'no-tab' });
    return undefined;
  }

  ext.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: probeFrameworkInPage,
    args: [String(message.marker || '')]
  }).then((results) => {
    const result = results && results[0] ? results[0].result : null;
    sendResponse({ ok: true, data: result || null });
  }).catch((err) => {
    sendResponse({ ok: false, error: String((err && err.message) || err) });
  });

  return true; // 异步响应
});

ext.runtime.onInstalled.addListener(() => {
  console.info('[ElementNote] 已安装。按 Alt+Shift+C 或点击工具栏图标开始批注。');
});

/* 仅用于让静态检查工具知道 PROBE_ATTR 被页面注入函数复用 */
void PROBE_ATTR;
