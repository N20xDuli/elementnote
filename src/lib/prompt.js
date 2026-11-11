'use strict';

/**
 * ElementNote 提示词生成器（纯函数，无 DOM / 无扩展 API 依赖）
 * 同时被 content script 与 popup 加载。
 */
(function (global) {
  var VERSION = '1.0.0';

  function normalizeUrl(raw) {
    try {
      var u = new URL(String(raw || ''));
      var hash = u.hash || '';
      u.hash = '';
      var base = u.href;
      // #/route 与 #!/route 是 hash 路由，必须参与分组；普通锚点（#section）忽略
      if (/^#!?\//.test(hash)) return base + hash;
      return base;
    } catch (e) {
      return String(raw || '').split('#')[0];
    }
  }

  function isLocalAddress(raw) {
    try {
      var u = new URL(String(raw || ''));
      var host = u.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
      if (/^127\./.test(host)) return true;
      if (/^10\./.test(host)) return true;
      if (/^192\.168\./.test(host)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
      if (/\.localhost$/.test(host) || /\.local$/.test(host)) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function truncate(value, max) {
    var s = clean(value);
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + '…';
  }

  /** 放进 markdown 行内代码时避免反引号破坏格式 */
  function inline(value) {
    return truncate(value, 800).replace(/`/g, "'");
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatTime(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function quote(value) {
    var s = truncate(value, 120);
    return s ? '“' + s + '”' : '';
  }

  function attrsLine(attrs) {
    if (!Array.isArray(attrs) || !attrs.length) return '';
    return attrs.map(function (a) {
      var v = String(a.value == null ? '' : a.value).replace(/"/g, "'");
      return a.name + '="' + v + '"';
    }).join('；');
  }

  function componentLine(component) {
    if (!component) return '';
    var framework = clean(component.framework) || '未知框架';
    var chain = Array.isArray(component.chain) ? component.chain.filter(Boolean) : [];
    var source = clean(component.source);
    if (!chain.length && !source) return '';
    var parts = [];
    if (chain.length) parts.push(framework + ' `' + inline(chain.join(' > ')) + '`');
    else parts.push(framework + ' 组件');
    if (source) parts.push('源码 `' + inline(source) + '`');
    return parts.join('，');
  }

  function rectLine(target) {
    var r = target.rect;
    if (!r) return '';
    var line = '文档坐标 (' + num(r.docLeft) + ', ' + num(r.docTop) + ')，尺寸 ' +
      num(r.width) + ' × ' + num(r.height) + ' px';
    line += '；选中时视口坐标 (' + num(r.left) + ', ' + num(r.top) + ')';
    return line;
  }

  function siblingsLine(siblings) {
    if (!siblings) return '';
    var total = num(siblings.total);
    if (!total) return '';
    var line = '父级下共 ' + total + ' 个元素，自身第 ' + num(siblings.index) + ' 个';
    if (Array.isArray(siblings.previews) && siblings.previews.length) {
      line += '；相邻：' + siblings.previews.map(function (p) {
        return '`' + inline(p) + '`';
      }).join('、');
    }
    return line;
  }

  /**
   * @param {Array} annotations 批注记录数组
   * @param {{url?:string,title?:string,viewport?:object}} page 当前页面信息
   * @returns {string} 可直接粘贴给 AI 的提示词
   */
  function build(annotations, page) {
    var list = (annotations || []).filter(function (a) {
      return a && clean(a.note);
    }).sort(function (a, b) {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    if (!list.length) return '';

    var p = page || {};
    var firstTarget = list[0].target || {};
    var vp = p.viewport || firstTarget.viewport || {};
    var isLocal = isLocalAddress(p.url || list[0].pageUrl || '');

    var out = [];
    out.push('# 前端页面元素批注');
    out.push('');
    out.push('我在浏览器里对页面元素做了可视化批注。请先根据下面的定位信息在代码中找到对应元素，再按批注调整 UI。');
    out.push('');
    out.push('## 页面信息');
    out.push('- 地址：' + clean(p.url || list[0].pageUrl || ''));
    var title = clean(p.title || list[0].pageTitle || '');
    if (title) out.push('- 标题：' + title);
    if (vp && vp.width) {
      out.push('- 视口：' + num(vp.width) + ' × ' + num(vp.height) +
        '（devicePixelRatio ' + (Number(vp.dpr) || 1) + '），滚动位置 (' +
        num(vp.scrollX) + ', ' + num(vp.scrollY) + ')');
    }
    out.push('- 批注数量：' + list.length);
    out.push('- 生成时间：' + formatTime(new Date()));
    if (isLocal) out.push('- 环境：本地开发页面（localhost / 内网地址）');
    out.push('');
    out.push('## 批注详情');

    list.forEach(function (ann, index) {
      var t = ann.target || {};
      out.push('');
      out.push('### 批注 ' + (index + 1));
      out.push('**批注内容**：' + clean(ann.note));
      out.push('');

      if (t.outerHTML) out.push('- 元素：`' + inline(t.outerHTML) + '`');
      if (t.isIframe) out.push('- 类型：iframe 容器（内部文档不参与采集，只能定位 iframe 元素本身）');
      if (t.selector) out.push('- CSS 选择器：`' + inline(t.selector) + '`');
      if (t.xpath) out.push('- XPath：`' + inline(t.xpath) + '`');
      var rl = rectLine(t);
      if (rl) out.push('- 位置：' + rl);
      if (t.text) out.push('- 文本：' + quote(t.text));
      if (t.parentPath) out.push('- 父级路径：`' + inline(t.parentPath) + '`');
      var sl = siblingsLine(t.siblings);
      if (sl) out.push('- 同级元素：' + sl);
      var al = attrsLine(t.attrs);
      if (al) out.push('- 关键属性：`' + inline(al) + '`');
      if (t.styles) out.push('- 计算样式：`' + inline(t.styles) + '`');
      var cl = componentLine(t.component);
      if (cl) out.push('- 组件栈：' + cl);
      if (t.shadowHost) out.push('- Shadow DOM：元素位于 Shadow DOM 内，宿主选择器 `' + inline(t.shadowHost) + '`（普通 `document.querySelector` 不能直接穿透，需要 host.shadowRoot.querySelector）');
      if (t.text && !t.outerHTML) out.push('- 元素 HTML：未采集');
    });

    out.push('');
    out.push('## 任务要求');
    out.push('1. 先用 CSS 选择器 / XPath / 父级路径定位元素，再用组件栈确认组件与源码文件；不要只凭描述猜位置。');
    out.push('2. 对每条批注分别给出：问题判断、要修改的文件、关键代码改动（样式或结构）；保持页面现有设计语言，不做无关重构。');
    out.push('3. 涉及视觉细节（间距、颜色、字号、圆角等）时，结合「计算样式」给出具体数值，并说明修改前后的差异。');
    if (isLocal) {
      out.push('4. 这是本地开发页面：请在当前项目内按页面路由、组件名、选择器特征检索源码，不要臆造文件路径。');
      out.push('5. 如果信息不足（缺少截图、设计稿、设计 token 或更多上下文），先列出需要我补充的内容，再给出方案。');
    } else {
      out.push('4. 如果信息不足（缺少截图、设计稿、设计 token 或更多上下文），先列出需要我补充的内容，再给出方案。');
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  global.ElementNotePrompt = {
    version: VERSION,
    normalizeUrl: normalizeUrl,
    isLocalAddress: isLocalAddress,
    build: build
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
