'use strict';

(function () {
  var ext = (typeof browser !== 'undefined' && browser && browser.runtime) ? browser : chrome;
  var STORAGE_PREFIX = 'annotations.v1::';
  var SUPPORTED_RE = /^(https?|file):/i;
  var BLOCKED_RE = /chromewebstore\.google\.com/i;

  var state = {
    tab: null,
    supported: false,
    pageUrl: '',
    pageState: null,
    all: [],
    records: [],
    groups: [],
    editingId: null,
    clearArmed: false,
    clearTimer: 0,
    statusTimer: 0
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function normalizeUrl(url) {
    if (window.ElementNotePrompt) return window.ElementNotePrompt.normalizeUrl(url);
    try {
      var u = new URL(String(url || ''));
      u.hash = '';
      return u.href;
    } catch (e) {
      return String(url || '').split('#')[0];
    }
  }

  function byCreated(a, b) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  function truncate(value, max) {
    var s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + '…';
  }

  function setStatus(message, isError) {
    els.status.textContent = message;
    els.status.classList.toggle('error', !!isError);
    els.status.hidden = false;
    if (state.statusTimer) clearTimeout(state.statusTimer);
    state.statusTimer = setTimeout(function () {
      els.status.hidden = true;
      state.statusTimer = 0;
    }, 2800);
  }

  function sendTab(message) {
    return new Promise(function (resolve, reject) {
      if (!state.tab || state.tab.id == null) {
        reject(new Error('当前页面不可用'));
        return;
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('页面脚本无响应'));
      }, 4000);
      Promise.resolve(ext.tabs.sendMessage(state.tab.id, message)).then(function (response) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      }).catch(function (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async function getActiveTab() {
    try {
      var tabs = await ext.tabs.query({ active: true, currentWindow: true });
      return (tabs && tabs[0]) || null;
    } catch (e) {
      return null;
    }
  }

  async function loadAll() {
    // 每个页面 URL 一个 storage key，避免不同标签页保存时互相覆盖
    var data = await ext.storage.local.get(null);
    var all = [];
    Object.keys(data || {}).forEach(function (key) {
      if (key.indexOf(STORAGE_PREFIX) !== 0) return;
      if (Array.isArray(data[key])) all = all.concat(data[key]);
    });
    return all;
  }

  async function loadPage(urlKey) {
    var storageKey = storageKeyFor(urlKey);
    var data = await ext.storage.local.get(storageKey);
    return Array.isArray(data[storageKey]) ? data[storageKey] : [];
  }

  async function writePage(urlKey, list) {
    var storageKey = storageKeyFor(urlKey);
    if (list && list.length) {
      var payload = {};
      payload[storageKey] = list;
      await ext.storage.local.set(payload);
    } else {
      await ext.storage.local.remove(storageKey);
    }
  }

  function storageKeyFor(urlKey) {
    return STORAGE_PREFIX + urlKey;
  }

  function pageKeyOf(ann) {
    return ann.urlKey || normalizeUrl(ann.pageUrl);
  }

  function filterByUrl(all, url) {
    var key = normalizeUrl(url);
    return all.filter(function (a) {
      return (a.urlKey || normalizeUrl(a.pageUrl)) === key;
    }).sort(byCreated);
  }

  function groupOthers(all, currentUrl) {
    var currentKey = currentUrl ? normalizeUrl(currentUrl) : '';
    var groups = Object.create(null);
    all.forEach(function (ann) {
      var key = ann.urlKey || normalizeUrl(ann.pageUrl);
      if (!key || key === currentKey) return;
      if (!groups[key]) {
        groups[key] = {
          key: key,
          url: ann.pageUrl || key,
          title: ann.pageTitle || '',
          records: []
        };
      }
      groups[key].records.push(ann);
    });
    return Object.keys(groups).map(function (key) {
      var group = groups[key];
      group.records.sort(byCreated);
      group.latest = group.records[group.records.length - 1];
      return group;
    }).sort(function (a, b) {
      return new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime();
    });
  }

  async function reload() {
    state.all = await loadAll();
    state.pageUrl = (state.tab && state.tab.url) || '';
    state.supported = !!state.pageUrl && SUPPORTED_RE.test(state.pageUrl) && !BLOCKED_RE.test(state.pageUrl);
    state.pageState = null;
    if (state.supported) {
      try {
        state.pageState = await sendTab({ type: 'EN_GET_STATE' }) || null;
      } catch (e) {
        state.supported = false;
      }
    }
    state.records = state.pageUrl ? filterByUrl(state.all, state.pageUrl) : [];
    state.groups = groupOthers(state.all, state.pageUrl);
    render();
  }

  /* ============================== 渲染 ============================== */

  function render() {
    els.count.textContent = String(state.records.length);
    els.pageUrl.textContent = state.pageUrl || '无法读取当前页面地址';
    els.pageUrl.title = state.pageUrl || '';
    els.live.hidden = !(state.pageState && state.pageState.active);

    var notice = '';
    if (!state.pageUrl) {
      notice = '当前页面地址不可见（chrome:// 等页面不支持扩展）。请打开一个 http(s) 前端页面。';
    } else if (BLOCKED_RE.test(state.pageUrl)) {
      notice = '扩展商店等页面不允许扩展运行，请换一个页面。';
    } else if (!state.supported) {
      notice = '页面脚本还没就绪：请刷新页面后重试，或确认这是普通 http(s) / file 页面。';
    }
    els.notice.hidden = !notice;
    els.notice.textContent = notice;

    els.empty.hidden = state.records.length > 0;
    renderList();
    renderGroups();

    els.copy.disabled = state.records.length === 0;
    els.clear.disabled = state.records.length === 0;
    els.start.disabled = !state.supported;
    els.start.textContent = (state.pageState && state.pageState.active) ? '继续选择' : '开始批注';
    els.clear.textContent = state.clearArmed ? '确认清空' : '清空';
    els.clear.classList.toggle('armed', state.clearArmed);

    els.others.hidden = state.groups.length === 0;
    var otherTotal = state.groups.reduce(function (count, group) {
      return count + group.records.length;
    }, 0);
    els.othersSummary.textContent = '其他页面（' + state.groups.length + ' 个页面，' + otherTotal + ' 条）';
  }

  function renderList() {
    els.list.textContent = '';
    state.records.forEach(function (record, index) {
      els.list.appendChild(buildItem(record, index));
    });
  }

  function buildItem(record, index) {
    var target = record.target || {};
    var item = document.createElement('div');
    item.className = 'item';
    item.setAttribute('data-id', record.id);

    var num = document.createElement('div');
    num.className = 'num';
    num.textContent = String(index + 1);

    var main = document.createElement('div');
    main.className = 'item-main';

    var note = document.createElement('div');
    note.className = 'note';
    note.textContent = record.note;

    var loc = document.createElement('div');
    loc.className = 'loc';
    var selector = target.selector || target.xpath || target.tag || '元素';
    loc.textContent = selector;
    loc.title = selector;

    var meta = document.createElement('div');
    meta.className = 'meta';
    var bits = [];
    if (target.rect) {
      bits.push(Math.round(target.rect.width) + '×' + Math.round(target.rect.height) +
        ' @ (' + Math.round(target.rect.left) + ', ' + Math.round(target.rect.top) + ')');
    }
    if (target.component && target.component.chain && target.component.chain.length) {
      bits.push(target.component.framework + ' · ' + target.component.chain.slice(0, 3).join(' > '));
    }
    if (target.text) bits.push('“' + truncate(target.text, 26) + '”');
    meta.textContent = bits.join(' · ');
    meta.title = meta.textContent;

    var actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.appendChild(makeLink('定位', 'focus', !state.supported));
    actions.appendChild(makeLink('编辑', 'edit'));
    var del = makeLink('删除', 'delete');
    del.classList.add('danger');
    actions.appendChild(del);

    var editBox = document.createElement('div');
    editBox.className = 'edit-box';
    editBox.hidden = true;

    var textarea = document.createElement('textarea');
    textarea.value = record.note;
    textarea.maxLength = 2000;
    textarea.setAttribute('aria-label', '编辑批注');

    var editActions = document.createElement('div');
    editActions.className = 'edit-actions';
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'mini primary';
    save.setAttribute('data-act', 'save');
    save.textContent = '保存';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mini';
    cancel.setAttribute('data-act', 'cancel');
    cancel.textContent = '取消';
    editActions.appendChild(save);
    editActions.appendChild(cancel);

    editBox.appendChild(textarea);
    editBox.appendChild(editActions);

    main.appendChild(note);
    main.appendChild(loc);
    main.appendChild(meta);
    main.appendChild(actions);
    main.appendChild(editBox);

    item.appendChild(num);
    item.appendChild(main);
    return item;
  }

  function makeLink(label, act, disabled) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'link';
    button.setAttribute('data-act', act);
    button.textContent = label;
    if (disabled) button.disabled = true;
    return button;
  }

  function prettyUrl(url) {
    var s = String(url || '');
    s = s.replace(/^https?:\/\//i, '').replace(/^file:\/\//i, '');
    return truncate(s, 52);
  }

  function renderGroups() {
    els.othersList.textContent = '';
    state.groups.forEach(function (group) {
      var wrap = document.createElement('div');
      wrap.className = 'group';

      var head = document.createElement('div');
      head.className = 'group-head';

      var title = document.createElement('div');
      title.className = 'group-title';
      title.textContent = prettyUrl(group.url);
      title.title = group.url;

      var count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = String(group.records.length);

      var actions = document.createElement('div');
      actions.className = 'group-actions';

      var copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'mini';
      copy.setAttribute('data-act', 'group-copy');
      copy.setAttribute('data-key', group.key);
      copy.textContent = '复制';

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'mini';
      del.setAttribute('data-act', 'group-delete');
      del.setAttribute('data-key', group.key);
      del.textContent = '删除';

      actions.appendChild(copy);
      actions.appendChild(del);

      head.appendChild(title);
      head.appendChild(count);
      head.appendChild(actions);
      wrap.appendChild(head);
      els.othersList.appendChild(wrap);
    });
  }

  /* ============================== 操作 ============================== */

  async function startPicker() {
    if (!state.supported) {
      setStatus('当前页面不支持批注：请打开 http(s) / file 前端页面', true);
      return;
    }
    try {
      await sendTab({ type: 'EN_ACTIVATE' });
      window.close();
    } catch (e) {
      setStatus('页面脚本未就绪，请刷新页面后重试', true);
    }
  }

  async function copyCurrent() {
    if (!state.records.length) return;
    var prompt = window.ElementNotePrompt.build(state.records, {
      url: (state.tab && state.tab.url) || state.pageUrl,
      title: (state.pageState && state.pageState.title) || (state.tab && state.tab.title) || '',
      viewport: state.pageState && state.pageState.viewport
    });
    var ok = await writeClipboard(prompt);
    if (ok) {
      setStatus('已复制 ' + state.records.length + ' 条批注的提示词，粘贴给 AI 即可');
      flashText(els.copy, '已复制 ✓');
    } else {
      setStatus('复制失败：请检查浏览器剪贴板权限', true);
    }
  }

  async function copyGroup(group) {
    var pageInfo = {
      url: group.latest.pageUrl || group.url,
      title: group.latest.pageTitle || '',
      viewport: group.latest.target && group.latest.target.viewport
    };
    var prompt = window.ElementNotePrompt.build(group.records, pageInfo);
    var ok = await writeClipboard(prompt);
    setStatus(ok ? '已复制该页面的 ' + group.records.length + ' 条提示词' : '复制失败', !ok);
  }

  async function clearCurrent() {
    if (!state.records.length) return;
    if (!state.clearArmed) {
      state.clearArmed = true;
      render();
      state.clearTimer = setTimeout(function () {
        state.clearArmed = false;
        render();
      }, 3000);
      return;
    }
    state.clearArmed = false;
    if (state.clearTimer) {
      clearTimeout(state.clearTimer);
      state.clearTimer = 0;
    }
    var key = normalizeUrl(state.pageUrl);
    await writePage(key, []);
    await reload();
    setStatus('已清空当前页批注');
  }

  async function deleteRecord(id) {
    var target = null;
    var all = await loadAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        target = all[i];
        break;
      }
    }
    if (!target) {
      setStatus('这条批注已不存在', true);
      return;
    }
    var pageKey = pageKeyOf(target);
    var list = await loadPage(pageKey);
    await writePage(pageKey, list.filter(function (a) { return a.id !== id; }));
    await reload();
    setStatus('批注已删除');
  }

  function startEdit(item, id) {
    var box = item.querySelector('.edit-box');
    if (!box) return;
    state.editingId = id;
    box.hidden = false;
    var textarea = box.querySelector('textarea');
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }

  function cancelEdit(item) {
    state.editingId = null;
    var box = item.querySelector('.edit-box');
    if (box) box.hidden = true;
  }

  async function saveEdit(item, id) {
    var box = item.querySelector('.edit-box');
    if (!box) return;
    var textarea = box.querySelector('textarea');
    var text = textarea ? textarea.value.trim() : '';
    if (!text) {
      setStatus('批注内容不能为空', true);
      return;
    }
    var all = await loadAll();
    var target = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        target = all[i];
        break;
      }
    }
    if (!target) {
      setStatus('这条批注已不存在，请重新打开弹窗', true);
      return;
    }
    var pageKey = pageKeyOf(target);
    var list = await loadPage(pageKey);
    var next = list.map(function (ann) {
      if (ann.id !== id) return ann;
      return Object.assign({}, ann, { note: text, updatedAt: new Date().toISOString() });
    });
    await writePage(pageKey, next);
    state.editingId = null;
    await reload();
    setStatus('批注已更新');
  }

  async function focusRecord(id) {
    if (!state.supported) {
      setStatus('当前页面不支持定位', true);
      return;
    }
    try {
      var response = await sendTab({ type: 'EN_FOCUS', id: id });
      if (response && response.ok) {
        setStatus('已定位到元素');
        window.close();
      } else {
        setStatus('页面上没找到该元素（可能已刷新或代码已改动）', true);
      }
    } catch (e) {
      setStatus('无法连接页面脚本，请刷新页面后重试', true);
    }
  }

  async function deleteGroup(group) {
    await writePage(group.key, []);
    await reload();
    setStatus('已删除该页面的批注');
  }

  /* ============================== 剪贴板 ============================== */

  function writeClipboard(text) {
    return new Promise(function (resolve) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).then(function () {
            resolve(true);
          }).catch(function () {
            resolve(fallbackCopy(text));
          });
        } else {
          resolve(fallbackCopy(text));
        }
      } catch (e) {
        resolve(fallbackCopy(text));
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

  function flashText(button, text) {
    var original = button.textContent;
    button.textContent = text;
    setTimeout(function () {
      button.textContent = original;
    }, 1400);
  }

  /* ============================== 事件绑定 ============================== */

  function bind() {
    els.copy.addEventListener('click', copyCurrent);
    els.start.addEventListener('click', startPicker);
    els.clear.addEventListener('click', clearCurrent);

    els.list.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
      var item = event.target && event.target.closest ? event.target.closest('.item') : null;
      if (!button || !item) return;
      var id = item.getAttribute('data-id');
      var act = button.getAttribute('data-act');
      if (act === 'focus') focusRecord(id);
      else if (act === 'edit') startEdit(item, id);
      else if (act === 'cancel') cancelEdit(item);
      else if (act === 'save') saveEdit(item, id);
      else if (act === 'delete') {
        if (state.editingId === id) state.editingId = null;
        deleteRecord(id);
      }
    });

    els.othersList.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
      if (!button) return;
      var key = button.getAttribute('data-key');
      var group = null;
      for (var i = 0; i < state.groups.length; i++) {
        if (state.groups[i].key === key) {
          group = state.groups[i];
          break;
        }
      }
      if (!group) return;
      var act = button.getAttribute('data-act');
      if (act === 'group-copy') copyGroup(group);
      else if (act === 'group-delete') deleteGroup(group);
    });

    ext.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (state.editingId) return;
      reload().catch(function () { /* ignore */ });
    });
  }

  async function init() {
    els.count = $('count');
    els.pageUrl = $('pageUrl');
    els.notice = $('notice');
    els.live = $('live');
    els.empty = $('empty');
    els.list = $('list');
    els.others = $('others');
    els.othersSummary = $('othersSummary');
    els.othersList = $('othersList');
    els.status = $('status');
    els.copy = $('copy');
    els.start = $('start');
    els.clear = $('clear');

    bind();
    state.tab = await getActiveTab();
    try {
      await reload();
    } catch (e) {
      setStatus('加载批注失败：' + ((e && e.message) || '未知错误'), true);
    }
  }

  init();
})();
