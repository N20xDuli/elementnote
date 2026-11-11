# AMO Listing 文案（可直接粘贴）

> 提交前把 `[YOUR_EMAIL]`、`[YOUR_PRIVACY_URL]`、`[YOUR_HOMEPAGE]` 换成你的信息。AMO 支持多语言 listing；下面是中文主文案，英文可放第二个 locale。

## 基本信息

- **名称**：ElementNote — 页面元素批注转 AI 提示词
- **英文名（可选）**：ElementNote — Turn UI annotations into AI prompts
- **摘要（Summary）**：
  像 DevTools 一样选中页面元素，写下批注，一键生成包含页面 URL、CSS 选择器、XPath、坐标、计算样式和 React/Vue 组件栈的提示词，直接粘贴给 AI 改前端代码。纯本地，无账号，无网络请求。
- **分类**：Developer Tools
- **标签**：frontend, debugging, css, react, ai, prompt, annotation, inspector
- **许可证**：MIT
- **支持邮箱**：`[YOUR_EMAIL]`
- **主页（可选）**：`[YOUR_HOMEPAGE]`
- **隐私政策 URL**：`[YOUR_PRIVACY_URL]`

## 详细描述（中文）

ElementNote 是给前端开发和设计走查用的「页面批注 → AI 提示词」工具。

你是不是经常这样：发现页面某个按钮字号不对、间距不一致、颜色偏了，截个图丢给 AI，然后还要手打「这是首页 hero 区的按钮，文件大概在 components 里」？ElementNote 就是把这步自动化：

1. 按 `Alt+Shift+C`（或点扩展图标 → 开始批注）进入拾取模式；
2. 鼠标悬停会高亮元素，点击后在浮层里写下问题或期望，`Enter` 保存；
3. 点「复制提示词」，或按 `C`，得到一段结构化 Markdown：
   - 页面 URL、标题、视口、滚动位置
   - CSS 选择器、XPath、父级路径、兄弟节点、元素文本、HTML 片段、关键属性
   - 文档坐标 + 视口坐标 + 尺寸
   - 关键计算样式（布局、字体、颜色、边框、圆角、阴影等）
   - React / Vue / Angular 组件栈和源码位置（能探测到时）
4. 粘贴到你常用的 AI 对话里，它就能直接定位到元素和组件来改代码。

**功能**

- 元素拾取：悬停高亮、点击选中、`Esc` 退出
- 批注徽标：点徽标可再次编辑；支持删除、清空
- 多批注合并成一段提示词
- 支持 open Shadow DOM 内部元素（选择器写成 `宿主 >> 内部路径`）
- iframe 容器本身可批注（内部文档不采集）
- React / Vue / Angular 组件栈探测（页面主世界只读）
- 扩展弹窗：按页面分组、查看、定位、编辑、删除、复制
- 数据只存本机，按页面 URL 分片，多个标签页并发保存互不覆盖
- 深色模式自适应，不污染页面样式（Shadow DOM 隔离）

**隐私**

- 不发任何网络请求，没有账号、没有统计、没有远程代码；
- 批注和采集到的页面信息只保存在浏览器本地 `storage.local`；
- 只有你主动复制提示词并粘贴到其它服务时，内容才会离开浏览器。

**适合谁**

- 前端工程师：把设计走查意见直接变成可执行的代码修改请求
- 设计师：不用描述「左边那个按钮」，直接标在元素上
- 独立开发者：Debug 自己的页面，减少来回描述上下文

**已知限制**

- `chrome://`、`edge://`、Firefox 的 `about:` 页面、扩展商店、PDF 阅读器不允许扩展运行
- iframe 内部元素不采集；Shadow DOM 仅支持 open shadow root
- 同一 URL 的两个标签页同时写入时，以最后保存为准
- 纯锚点 `#section` 不单独分组；`#/route` 型 hash 路由会分组

## 详细描述（English, optional）

ElementNote is a local-first Firefox extension that turns visual UI annotations into structured AI prompts.

Select any element like DevTools' element picker, write a short note, and copy a Markdown prompt containing the page URL, CSS selector, XPath, coordinates, computed styles, and (when detectable) the React/Vue/Angular component stack. Paste it into your AI assistant to fix the frontend code without re-describing where the element is.

- No account, no telemetry, no network requests
- Annotations stay in `storage.local`; data leaves the browser only when you copy it
- Supports open Shadow DOM, iframe containers, React/Vue/Angular component stacks
- MIT licensed

## 截图说明

- `screenshots/01-elementnote-page-1280x800.png`：页面内拾取、元素高亮、批注徽标和工具栏
- 可选：`docs/screenshot-popup.png`（扩展弹窗的批注列表）

## 审核备注

见 [`reviewer-notes.md`](reviewer-notes.md)。
