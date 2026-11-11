'use strict';

/**
 * ElementNote content script
 * - 元素拾取：悬停高亮 + 点击选中（类似 DevTools 的 Ctrl+Shift+C）
 * - 批注 UI：Shadow DOM 隔离，不污染页面样式
 * - 定位信息：URL / 视口 / 选择器 / XPath / 坐标 / 文本 / 属性 / 计算样式 / 组件栈
 * - 提示词：一键复制，供粘贴给 AI
 */
(function () {
  if (window.__elementNoteInjected) return;
  window.__elementNoteInjected = true;

  // Firefox 暴露 Promise 风格的 browser.*；Chrome/Edge 只有 chrome.*
  var ext = (typeof browser !== 'undefined' && browser && browser.runtime) ? browser : chrome;

  var STORAGE_PREFIX = 'annotations.v1::';
  var HOST_ID = 'elementnote-root';
  // Firefox 的 content script 里 window 与 globalThis 可能不是同一个对象
  var PROMPT_LIB = (typeof globalThis !== 'undefined' && globalThis.ElementNotePrompt) ||
    (window.ElementNotePrompt || null);
  var Z_INDEX = 2147483647;
  var BLOCK_TYPES = [
    'mousedown', 'pointerdown', 'mouseup', 'pointerup',
    'dblclick', 'auxclick', 'contextmenu', 'dragstart', 'selectstart'
  ];

  var active = false;
  var annotations = [];
  var hoverEl = null;
  var pendingEl = null;
  var editing = null;
  var panelOpen = false;
  var modalOpen = false;
  var toolbarDismissed = false;
  var savePending = false;
  var clearArmed = false;
  var clearTimer = 0;
  var toastTimer = 0;
  var flashTimer = 0;
  var hoverRaf = 0;
  var positionRaf = 0;
  var lastPointer = null;
  var urlTimer = 0;
  var lastUrlKey = '';
  var badgeViews = [];
  var host = null;
  var shadow = null;
  var els = {};
  var cursorSheet = null;
  var positionTimer = 0;

  var CSS = [
    ':host {',
    '  --en-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;',
    '  --en-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;',
    '  --en-bg: #ffffff;',
    '  --en-bg-soft: #f8fafc;',
    '  --en-ink: #0f172a;',
    '  --en-muted: #64748b;',
    '  --en-faint: #94a3b8;',
    '  --en-border: rgba(15, 23, 42, 0.10);',
    '  --en-border-strong: rgba(15, 23, 42, 0.16);',
    '  --en-hover: #f1f5f9;',
    '  --en-primary: #4f7cff;',
    '  --en-primary-hover: #3b63e6;',
    '  --en-accent-soft: #eef2ff;',
    '  --en-accent-ink: #4338ca;',
    '  --en-danger: #dc2626;',
    '  all: initial;',
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :host {',
    '    --en-bg: #111827;',
    '    --en-bg-soft: #0b1220;',
    '    --en-ink: #e2e8f0;',
    '    --en-muted: #94a3b8;',
    '    --en-faint: #64748b;',
    '    --en-border: rgba(255, 255, 255, 0.13);',
    '    --en-border-strong: rgba(255, 255, 255, 0.2);',
    '    --en-hover: rgba(255, 255, 255, 0.07);',
    '    --en-accent-soft: rgba(79, 124, 255, 0.18);',
    '    --en-accent-ink: #c7d2fe;',
    '    --en-danger: #f87171;',
    '  }',
    '}',
    '*, *::before, *::after { box-sizing: border-box; }',
    '[hidden] { display: none !important; }',
    '.en-overlay { position: absolute; z-index: 1; border: 1.5px solid var(--en-primary);',
    '  background: rgba(79, 124, 255, 0.12); border-radius: 3px; pointer-events: none;',
    '  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.55); }',
    '.en-size { position: absolute; z-index: 2; max-width: min(420px, 80vw); background: #0f172a;',
    '  color: #f8fafc; font: 500 11px/1.5 var(--en-font); padding: 3px 8px; border-radius: 6px;',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;',
    '  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.28); }',
    '.en-badges { position: absolute; inset: 0; z-index: 3; pointer-events: none; }',
    '.en-badge { position: absolute; width: 22px; height: 22px; margin: -10px 0 0 -10px; border-radius: 999px;',
    '  border: 2px solid #ffffff; background: linear-gradient(135deg, #4f7cff, #7c3aed); color: #fff;',
    '  font: 700 11px/18px var(--en-font); display: flex; align-items: center; justify-content: center;',
    '  padding: 0; cursor: pointer; pointer-events: auto; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.35);',
    '  transition: transform 0.12s ease; }',
    '.en-badge:hover { transform: scale(1.16); }',
    '.en-hint { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 4;',
    '  display: flex; align-items: center; gap: 6px; max-width: calc(100vw - 24px); white-space: nowrap;',
    '  background: #0f172a; color: #e2e8f0; font: 500 12px/1.4 var(--en-font); padding: 7px 12px;',
    '  border-radius: 999px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.3); pointer-events: none; }',
    '.en-pulse { width: 7px; height: 7px; border-radius: 999px; background: #4ade80;',
    '  box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.6); animation: en-pulse 1.8s infinite; flex: 0 0 auto; }',
    '@keyframes en-pulse {',
    '  0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.55); }',
    '  70% { box-shadow: 0 0 0 7px rgba(74, 222, 128, 0); }',
    '  100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }',
    '}',
    '.en-kbd { border: 1px solid rgba(255, 255, 255, 0.28); background: rgba(255, 255, 255, 0.09);',
    '  border-radius: 4px; padding: 0 5px; font-size: 10px; font-weight: 600; line-height: 1.6; }',
    '.en-toolbar { position: absolute; right: 16px; bottom: 16px; z-index: 5; display: flex; align-items: center;',
    '  gap: 6px; max-width: calc(100vw - 24px); padding: 7px 8px 7px 10px; background: var(--en-bg);',
    '  color: var(--en-ink); border: 1px solid var(--en-border); border-radius: 14px; pointer-events: auto;',
    '  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.2); font: 500 12px/1.4 var(--en-font); }',
    '.en-toolbar.en-active { border-color: rgba(79, 124, 255, 0.5);',
    '  box-shadow: 0 0 0 3px rgba(79, 124, 255, 0.12), 0 12px 34px rgba(15, 23, 42, 0.2); }',
    '.en-logo { width: 22px; height: 22px; flex: 0 0 auto; border-radius: 7px;',
    '  background: linear-gradient(135deg, #4f7cff, #7c3aed); color: #fff; text-align: center;',
    '  font: 800 9px/22px var(--en-font); letter-spacing: 0.02em; }',
    '.en-toolbar-text { color: var(--en-muted); }',
    '.en-count { min-width: 20px; padding: 1px 6px; border-radius: 999px; background: var(--en-accent-soft);',
    '  color: var(--en-accent-ink); font-weight: 700; text-align: center; }',
    '.en-sep { width: 1px; height: 18px; background: var(--en-border); flex: 0 0 auto; }',
    '.en-btn { appearance: none; border: 1px solid var(--en-border-strong); background: var(--en-bg);',
    '  color: var(--en-ink); border-radius: 8px; padding: 5px 9px; font: 600 11px/1.2 var(--en-font);',
    '  cursor: pointer; white-space: nowrap; }',
    '.en-btn:hover { background: var(--en-hover); }',
    '.en-btn:disabled { opacity: 0.45; cursor: default; }',
    '.en-btn-primary { background: var(--en-primary); border-color: var(--en-primary); color: #fff; }',
    '.en-btn-primary:hover { background: var(--en-primary-hover); }',
    '.en-btn-ghost { border-color: transparent; background: transparent; color: var(--en-muted); }',
    '.en-btn-ghost:hover { background: var(--en-hover); color: var(--en-ink); }',
    '.en-btn-danger { border-color: transparent; background: transparent; color: var(--en-danger); }',
    '.en-x { appearance: none; border: 0; background: transparent; color: var(--en-faint);',
    '  width: 24px; height: 24px; border-radius: 6px; font: 400 18px/1 var(--en-font); cursor: pointer; padding: 0; flex: 0 0 auto; }',
    '.en-x:hover { background: var(--en-hover); color: var(--en-ink); }',
    '.en-panel { position: absolute; z-index: 6; width: 352px; max-width: calc(100vw - 24px);',
    '  max-height: calc(100vh - 24px); display: flex; flex-direction: column; gap: 9px; padding: 12px;',
    '  background: var(--en-bg); color: var(--en-ink); border: 1px solid var(--en-border); border-radius: 14px;',
    '  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.24); pointer-events: auto; font: 400 13px/1.5 var(--en-font); }',
    '.en-panel-head { display: flex; align-items: flex-start; gap: 8px; }',
    '.en-panel-title { font: 700 13px/1.4 var(--en-font); }',
    '.en-panel-target { margin-top: 2px; max-width: 280px; color: var(--en-muted);',
    '  font: 500 11px/1.4 var(--en-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.en-panel-x { margin-left: auto; }',
    '.en-panel textarea { width: 100%; min-height: 96px; max-height: 260px; resize: vertical;',
    '  border: 1px solid var(--en-border-strong); border-radius: 9px; padding: 9px 10px;',
    '  background: var(--en-bg-soft); color: var(--en-ink); outline: none;',
    '  font: 400 13px/1.6 var(--en-font); }',
    '.en-panel textarea:focus { border-color: var(--en-primary); background: var(--en-bg);',
    '  box-shadow: 0 0 0 3px rgba(79, 124, 255, 0.14); }',
    '.en-panel.en-shake { animation: en-shake 0.28s ease; }',
    '@keyframes en-shake {',
    '  0%, 100% { transform: translateX(0); }',
    '  30% { transform: translateX(-5px); }',
    '  60% { transform: translateX(5px); }',
    '}',
    '.en-panel-tip { display: flex; justify-content: space-between; gap: 8px; color: var(--en-faint);',
    '  font: 400 10px/1.4 var(--en-font); }',
    '.en-panel-tip b { color: var(--en-muted); font-weight: 600; }',
    '.en-panel-actions { display: flex; align-items: center; gap: 6px; }',
    '.en-spacer { flex: 1; }',
    '.en-toast { position: absolute; left: 50%; bottom: 82px; transform: translateX(-50%); z-index: 8;',
    '  max-width: calc(100vw - 32px); padding: 9px 14px; border-radius: 10px; background: #0f172a;',
    '  color: #f8fafc; font: 500 12px/1.5 var(--en-font); text-align: center;',
    '  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.3); pointer-events: none; animation: en-toast-in 0.18s ease; }',
    '.en-toast.en-error { background: #b91c1c; }',
    '@keyframes en-toast-in { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }',
    '.en-modal { position: absolute; inset: 0; z-index: 9; display: flex; align-items: center; justify-content: center;',
    '  padding: 24px; background: rgba(15, 23, 42, 0.38); backdrop-filter: blur(2px); pointer-events: auto; }',
    '.en-modal-card { width: min(760px, 100%); height: min(72vh, 640px); display: flex; flex-direction: column;',
    '  gap: 10px; padding: 14px; background: var(--en-bg); color: var(--en-ink); border-radius: 16px;',
    '  box-shadow: 0 30px 90px rgba(15, 23, 42, 0.4); font: 400 13px/1.5 var(--en-font); }',
    '.en-modal-head { display: flex; align-items: flex-start; gap: 8px; }',
    '.en-modal-title { font: 700 14px/1.4 var(--en-font); }',
    '.en-modal-sub { margin-top: 2px; color: var(--en-faint); font: 400 11px/1.4 var(--en-font); }',
    '.en-modal-card textarea { flex: 1; width: 100%; resize: none; border: 1px solid var(--en-border);',
    '  border-radius: 10px; background: var(--en-bg-soft); color: var(--en-ink); padding: 10px 12px;',
    '  font: 400 12px/1.6 var(--en-mono); outline: none; }',
    '.en-modal-card textarea:focus { border-color: var(--en-primary); background: var(--en-bg); }',
    '.en-modal-actions { display: flex; align-items: center; gap: 8px; }',
    '.en-modal-hint { color: var(--en-faint); font-size: 11px; }',
    '.en-flash { position: absolute; z-index: 2; border: 2px solid #f59e0b; background: rgba(245, 158, 11, 0.14);',
    '  border-radius: 4px; pointer-events: none; animation: en-flash 1.35s ease-out; }',
    '.en-shield { position: absolute; inset: 0; z-index: 0; background: transparent; pointer-events: auto; }',
    '@keyframes en-flash {',
    '  0% { opacity: 1; transform: scale(1); }',
    '  65% { opacity: 1; }',
    '  100% { opacity: 0; transform: scale(1.015); }',
    '}'
  ].join('\n');

  var MARKUP = [
    '<div class="en-shield" id="enShield" hidden></div>',
    '<div class="en-overlay" id="enOverlay" hidden></div>',
    '<div class="en-size" id="enSize" hidden></div>',
    '<div class="en-badges" id="enBadges"></div>',
    '<div class="en-hint" id="enHint" hidden>',
    '  <span class="en-pulse"></span>',
    '  <span>点击元素添加批注</span>',
    '  <span class="en-kbd">C</span><span>复制提示词</span>',
    '  <span class="en-kbd">Esc</span><span>退出</span>',
    '</div>',
    '<div class="en-toolbar" id="enToolbar" hidden>',
    '  <span class="en-logo">EN</span>',
    '  <span class="en-toolbar-text" id="enToolbarText">元素批注</span>',
    '  <span class="en-count" id="enCount">0</span>',
    '  <span class="en-sep"></span>',
    '  <button class="en-btn en-btn-primary" id="enCopy" data-act="copy" type="button">复制提示词</button>',
    '  <button class="en-btn" id="enPreview" data-act="preview" type="button">预览</button>',
    '  <button class="en-btn" id="enActivate" data-act="activate" type="button" hidden>继续批注</button>',
    '  <button class="en-btn en-btn-ghost" id="enClear" data-act="clear" type="button">清空</button>',
    '  <button class="en-x" id="enDismiss" data-act="close" type="button" title="退出">×</button>',
    '</div>',
    '<div class="en-panel" id="enPanel" hidden>',
    '  <div class="en-panel-head">',
    '    <div>',
    '      <div class="en-panel-title" id="enPanelTitle">添加批注</div>',
    '      <div class="en-panel-target" id="enPanelTarget"></div>',
    '    </div>',
    '    <button class="en-x en-panel-x" data-act="cancel" type="button" title="取消">×</button>',
    '  </div>',
    '  <textarea id="enNote" maxlength="2000" placeholder="描述问题或期望，例如：这个按钮偏大，和右侧间距不一致，改成 40px 高"></textarea>',
    '  <div class="en-panel-tip">',
    '    <span><b>Enter</b> 保存 · <b>Shift+Enter</b> 换行 · <b>Esc</b> 取消</span>',
    '    <span id="enCharCount">0/2000</span>',
    '  </div>',
    '  <div class="en-panel-actions">',
    '    <button class="en-btn en-btn-danger" id="enDelete" data-act="delete" type="button" hidden>删除</button>',
    '    <span class="en-spacer"></span>',
    '    <button class="en-btn" data-act="cancel" type="button">取消</button>',
    '    <button class="en-btn en-btn-primary" id="enSave" data-act="save" type="button">保存批注</button>',
    '  </div>',
    '</div>',
    '<div class="en-toast" id="enToast" hidden></div>',
    '<div class="en-modal" id="enModal" hidden>',
    '  <div class="en-modal-card">',
    '    <div class="en-modal-head">',
    '      <div>',
    '        <div class="en-modal-title">提示词预览</div>',
    '        <div class="en-modal-sub">可直接编辑后再复制；此处的改动不会保存回批注</div>',
    '      </div>',
    '      <button class="en-x" data-act="modal-close" type="button" title="关闭" style="margin-left:auto">×</button>',
    '    </div>',
    '    <textarea id="enPromptText" spellcheck="false"></textarea>',
    '    <div class="en-modal-actions">',
    '      <span class="en-modal-hint" id="enPromptMeta"></span>',
    '      <span class="en-spacer"></span>',
    '      <button class="en-btn" data-act="modal-close" type="button">关闭</button>',
    '      <button class="en-btn en-btn-primary" id="enModalCopy" data-act="modal-copy" type="button">复制</button>',
    '    </div>',
    '  </div>',
    '</div>',
    '<div class="en-flash" id="enFlash" hidden></div>'
  ].join('\n');

  /* ============================== 基础工具 ============================== */

  function normalizeUrl(raw) {
    if (PROMPT_LIB) return PROMPT_LIB.normalizeUrl(raw);
    try {
      var u = new URL(String(raw || ''));
      u.hash = '';
      return u.href;
    } catch (e) {
      return String(raw || '').split('#')[0];
    }
  }

  function byCreated(a, b) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  function storageKeyFor(urlKey) {
    return STORAGE_PREFIX + urlKey;
  }

  function sortedAnnotations() {
    return annotations.slice().sort(byCreated);
  }

  function truncate(value, max) {
    var s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + '…';
  }

  function cssEscape(value) {
    var s = String(value);
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
    return s.replace(/([^\w-])/g, '\\$1');
  }

  function cssString(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function validClass(name) {
    if (!name || name.length > 48) return false;
    if (!/^[A-Za-z_][\w-]*$/.test(name)) return false;
    if (/^(css|sc|jsx)-[a-z0-9]+$/i.test(name)) return false;
    return true;
  }

  function isUiEvent(event) {
    if (!host) return false;
    try {
      if (typeof event.composedPath === 'function') {
        var path = event.composedPath();
        if (path && path.indexOf(host) !== -1) return true;
      }
    } catch (e) { /* ignore */ }
    var target = event.target;
    // Firefox 中 event.target 可能是 Window，直接 contains() 会抛 TypeError
    if (!target || typeof target.nodeType !== 'number') return false;
    return target === host || host.contains(target);
  }

  function describeEl(el) {
    if (!el || !el.tagName) return '';
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    try {
      var cls = Array.prototype.slice.call(el.classList || []).filter(validClass).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
    } catch (e) { /* ignore */ }
    return s;
  }

  function toast(message, type) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.toggle('en-error', type === 'error');
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.hidden = true;
      toastTimer = 0;
    }, 2600);
  }

  /* ============================== UI 构建 ============================== */

  function buildUI() {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-elementnote-root', '');
    host.style.cssText = 'all: initial; display: block; position: fixed; inset: 0; ' +
      'z-index: ' + Z_INDEX + '; pointer-events: none; overflow: hidden; cursor: default;';

    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = MARKUP;
    // constructable stylesheet 不受页面 CSP 的 style-src 限制
    try {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      shadow.adoptedStyleSheets = [sheet];
    } catch (e) {
      var styleEl = document.createElement('style');
      styleEl.textContent = CSS;
      shadow.insertBefore(styleEl, shadow.firstChild);
    }
    document.documentElement.appendChild(host);

    els.overlay = shadow.getElementById('enOverlay');
    els.shield = shadow.getElementById('enShield');
    els.size = shadow.getElementById('enSize');
    els.badges = shadow.getElementById('enBadges');
    els.hint = shadow.getElementById('enHint');
    els.toolbar = shadow.getElementById('enToolbar');
    els.toolbarText = shadow.getElementById('enToolbarText');
    els.count = shadow.getElementById('enCount');
    els.copyBtn = shadow.getElementById('enCopy');
    els.previewBtn = shadow.getElementById('enPreview');
    els.activateBtn = shadow.getElementById('enActivate');
    els.clearBtn = shadow.getElementById('enClear');
    els.dismissBtn = shadow.getElementById('enDismiss');
    els.panel = shadow.getElementById('enPanel');
    els.panelTitle = shadow.getElementById('enPanelTitle');
    els.panelTarget = shadow.getElementById('enPanelTarget');
    els.noteInput = shadow.getElementById('enNote');
    els.charCount = shadow.getElementById('enCharCount');
    els.deleteBtn = shadow.getElementById('enDelete');
    els.saveBtn = shadow.getElementById('enSave');
    els.toast = shadow.getElementById('enToast');
    els.modal = shadow.getElementById('enModal');
    els.promptText = shadow.getElementById('enPromptText');
    els.promptMeta = shadow.getElementById('enPromptMeta');
    els.modalCopy = shadow.getElementById('enModalCopy');
    els.flash = shadow.getElementById('enFlash');

    // 页面/页面内嵌脚本的键盘、鼠标监听不应看到我们 UI 里的事件
    ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
      'click', 'dblclick', 'auxclick', 'contextmenu', 'mousemove', 'wheel',
      'input', 'change', 'focusin', 'focusout'].forEach(function (type) {
      host.addEventListener(type, function (event) {
        event.stopPropagation();
      }, false);
    });

    bindUiEvents();
  }

  function bindUiEvents() {
    els.shield.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (panelOpen) closePanel();
    });

    els.toolbar.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'copy') copyPrompt();
      else if (act === 'preview') openPromptModal();
      else if (act === 'activate') activate();
      else if (act === 'clear') handleClear();
      else if (act === 'close') dismissToolbar();
    });

    els.panel.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'save') saveNote();
      else if (act === 'cancel') closePanel();
      else if (act === 'delete') deleteEditing();
    });

    els.noteInput.addEventListener('keydown', function (event) {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        saveNote();
      }
    });

    els.noteInput.addEventListener('input', updateCharCount);

    els.modal.addEventListener('click', function (event) {
      if (event.target === els.modal) {
        closePromptModal();
        return;
      }
      var btn = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'modal-close') closePromptModal();
      else if (act === 'modal-copy') copyModalPrompt();
    });

    els.promptText.addEventListener('input', function () {
      els.promptMeta.textContent = annotations.length + ' 条批注 · ' + els.promptText.value.length + ' 字符';
    });

    els.modal.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePromptModal();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        copyModalPrompt();
      }
    });
  }

  function updateCharCount() {
    if (!els.charCount) return;
    els.charCount.textContent = String(els.noteInput.value.length) + '/2000';
  }

  /* ============================== 拾取器 ============================== */

  function pageElementAt(x, y) {
    var el = deepHitElement(x, y);
    if (!el) return null;
    if (isOwnUi(el)) return null;
    if (el.nodeType !== 1) return null;
    if (el === document.documentElement) return document.body || el;
    var frame = iframeAtPoint(x, y, el);
    if (frame) return frame;
    return el;
  }

  // iframe 被设为 pointer-events:none 后，elementFromPoint 会穿透到外层容器；
  // 用几何命中把 iframe 元素本身找回来，这样至少能批注 iframe 容器。
  function iframeAtPoint(x, y, hitEl) {
    try {
      var frames = document.querySelectorAll('iframe');
      for (var i = frames.length - 1; i >= 0; i--) {
        var frame = frames[i];
        var rect = frame.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
        if (hitEl && hitEl !== frame && !(hitEl.contains && hitEl.contains(frame))) continue;
        return frame;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function isOwnUi(el) {
    if (!el) return false;
    if (el === host || (host && host.contains(el))) return true;
    try {
      var root = el.getRootNode && el.getRootNode();
      return !!(root && root.host === host);
    } catch (e) {
      return false;
    }
  }

  function deepHitElement(x, y) {
    var el = null;
    try {
      el = document.elementFromPoint(x, y);
    } catch (e) {
      return null;
    }
    var guard = 0;
    // document.elementFromPoint 只返回 shadow host；逐层进入 open shadow root 才能选中内部元素
    while (el && el.shadowRoot && guard++ < 8) {
      if (el === host) break;
      try {
        if (el.getRootNode() === shadow) break;
      } catch (e) {
        break;
      }
      var inner = null;
      try {
        inner = el.shadowRoot.elementFromPoint(x, y);
      } catch (e) {
        break;
      }
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  function onPointerMove(event) {
    if (!active) return;
    if (isUiEvent(event)) {
      hideOverlay();
      return;
    }
    lastPointer = { x: event.clientX, y: event.clientY };
    if (!hoverRaf) {
      hoverRaf = requestAnimationFrame(function () {
        hoverRaf = 0;
        if (!active || !lastPointer) return;
        var el = pageElementAt(lastPointer.x, lastPointer.y);
        if (!el) {
          hoverEl = null;
          hideOverlay();
          return;
        }
        hoverEl = el;
        placeOverlay(el);
      });
    }
  }

  function onClick(event) {
    if (!active) return;
    if (isUiEvent(event)) return;
    var el = null;
    try {
      el = pageElementAt(event.clientX, event.clientY);
    } catch (e) { /* ignore */ }
    if (!el) el = hoverEl;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!el) return;
    hoverEl = el;
    placeOverlay(el);
    openPanel(el, null);
  }

  function onBlock(event) {
    if (!active) return;
    if (isUiEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function bindPicker(on) {
    var method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('pointermove', onPointerMove, true);
    window[method]('mousemove', onPointerMove, true);
    window[method]('click', onClick, true);
    BLOCK_TYPES.forEach(function (type) {
      window[method](type, onBlock, true);
    });
  }

  function placeOverlay(el) {
    if (!el || !el.isConnected) {
      hideOverlay();
      return;
    }
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) {
      hideOverlay();
      return;
    }
    var left = Math.max(0, rect.left);
    var top = Math.max(0, rect.top);
    els.overlay.hidden = false;
    els.overlay.style.left = left + 'px';
    els.overlay.style.top = top + 'px';
    els.overlay.style.width = Math.max(0, rect.width) + 'px';
    els.overlay.style.height = Math.max(0, rect.height) + 'px';

    els.size.hidden = false;
    els.size.textContent = describeEl(el) + ' · ' + Math.round(rect.width) + '×' + Math.round(rect.height);
    var labelTop = top - 25;
    if (labelTop < 4) labelTop = Math.min(top + 4, window.innerHeight - 26);
    var labelWidth = els.size.offsetWidth || 160;
    // +14 让开元素左上角的批注徽标，避免遮住标签第一个字符
    var labelLeft = Math.min(Math.max(4, rect.left + 14), Math.max(4, window.innerWidth - labelWidth - 8));
    els.size.style.left = Math.round(labelLeft) + 'px';
    els.size.style.top = Math.round(labelTop) + 'px';
  }

  function hideOverlay() {
    if (els.overlay) els.overlay.hidden = true;
    if (els.size) els.size.hidden = true;
  }

  function activate() {
    if (active) return;
    active = true;
    toolbarDismissed = false;
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      try { document.activeElement.blur(); } catch (e) { /* ignore */ }
    }
    bindPicker(true);
    setPageCursor(true);
    els.hint.hidden = false;
    hideOverlay();
    syncToolbar();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    bindPicker(false);
    setPageCursor(false);
    els.hint.hidden = true;
    hoverEl = null;
    hideOverlay();
    closePanel();
    syncToolbar();
  }

  function dismissToolbar() {
    toolbarDismissed = true;
    if (active) deactivate();
    syncToolbar();
  }

  function setPageCursor(on) {
    var styleId = 'elementnote-cursor-style';
    var css = 'html, body, body * { cursor: crosshair !important; } iframe { pointer-events: none !important; }';
    if (on) {
      if (cursorSheet) return;
      try {
        cursorSheet = new CSSStyleSheet();
        cursorSheet.replaceSync(css);
        document.adoptedStyleSheets = Array.prototype.slice.call(document.adoptedStyleSheets).concat([cursorSheet]);
        return;
      } catch (e) {
        cursorSheet = null;
      }
      if (!document.getElementById(styleId)) {
        var style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
      }
    } else {
      if (cursorSheet) {
        try {
          document.adoptedStyleSheets = Array.prototype.slice.call(document.adoptedStyleSheets).filter(function (sheet) {
            return sheet !== cursorSheet;
          });
        } catch (e) { /* ignore */ }
        cursorSheet = null;
      }
      var styleEl = document.getElementById(styleId);
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    }
  }

  /* ============================== 批注面板 ============================== */

  function openPanel(el, ann) {
    if (!el) return;
    pendingEl = el;
    editing = ann || null;
    panelOpen = true;
    els.panel.hidden = false;
    // 编辑时盖一层透明遮罩：让鼠标不再悬停在页面元素上，
    // 避免采集到的计算样式混入 :hover 的值
    els.shield.hidden = false;
    els.panelTitle.textContent = ann ? '编辑批注 #' + (sortedAnnotations().indexOf(ann) + 1) : '添加批注';
    els.panelTarget.textContent = describeEl(el);
    var selectorPreview = '';
    try {
      selectorPreview = buildSelector(el);
    } catch (e) { /* ignore */ }
    els.panelTarget.title = (ann && ann.target && ann.target.selector) || selectorPreview || describeEl(el);
    els.noteInput.value = ann ? ann.note : '';
    els.deleteBtn.hidden = !ann;
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = '保存批注';
    updateCharCount();
    positionPanel(el);
    placeOverlay(el);
    requestAnimationFrame(function () { positionPanel(el); });
    els.noteInput.focus();
    try {
      var len = els.noteInput.value.length;
      els.noteInput.setSelectionRange(len, len);
    } catch (e) { /* ignore */ }
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    pendingEl = null;
    editing = null;
    els.panel.hidden = true;
    els.shield.hidden = true;
    els.noteInput.value = '';
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = '保存批注';
    els.noteInput.blur();
  }

  function positionPanel(el) {
    if (!panelOpen || !el) return;
    var rect = el.getBoundingClientRect();
    var margin = 12;
    var panelWidth = els.panel.offsetWidth || 352;
    var panelHeight = els.panel.offsetHeight || 260;
    var left = rect.right + margin;
    if (left + panelWidth > window.innerWidth - 8) left = rect.left - panelWidth - margin;
    if (left < 8) left = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, rect.left));
    var top = rect.top;
    if (top + panelHeight > window.innerHeight - 8) top = window.innerHeight - panelHeight - 8;
    if (top < 8) top = 8;
    els.panel.style.left = Math.round(Math.max(8, left)) + 'px';
    els.panel.style.top = Math.round(top) + 'px';
  }

  function shakePanel() {
    els.panel.classList.remove('en-shake');
    void els.panel.offsetWidth;
    els.panel.classList.add('en-shake');
    setTimeout(function () { els.panel.classList.remove('en-shake'); }, 340);
  }

  async function saveNote() {
    if (savePending) return;
    var text = els.noteInput.value.trim();
    if (!text) {
      shakePanel();
      els.noteInput.focus();
      toast('先写一句批注内容再保存', 'error');
      return;
    }
    if (!editing && (!pendingEl || !pendingEl.isConnected)) {
      toast('元素已不在页面上，请重新选择', 'error');
      return;
    }
    savePending = true;
    els.saveBtn.disabled = true;
    els.saveBtn.textContent = '保存中…';
    try {
      if (editing) {
        var index = -1;
        for (var i = 0; i < annotations.length; i++) {
          if (annotations[i].id === editing.id) {
            index = i;
            break;
          }
        }
        if (index === -1) throw new Error('批注已不存在，请重新打开弹窗');
        var updated = Object.assign({}, annotations[index], {
          note: text,
          updatedAt: new Date().toISOString()
        });
        var updatedList = annotations.slice();
        updatedList[index] = updated;
        await persistAnnotations(updatedList);
        annotations = updatedList;
        renderBadges();
        closePanel();
        toast('批注已更新');
      } else {
        var ann = await buildAnnotation(pendingEl, text);
        var next = annotations.concat([ann]);
        // 先持久化成功，再更新内存，避免失败后重试重复追加
        await persistAnnotations(next);
        annotations = next;
        renderBadges();
        closePanel();
        toast('已添加批注 #' + sortedAnnotations().length + ' · 按 C 复制提示词');
      }
    } catch (err) {
      toast('保存失败：' + ((err && err.message) || '未知错误'), 'error');
    } finally {
      savePending = false;
      els.saveBtn.disabled = false;
      els.saveBtn.textContent = '保存批注';
    }
  }

  async function deleteEditing() {
    if (!editing) return;
    var id = editing.id;
    var next = annotations.filter(function (a) { return a.id !== id; });
    try {
      await persistAnnotations(next);
      annotations = next;
    } catch (e) {
      toast('删除失败，请重试', 'error');
      return;
    }
    renderBadges();
    closePanel();
    toast('批注已删除');
  }

  /* ============================== 徽标 ============================== */

  function resolveSelectorDeep(selector) {
    var parts = String(selector || '').split(' >> ');
    var root = document;
    var current = null;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) return null;
      try {
        current = root.querySelector(part);
      } catch (e) {
        return null;
      }
      if (!current) return null;
      if (i < parts.length - 1) {
        if (!current.shadowRoot) return null;
        root = current.shadowRoot;
      }
    }
    return current;
  }

  function resolveTarget(ann) {
    var t = (ann && ann.target) || {};
    if (t.id) {
      try {
        var byId = document.getElementById(t.id);
        if (byId) return byId;
      } catch (e) { /* ignore */ }
    }
    if (t.selector) {
      var bySelector = resolveSelectorDeep(t.selector);
      if (bySelector) return bySelector;
    }
    if (t.xpath) {
      try {
        var result = document.evaluate(t.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue && result.singleNodeValue.nodeType === 1) return result.singleNodeValue;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  function renderBadges() {
    if (!els.badges) return;
    els.badges.textContent = '';
    badgeViews = [];
    var sorted = sortedAnnotations();
    sorted.forEach(function (ann, index) {
      var el = resolveTarget(ann);
      if (!el) return;
      var badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'en-badge';
      badge.textContent = String(index + 1);
      badge.title = ann.note;
      badge.setAttribute('aria-label', '批注 ' + (index + 1) + '：' + truncate(ann.note, 40));
      badge.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openPanel(el, ann);
      });
      els.badges.appendChild(badge);
      badgeViews.push({ ann: ann, el: el, node: badge });
    });
    syncToolbar();
    positionBadges();
    ensurePositionTimer();
  }

  // 只在页面存在批注徽标时才轮询定位，避免空闲页面常驻定时器
  function ensurePositionTimer() {
    if (badgeViews.length && !positionTimer) {
      positionTimer = setInterval(schedulePosition, 1200);
    } else if (!badgeViews.length && positionTimer) {
      clearInterval(positionTimer);
      positionTimer = 0;
    }
  }

  function positionBadges() {
    badgeViews.forEach(function (view) {
      var el = view.el;
      if (!el || !el.isConnected) {
        view.node.style.display = 'none';
        return;
      }
      var rect = el.getBoundingClientRect();
      var visible = rect.width > 0 && rect.height > 0 &&
        rect.bottom > 0 && rect.right > 0 &&
        rect.top < window.innerHeight && rect.left < window.innerWidth;
      if (!visible) {
        view.node.style.display = 'none';
        return;
      }
      view.node.style.display = '';
      view.node.style.left = Math.round(rect.left) + 'px';
      view.node.style.top = Math.round(rect.top) + 'px';
    });
  }

  function schedulePosition() {
    if (positionRaf) return;
    positionRaf = requestAnimationFrame(function () {
      positionRaf = 0;
      positionBadges();
      if (panelOpen) {
        var el = pendingEl || (editing ? resolveTarget(editing) : null);
        if (el) positionPanel(el);
      }
      if (active && hoverEl && hoverEl.isConnected) placeOverlay(hoverEl);
    });
  }

  /* ============================== 定位信息采集 ============================== */

  function isUniqueSelector(selector, el) {
    try {
      var list = document.querySelectorAll(selector);
      return list.length === 1 && list[0] === el;
    } catch (e) {
      return false;
    }
  }

  function isInShadow(el) {
    try {
      return !!(el.getRootNode && el.getRootNode() instanceof ShadowRoot);
    } catch (e) {
      return false;
    }
  }

  function segmentFor(node) {
    var tag = (node.tagName || '').toLowerCase();
    if (!tag) return '';
    var segment = tag;
    if (node.id) segment += '#' + cssEscape(node.id);
    try {
      var cls = Array.prototype.slice.call(node.classList || []).filter(validClass).slice(0, 2);
      if (cls.length) segment += cls.map(function (c) { return '.' + cssEscape(c); }).join('');
    } catch (e) { /* ignore */ }
    var parent = node.parentElement;
    if (parent) {
      try {
        var sameTag = Array.prototype.filter.call(parent.children, function (child) {
          return child.tagName === node.tagName;
        });
        if (sameTag.length > 1) {
          segment += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
        }
      } catch (e) { /* ignore */ }
    }
    return segment;
  }

  function pathWithinRoot(el, root) {
    var segments = [];
    var node = el;
    var guard = 0;
    while (node && node !== root && guard++ < 20) {
      segments.unshift(segmentFor(node));
      node = node.parentElement;
    }
    return segments.join(' > ');
  }

  function buildShadowSelector(el) {
    var root = el.getRootNode();
    if (!(root instanceof ShadowRoot)) return '';
    var hostEl = root.host;
    var hostSelector = buildSelector(hostEl);
    return hostSelector + ' >> ' + pathWithinRoot(el, root);
  }

  function relativePath(ancestor, el) {
    var segments = [];
    var node = el;
    var guard = 0;
    while (node && node !== ancestor && guard++ < 20) {
      segments.unshift(segmentFor(node));
      node = node.parentElement;
    }
    return segments.join(' > ');
  }

  function fullPath(el) {
    var segments = [];
    var node = el;
    var guard = 0;
    while (node && node.nodeType === 1 && guard++ < 20) {
      segments.unshift(segmentFor(node));
      if (node === document.body) break;
      node = node.parentElement;
    }
    return segments.join(' > ');
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (isInShadow(el)) return buildShadowSelector(el);

    try {
      if (el.id) {
        var idSelector = '#' + cssEscape(el.id);
        if (isUniqueSelector(idSelector, el)) return idSelector;
      }
    } catch (e) { /* ignore */ }

    var candidates = [];

    var attrNames = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy', 'data-id'];
    for (var i = 0; i < attrNames.length; i++) {
      var value = el.getAttribute(attrNames[i]);
      if (value && value.length <= 60) {
        var attrSelector = '[' + attrNames[i] + '="' + cssString(value) + '"]';
        if (isUniqueSelector(attrSelector, el)) {
          candidates.push(attrSelector);
          break;
        }
      }
    }

    try {
      var classNames = Array.prototype.slice.call(el.classList || []).filter(validClass);
      for (var j = 0; j < classNames.length && j < 3; j++) {
        var classSelector = '.' + cssEscape(classNames[j]);
        if (isUniqueSelector(classSelector, el)) {
          candidates.push(classSelector);
          break;
        }
      }
    } catch (e) { /* ignore */ }

    var ancestor = el.parentElement;
    while (ancestor && ancestor.nodeType === 1) {
      if (ancestor.id) {
        var ancestorSelector = '#' + cssEscape(ancestor.id);
        if (isUniqueSelector(ancestorSelector, ancestor)) {
          var combo = ancestorSelector + ' ' + relativePath(ancestor, el);
          if (combo !== ancestorSelector + ' ' && isUniqueSelector(combo, el)) candidates.push(combo);
        }
        break;
      }
      ancestor = ancestor.parentElement;
    }

    var segments = [];
    var node = el;
    var guard = 0;
    while (node && node.nodeType === 1 && guard++ < 20) {
      segments.unshift(segmentFor(node));
      var chain = segments.join(' > ');
      if (isUniqueSelector(chain, el)) {
        candidates.push(chain);
        break;
      }
      if (node === document.body) break;
      node = node.parentElement;
    }

    var full = fullPath(el);
    if (full) candidates.push(full);
    candidates.sort(function (a, b) { return a.length - b.length; });
    for (var k = 0; k < candidates.length; k++) {
      if (isUniqueSelector(candidates[k], el)) return candidates[k];
    }
    return full;
  }

  function buildXPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (isInShadow(el)) return '';
    try {
      if (el.id) {
        var idPath = '//*[@id="' + String(el.id).replace(/"/g, '\\"') + '"]';
        var idResult = document.evaluate(idPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (idResult.singleNodeValue === el) return idPath;
      }
    } catch (e) { /* ignore */ }

    var parts = [];
    var node = el;
    var guard = 0;
    while (node && node.nodeType === 1 && guard++ < 30) {
      var tag = node.tagName.toLowerCase();
      if (node === document.documentElement) {
        parts.unshift('html');
        break;
      }
      var parent = node.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      var sameTag = Array.prototype.filter.call(parent.children, function (child) {
        return child.tagName === node.tagName;
      });
      var index = sameTag.indexOf(node) + 1;
      parts.unshift(sameTag.length > 1 ? tag + '[' + index + ']' : tag);
      node = parent;
    }
    return '/' + parts.join('/');
  }

  function collectAncestors(el) {
    var result = [];
    var node = el.parentElement;
    var guard = 0;
    while (node && node.nodeType === 1 && guard++ < 5) {
      result.push(describeEl(node));
      node = node.parentElement;
    }
    return result.reverse();
  }

  function collectSiblings(el) {
    var parent = el.parentElement;
    if (!parent) return null;
    var children = Array.prototype.slice.call(parent.children);
    if (!children.length) return null;
    var others = children.filter(function (child) { return child !== el; });
    return {
      total: children.length,
      index: children.indexOf(el) + 1,
      previews: others.slice(0, 3).map(function (child) {
        var text = truncate(child.innerText || child.textContent || '', 18);
        return describeEl(child) + (text ? ' ' + JSON.stringify(text) : '');
      })
    };
  }

  function collectAttrs(el) {
    var out = [];
    var attrs = el.attributes || [];
    for (var i = 0; i < attrs.length && out.length < 14; i++) {
      var attr = attrs[i];
      if (!attr || !attr.name) continue;
      if (attr.name === 'id' || attr.name === 'class' || attr.name === 'style') continue;
      if (attr.name.indexOf('data-elementnote-') === 0) continue;
      var value = String(attr.value == null ? '' : attr.value);
      if (value.length > 100) value = value.slice(0, 97) + '…';
      out.push({ name: attr.name, value: value });
    }
    return out;
  }

  function collectStyles(cs) {
    var wanted = [
      ['display', 20], ['position', 12], ['flex-direction', 16], ['justify-content', 24],
      ['align-items', 20], ['gap', 16], ['grid-template-columns', 30], ['width', 12], ['height', 12],
      ['margin', 30], ['padding', 30], ['font-family', 28], ['font-size', 10], ['font-weight', 10],
      ['line-height', 10], ['letter-spacing', 10], ['color', 24], ['background-color', 24],
      ['background-image', 34], ['border', 40], ['border-radius', 24], ['box-shadow', 40],
      ['opacity', 8], ['z-index', 8], ['overflow', 16], ['transform', 30]
    ];
    var skip = {
      'background-image': 'none',
      'box-shadow': 'none',
      'transform': 'none',
      'z-index': 'auto',
      'opacity': '1'
    };
    var parts = [];
    for (var i = 0; i < wanted.length; i++) {
      var name = wanted[i][0];
      var value = '';
      try {
        value = cs.getPropertyValue(name);
      } catch (e) { /* ignore */ }
      if (!value) continue;
      value = value.trim();
      if (!value) continue;
      if (skip[name] && value === skip[name]) continue;
      if (name === 'font-family') value = value.split(',')[0].replace(/["']/g, '').trim();
      if (value.length > wanted[i][1]) value = truncate(value, wanted[i][1]);
      parts.push(name + ': ' + value);
    }
    return parts.join('; ');
  }

  function collectElementInfo(el) {
    var rect = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    var info = {
      tag: (el.tagName || '').toLowerCase(),
      id: el.id || '',
      classes: Array.prototype.slice.call(el.classList || []).slice(0, 10),
      selector: buildSelector(el),
      xpath: buildXPath(el),
      text: truncate(el.innerText || el.textContent || '', 80),
      attrs: collectAttrs(el),
      outerHTML: truncate(el.outerHTML || '', 280),
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        docLeft: rect.left + window.scrollX,
        docTop: rect.top + window.scrollY
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      },
      ancestors: collectAncestors(el),
      parentPath: '',
      siblings: collectSiblings(el),
      styles: collectStyles(cs),
      component: null,
      shadowHost: '',
      isIframe: (el.tagName || '').toUpperCase() === 'IFRAME'
    };
    info.parentPath = info.ancestors.join(' > ');
    if (isInShadow(el)) {
      try {
        info.shadowHost = buildSelector(el.getRootNode().host);
      } catch (e) { /* ignore */ }
    }
    return info;
  }

  function probeComponent(el) {
    if (!el || el.nodeType !== 1) return Promise.resolve(null);
    var marker = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      el.setAttribute('data-elementnote-probe', marker);
    } catch (e) {
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { finish(null); }, 1500);

      function finish(value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { el.removeAttribute('data-elementnote-probe'); } catch (e) { /* ignore */ }
        resolve(value);
      }

      try {
        Promise.resolve(ext.runtime.sendMessage({ type: 'EN_PROBE', marker: marker }))
          .then(function (response) {
            finish(response && response.ok ? response.data : null);
          })
          .catch(function () {
            finish(null);
          });
      } catch (e) {
        finish(null);
      }
    });
  }

  async function buildAnnotation(el, note) {
    var component = null;
    try {
      component = await probeComponent(el);
    } catch (e) {
      component = null;
    }
    if (!el.isConnected) {
      throw new Error('元素已不在页面上');
    }
    var info = collectElementInfo(el);
    info.component = component;
    return {
      id: 'an_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      note: note,
      createdAt: new Date().toISOString(),
      updatedAt: '',
      urlKey: normalizeUrl(location.href),
      pageUrl: location.href,
      pageTitle: document.title || '',
      target: info
    };
  }

  /* ============================== 存储 ============================== */

  async function loadAnnotationsForPage() {
    var key = normalizeUrl(location.href);
    lastUrlKey = key;
    try {
      var storageKey = storageKeyFor(key);
      var data = await ext.storage.local.get(storageKey);
      var list = data[storageKey];
      annotations = Array.isArray(list) ? list.slice().sort(byCreated) : [];
    } catch (e) {
      annotations = [];
    }
  }

  async function persistAnnotations(nextList) {
    var next = (Array.isArray(nextList) ? nextList : annotations).slice();
    var storageKey = storageKeyFor(normalizeUrl(location.href));
    if (next.length) {
      var payload = {};
      payload[storageKey] = next;
      await ext.storage.local.set(payload);
    } else {
      await ext.storage.local.remove(storageKey);
    }
  }

  /* ============================== 提示词 / 复制 ============================== */

  function buildPrompt() {
    if (!PROMPT_LIB) return '';
    return PROMPT_LIB.build(sortedAnnotations(), {
      url: location.href,
      title: document.title || '',
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      }
    });
  }

  function writeClipboard(text) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        resolve(ok);
      }
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).then(function () {
            finish(true);
          }).catch(function () {
            finish(fallbackCopy(text));
          });
        } else {
          finish(fallbackCopy(text));
        }
      } catch (e) {
        finish(fallbackCopy(text));
      }
    });
  }

  function fallbackCopy(text) {
    try {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
      document.body.appendChild(textarea);
      textarea.select();
      var ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  async function copyPrompt() {
    if (!annotations.length) {
      toast('还没有批注：先点击一个元素写下问题', 'error');
      return;
    }
    var text = buildPrompt();
    var ok = await writeClipboard(text);
    if (ok) {
      toast('已复制 ' + annotations.length + ' 条批注的提示词 · 粘贴给 AI 即可');
    } else {
      openPromptModal(text);
      toast('浏览器拒绝了自动复制，请在预览框里手动复制', 'error');
    }
  }

  function openPromptModal(prefill) {
    if (!annotations.length) {
      toast('还没有批注', 'error');
      return;
    }
    var text = typeof prefill === 'string' ? prefill : buildPrompt();
    modalOpen = true;
    els.modal.hidden = false;
    els.promptText.value = text;
    els.promptMeta.textContent = annotations.length + ' 条批注 · ' + text.length + ' 字符';
    els.promptText.focus();
    try { els.promptText.setSelectionRange(0, 0); } catch (e) { /* ignore */ }
  }

  function closePromptModal() {
    if (!modalOpen) return;
    modalOpen = false;
    els.modal.hidden = true;
  }

  async function copyModalPrompt() {
    var ok = await writeClipboard(els.promptText.value);
    toast(ok ? '提示词已复制' : '复制失败，请手动选择文本复制', ok ? '' : 'error');
  }

  function focusAnnotation(id) {
    var ann = null;
    for (var i = 0; i < annotations.length; i++) {
      if (annotations[i].id === id) {
        ann = annotations[i];
        break;
      }
    }
    if (!ann) return false;
    var el = resolveTarget(ann);
    if (!el) return false;
    try {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    } catch (e) {
      el.scrollIntoView();
    }
    flashAnnotation(el);
    return true;
  }

  function flashAnnotation(el) {
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = 0;
    }
    var rect = el.getBoundingClientRect();
    els.flash.hidden = false;
    els.flash.style.left = Math.max(0, rect.left - 2) + 'px';
    els.flash.style.top = Math.max(0, rect.top - 2) + 'px';
    els.flash.style.width = Math.max(0, rect.width + 4) + 'px';
    els.flash.style.height = Math.max(0, rect.height + 4) + 'px';
    els.flash.style.animation = 'none';
    void els.flash.offsetWidth;
    els.flash.style.animation = '';
    flashTimer = setTimeout(function () {
      els.flash.hidden = true;
      flashTimer = 0;
    }, 1500);
  }

  /* ============================== 工具栏 / 清空 ============================== */

  function syncToolbar() {
    if (!els.toolbar) return;
    var show = active || (annotations.length > 0 && !toolbarDismissed);
    els.toolbar.hidden = !show;
    els.toolbar.classList.toggle('en-active', active);
    els.count.textContent = String(annotations.length);
    els.copyBtn.disabled = annotations.length === 0;
    els.previewBtn.disabled = annotations.length === 0;
    els.clearBtn.disabled = annotations.length === 0;
    els.activateBtn.hidden = active;
    els.toolbarText.textContent = active ? '点选元素中' : '元素批注';
    els.dismissBtn.title = active ? '退出批注（Esc）' : '隐藏工具栏（可在扩展弹窗重新打开）';
  }

  function handleClear() {
    if (!annotations.length) return;
    if (!clearArmed) {
      clearArmed = true;
      els.clearBtn.textContent = '确认清空';
      els.clearBtn.classList.add('en-btn-danger');
      clearTimer = setTimeout(resetClearButton, 3000);
      return;
    }
    resetClearButton();
    clearAll();
  }

  function resetClearButton() {
    clearArmed = false;
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = 0;
    }
    if (els.clearBtn) {
      els.clearBtn.textContent = '清空';
      els.clearBtn.classList.remove('en-btn-danger');
    }
  }

  async function clearAll() {
    try {
      await persistAnnotations([]);
      annotations = [];
    } catch (e) {
      toast('清空失败，请重试', 'error');
      return;
    }
    closePanel();
    renderBadges();
    syncToolbar();
    toast('已清空本页批注');
  }

  /* ============================== 键盘 ============================== */

  function onGlobalKeyDown(event) {
    var inUi = isUiEvent(event);

    if (modalOpen) {
      if (inUi) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePromptModal();
      }
      return;
    }

    if (panelOpen) {
      if (inUi) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
      return;
    }

    if (!active || inUi) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      deactivate();
    } else if ((event.key === 'c' || event.key === 'C') &&
      !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      copyPrompt();
    }
  }

  /* ============================== 初始化 ============================== */

  function startUrlWatch() {
    if (urlTimer) clearInterval(urlTimer);
    urlTimer = setInterval(function () {
      var key = normalizeUrl(location.href);
      if (key === lastUrlKey) return;
      lastUrlKey = key;
      loadAnnotationsForPage().then(function () {
        renderBadges();
        syncToolbar();
      });
    }, 1200);
  }

  function bindPageListeners() {
    window.addEventListener('click', function (event) {
      if (isUiEvent(event)) return;
      if (!active && panelOpen) closePanel();
    }, true);
    window.addEventListener('keydown', onGlobalKeyDown, true);
    window.addEventListener('scroll', schedulePosition, true);
    window.addEventListener('resize', schedulePosition, false);
  }

  async function init() {
    try {
      buildUI();
      bindPageListeners();
      await loadAnnotationsForPage();
      renderBadges();
      syncToolbar();
      startUrlWatch();
    } catch (e) {
      console.warn('[ElementNote] 初始化失败：', e);
    }
  }

  /* ============================== 消息接口 ============================== */

  ext.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || !message.type) return;
    switch (message.type) {
      case 'EN_TOGGLE':
        if (active) deactivate(); else activate();
        sendResponse({ ok: true, active: active });
        break;
      case 'EN_ACTIVATE':
        activate();
        sendResponse({ ok: true, active: active });
        break;
      case 'EN_DEACTIVATE':
        deactivate();
        sendResponse({ ok: true, active: active });
        break;
      case 'EN_GET_STATE':
        sendResponse({
          ok: true,
          active: active,
          count: annotations.length,
          url: location.href,
          title: document.title,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            dpr: window.devicePixelRatio || 1,
            scrollX: window.scrollX,
            scrollY: window.scrollY
          }
        });
        break;
      case 'EN_GET_PROMPT':
        sendResponse({ ok: true, count: annotations.length, prompt: buildPrompt() });
        break;
      case 'EN_FOCUS':
        sendResponse({ ok: focusAnnotation(String(message.id || '')) });
        break;
      default:
        return;
    }
  });

  ext.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    var storageKey = storageKeyFor(normalizeUrl(location.href));
    var change = changes[storageKey];
    if (!change) return;
    var next = Array.isArray(change.newValue) ? change.newValue.slice().sort(byCreated) : [];
    if (JSON.stringify(next) === JSON.stringify(annotations)) return;
    annotations = next;
    renderBadges();
    syncToolbar();
    if (panelOpen && editing && !annotations.some(function (a) { return a.id === editing.id; })) {
      closePanel();
    }
  });

  init();
})();
