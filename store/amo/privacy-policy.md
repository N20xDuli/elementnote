# ElementNote 隐私政策 / Privacy Policy

最后更新：2026-11-10

## 中文

### 1. 概述

ElementNote 是一个完全在本机运行的浏览器扩展，用于在网页上选中元素、写批注、生成提示词。**扩展不收集、不上传、不共享任何个人数据。**

### 2. 扩展访问的内容

为了生成提示词，扩展在你主动进入批注模式并选中元素后，会在本机读取：

- 当前页面的 URL、标题、视口尺寸、滚动位置
- 被选中元素的标签、id、class、属性、文本、HTML 片段
- 元素的位置和尺寸、计算样式
- 页面公开挂载的 React/Vue/Angular 组件信息（只读）

这些内容仅保存在浏览器的 `storage.local` 中（扩展本地存储），按页面 URL 分片。

### 3. 数据传输

扩展**没有网络请求**，不会向任何服务器发送数据；没有账号系统、统计、遥测、广告或远程代码。

只有当你主动点击「复制提示词」或按 `C`，把内容粘贴到第三方 AI/聊天服务时，这些内容才会离开浏览器。此时适用该第三方服务的隐私政策，与 ElementNote 无关。

### 4. 数据保留与删除

- 数据保存在本机，直到你在扩展里删除批注、清空当前页批注，或卸载扩展。
- 卸载扩展会清除其 `storage.local` 数据。
- 你可以在扩展弹窗里逐条删除，或清空当前页面的全部批注。

### 5. 权限说明

- `storage`：在本机保存批注与定位信息。
- `clipboardWrite`：把你主动生成的提示词写入剪贴板。
- `scripting`：在页面主世界只读读取组件栈（React fiber / Vue 实例等）。
- `<all_urls>`：在你打开的任意页面上提供元素拾取器；扩展只在用户操作后显示批注 UI。

扩展源码中没有 `fetch`、XHR、WebSocket、`sendBeacon`、远程脚本或 `eval` / `new Function`。

### 6. 儿童隐私

扩展不面向儿童，也不收集任何用户信息。

### 7. 变更

如果未来版本增加任何数据收集或联网功能，会更新本政策并在扩展商店页面说明；在此之前，本政策描述的“纯本地”行为不变。

### 8. 联系

如有隐私问题，请在 GitHub 提一个 issue：<https://github.com/N20xDuli/elementnote/issues> 。

---

## English

### 1. Overview

ElementNote is a fully local browser extension that lets you select page elements, write annotations, and generate prompts. **It does not collect, transmit, or share any personal data.**

### 2. What the extension reads

After you explicitly start annotation mode and select an element, the extension reads locally:

- current page URL, title, viewport size, scroll position
- the selected element's tag, id, class, attributes, text, HTML snippet
- element position/size and computed styles
- publicly attached React/Vue/Angular component metadata (read-only)

This information is stored only in the extension's local `storage.local`, partitioned by page URL.

### 3. Transmission

The extension makes **no network requests**. There is no account system, telemetry, analytics, ads, or remote code.

Data leaves the browser only when you explicitly click "Copy prompt" (or press `C`) and paste it into a third-party AI/chat service. That service's privacy policy applies.

### 4. Retention and deletion

Data stays locally until you delete annotations, clear the page, or uninstall the extension. Uninstalling clears its `storage.local` data.

### 5. Permissions

- `storage`: save annotations and element context locally.
- `clipboardWrite`: copy a prompt you explicitly generated.
- `scripting`: read component metadata from the page's main world (read-only).
- `<all_urls>`: provide the element picker on any page you open. The annotation UI appears only after your action.

The source contains no `fetch`, XHR, WebSocket, `sendBeacon`, remote scripts, `eval`, or `new Function`.

### 6. Contact

For privacy questions, open an issue: <https://github.com/N20xDuli/elementnote/issues>.
