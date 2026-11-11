# 现成方案调研：浏览器内「选元素 → 写批注 → 生成结构化提示词 → 一键复制」

> 调研时间：2026-11-08（北京时间）
> 调研方式：`web_search` 后端返回 HTTP 402（余额不足），全程改用 `web_fetch` 直接抓官网 / GitHub README / GitHub API / npm 徽章页。
> 所有价格与功能均以抓取到的官方页面原文为准；抓不到的一律标注「未核实」，不做推测性补全。

---

## 一、一句话结论

**在可核实的范围内，没有找到同时满足「纯本地 + 任意站点 + 无需账号 + 一键复制结构化提示词（URL + 选择器 + 坐标）」的现成 Chrome 扩展。** 最接近需求的两条路各有硬伤：`react-grab` 能复制「元素 + 组件栈 + 源码文件:行:列」，但**只支持 React 项目、需要改构建、且不含 URL/选择器/坐标**；Chrome DevTools 自带 `Copy selector / Copy JS path` 能拿到选择器，但**没有批注、没有提示词模板、没有坐标**。视觉批注类产品（BugHerd / Pastel / MarkUp.io / Userback）都能「点页面元素写评论」，但产物进的是它们自己的 SaaS 任务板，**不生成可复制的 AI 提示词、不本地化、要账号**。**建议自研**，并把 `react-grab` 的选取交互和 DevTools 的选择器算法直接抄过来，工作量约 1–2 天可到可用版。

---

## 二、对比表

| 方案 | 形态 | 账号 / 费用 | 框架限制 | 能生成可复制提示词 | 含 URL + 选择器 + 坐标 | 许可证 / 价格 | 主要局限 |
|---|---|---|---|---|---|---|---|
| **stagewise** | 桌面应用（Agentic IDE，内置浏览器）+ 开源仓库 | 现在可免账号（BYOK）；Hobby 免费，Individual $20/月 | 自身内置浏览器，任意站点可浏览；改代码需连接代码库 | ❌ 不生成剪贴板提示词，上下文直接喂给内置 agent | 部分（元素 DOM 上下文；具体字段未核实） | AGPLv3；免费 + $20/月 起 | 已转型为「IDE + agent」，不再是轻量扩展；2026 年 11 月底下线官方账号服务 |
| **react-grab** | 页面脚本（`npx grab@latest init` 或 `<script>` 注入） | 无账号，免费 | **仅 React**；仅开发环境 | ✅ 复制到剪贴板（元素 + 组件栈 + 源码位置） | ❌ 无 URL、无 CSS 选择器、无坐标 | MIT | 需改构建；不含批注输入；非扩展形态 |
| **Browser MCP** | Chrome 扩展 + 本地 MCP server（`npx @browsermcp/mcp`） | 未见收费/账号要求（许可证未核实） | 无框架限制 | ❌ 反向：AI 驱动浏览器，不产出可粘贴提示词 | 使用 CSS/Playwright locator 定位，但不导出给用户 | 未核实（GitHub `browsermcp/mcp`） | 需要 Node 20+ 与支持 MCP 的 AI 客户端；定位是「让 agent 操作浏览器」 |
| **BugHerd** | Chrome 扩展（或站点 JS 片段） | 必须建项目/账号；客户可免登录 | 任意网站 | ❌ 只生成任务卡片 | 自动截图 + 技术信息（浏览器/OS/分辨率）；选择器未核实 | 商业软件，$42/月起，7 天试用 | SaaS 依赖、按项目计费、无 AI 提示词导出 |
| **Pastel** | Web 应用 + 浏览器扩展（画布代理） | 需注册；Free $0 / Pro $35/mo / Team $119/mo / Enterprise $450/mo | 任意网站、PDF、图片 | ❌ 评论进画布；有 MCP 但面向 agent 读取评论 | 定位到页面元素，选择器/坐标未核实 | 商业 SaaS；14 天试用 | 无结构化提示词一键复制；数据在云端 |
| **MarkUp.io**（Ceros） | Web 应用 + 浏览器扩展 | 需注册；价格未核实（Pricing 页 JS 渲染） | 网站 / 图片 / PDF | ❌ 未见 AI 提示词导出 | 未核实 | 商业 SaaS | 同上；本次未能取得有效正文 |
| **Userback** | Web 应用 + 扩展 / 站内 widget | 需注册；价格未核实（页面 JS 渲染） | 任意网站 | ❌ 用户反馈平台，非提示词工具 | 未核实 | 商业 SaaS | 同上 |
| **Chrome DevTools 内置** | 浏览器自带（无需安装） | 无 | 任意站点 | ❌ 只能 Copy 原始片段，需人工拼提示词 | ✅ 选择器、JS path；❌ 坐标（需手算） | 免费 | 无批注 UI、无模板、无批量、无历史 |
| **Chrome Web Store 同类插件** | 未知 | — | — | — | — | — | **未核实**：商店搜索页为 SPA，`web_fetch` 返回空正文 |

图例：✅ 明确支持；❌ 明确不支持；「未核实」= 本次抓取未拿到可引用的原文，不代表不存在。

---

## 三、逐个方案说明

### 1. stagewise（stagewise.io / GitHub: stagewise-io/stagewise）

**核实到的原文事实**

- 官网首屏定位已变为：*"The Agentic IDE for Open-Source Models"*，产品形态是**下载安装的桌面应用**（README：`Download stagewise from stagewise.io`），不是单纯的浏览器工具栏。
- 仓库结构（GitHub API 实测 `apps/`、`packages/`）：`apps/browser`、`apps/stagewise-cli`、`apps/website`、`apps/update-server`；`packages/agent-core`、`agent-shell`、`stage-ui`、`karton`、`icons`。**没有名为 `toolbar` 的包**——说明早期「注入页面的 stagewise toolbar」形态在主线仓库里已经被 IDE 形态取代。
- 能力描述：*"Work with a coding agent that has full access to your tab's console and debugger"*、*"Reverse-engineer any website's components, style systems, and color palettes"*、*"Browse and build in the same tool"*。
- 许可证：**AGPLv3**（README + 官网 FAQ 均写明，stagewise GmbH）。
- 价格：Hobby 免费（"Limited access to 3 standard models" + BYOK 无限）；Individual **$20/mo**（Pro / Ultra 档）；Enterprise 定制。
- 账号：README 注明 *"The stagewise account service will be sunset at the end of November 2026"*，官方引导改成自带订阅 / 自带 API Key。

**判断**：它确实具备「在页面里点元素 → 给 agent 上下文」的能力，但**交付物是它自己的 agent**，不是一段可复制的提示词；而且要装 IDE。对「粘贴给任意 AI」这个使用方式来说过重，**不满足需求**；不过它的 `apps/browser` + `karton`（多窗口/面板通信）架构值得参考。

**局限**：AGPLv3 对二次分发的约束较强；产品方向已偏向 agent IDE，元素选取细节可能随版本变化（本次未核实到具体字段清单）。

参考：<https://github.com/stagewise-io/stagewise> ｜ <https://www.stagewise.io/> ｜ <https://www.stagewise.io/pricing>

---

### 2. react-grab（react-grab.com / GitHub: aidenybai/react-grab）

**核实到的原文事实**

- 一句话定位：*"Copy any UI element for your agent."*
- 形态：**页面脚本**，不是 Chrome 扩展。接入方式三选一：`npx grab@latest init`；Next.js 里用 `<Script src="//unpkg.com/react-grab/dist/index.global.js">` 且用 `NODE_ENV === "development"` 包住；Vite/Webpack 在入口 `if (import.meta.env.DEV) import("react-grab")`。
- 交互：*"Hover any UI element in your app. Press ⌘C or Ctrl+C. Paste the copied context into your agent."*
- **复制内容原文样例**（这是最关键的证据）：

  ```txt
  [<a class="ml-auto inline-block text-sm" href="#">Forgot your password?</a> in LoginForm (at components/login-form.tsx:46:19)]
  ```

  即：元素 HTML 片段 + 组件栈 + **源码文件:行:列**。
- 还导出 `react-grab/primitives`：`getElementAtPoint`、`isElementGrabbable`、命中测试作用域、页面冻结、剪贴板、编辑器跳转等 API。README 明确鼓励 *"Build your own React Grab"*。
- 许可证：**MIT**，免费、无账号。

**判断**：这是**交互层面最接近**的方案——悬停高亮 + 一键复制 + 结构化上下文，而且 MIT 可商用。但硬限制明显：只对 React 生效（组件栈来自 React fiber），只在开发构建里生效，**复制内容里没有页面 URL、没有 CSS 选择器、没有坐标**，也没有「写批注」的输入框。**不满足需求，但它的 primitives 可以直接拿来当自研的底座。**

**局限**：需要改项目构建（对「任意站点」的需求是致命的）；生产站点（如竞品官网、用户线上页面）完全用不了。

参考：<https://github.com/aidenybai/react-grab> ｜ <https://www.react-grab.com> ｜ <https://www.npmjs.com/package/react-grab>

---

### 3. Browser MCP（browsermcp.io / GitHub: browsermcp/mcp）

**核实到的原文事实**

- 定位：*"Browser MCP connects Claude Code, Cursor, Codex and other MCP apps to Chrome."*
- 形态：**Chrome 扩展 + 本地 MCP server**，server 用 `npx @browsermcp/mcp@latest` 拉起，要求 **Node.js 20+** 与支持 MCP 的 AI 应用。
- 只有本地回环：*"The background process listens on 127.0.0.1"*；首次配对要输入扩展弹窗里的 6 位码。
- 能力是「agent 操作浏览器」：工具命令包括 `goto / click <target> / fill / snapshot -i / find "<text>" / get text / screenshot --full / wait / console --errors / eval`，target 支持 *"Playwright locators, CSS selectors or refs from a snapshot"*；`--caps cdp` 可下探到 CDP（断点、mock 响应、profile）。
- 与需求的关系：**方向相反**。它是让 AI 去控浏览器，不是让人选元素后生成提示词；虽然内部有选择器/快照，但不产出「可粘贴给 AI 的定位信息」。

**判断**：**不满足需求**。唯一价值是架构参考：扩展 + 本地进程 + 一次性配对 + 本地回环，这套安全模型可以借鉴（但如果我们的产物只是一段文本，其实连本地进程都不需要）。

**未核实**：价格政策、开源许可证、是否需要账号（官网未出现定价/登录入口，但也未明说免费）。

参考：<https://browsermcp.io/> ｜ <https://github.com/browsermcp/mcp>

---

### 4. 视觉批注类：BugHerd / Pastel / MarkUp.io / Userback

这一类的共性是：**「点元素 + 写评论」做得非常成熟，但评论进的是它们自己的看板**，用来做客户验收 / bug 跟踪，不是给 AI 的上下文；且都要账号、数据在云端。

#### BugHerd（bugherd.com）

- 原文：*"Your clients can just point, click & comment on a live website. BugHerd grabs the screenshot, captures technical details, and creates a task."*
- 形态：浏览器扩展（官网 FAQ：*"BugHerd is a browser extension you can set up in seconds"*），或给 staging/内网站点装 JS 片段；**任意网站**都支持（FAQ 明确 *"Does BugHerd work on all websites? Yes!"*）。
- 账号：业主必须注册建项目；**客户无需账号**（发链接即可评论）。
- 捕获内容：截图 + 浏览器 / 操作系统 / 屏幕分辨率等元信息（原文：*"metadata like the browser, operating system, and screen resolution"*）。**是否存 CSS 选择器或坐标：未核实。**
- 价格：首页 FAQ 原话 *"Plans start at $42/month"*，7 天免费试用，60 天退款保证。
- 其他：首页挂出 **BugHerd MCP (BETA)**、**BugHerd AI (BETA)**，即让 AI 读取/处理任务——但这是「AI 来读它的任务库」，不是「导出提示词给 AI」。
- **判断**：不满足「一键复制提示词」，且是重 SaaS。可借鉴：免登录客户评论、截图 + 环境信息自动附带。

#### Pastel（usepastel.com）

- 定位：*"Website Annotation Tool for Fast Visual Feedback"*；*"Works on any website, PDF, image (and more!)"*。
- 形态：Web 应用 + 浏览器扩展；对线上站点用自有代理叠加评论（FAQ：*"we layer comments on your live website using our custom proxy technology"*），支持响应式测试。
- 账号：业主注册；评论者免登录（*"No login needed"*）。
- 价格（Pricing 页实测双栏月付/年付）：Free **$0**（1 用户 1 画布）；Pro **$35/mo**（年付 $29/mo，$350/年）；Team **$119/mo**（年付 $99/mo）；Enterprise **$450/mo**（年付 $5,400）。14 天试用，无需信用卡。
- AI：有 *"Pastel for AI agents — Let Cursor, Claude, or ChatGPT act on feedback for you"* 的 MCP 入口（<https://usepastel.com/agents>）。
- **判断**：同上，评论 → 任务，不是提示词；选择器/坐标未核实。

#### MarkUp.io（markup.io，Ceros 出品）

- 官网可确认：面向网站 / 图片 / PDF 的可视化批注与客户反馈，需注册登录（页面右上 `Login / Sign Up`），竞争对手页列出 Pastel / Ruttl / BugHerd / Marker.io / Webvizio / Feedbucket（说明同赛道）。
- **未核实**：具体价格（`/pricing/` 为前端渲染，抓到的正文只有导航）、是否导出选择器/坐标、是否有 AI 提示词能力。`/features/` 返回 **404**，站点结构已变。

#### Userback（userback.io）

- 官网标题可确认：*"Userback: Your #1 User Feedback Software"*（用户反馈平台，站内 widget / 截图反馈 / 会话回放一类）。
- **未核实**：价格（`/pricing/` 抓取仅得到 `<title>`，正文为 JS 渲染）、是否有元素选择器导出。**不建议作为核心方案考虑。**

---

### 5. Chrome DevTools 自带能力（Copy selector / Copy JS path / Copy element）

- 入口：`Ctrl+Shift+C`（或 Elements 面板左上角箭头）进入选取模式，点页面元素 → 右键 → **Copy → Copy element / Copy selector / Copy JS path / Copy styles**。这是 Chrome DevTools 长期稳定功能。
- 能拿到什么：`Copy selector` 输出一条 CSS 选择器（常见形态是 `#id`、`.class` 或带 `:nth-child()` 的路径）；`Copy JS path` 输出 `document.querySelector("...")` 形式的 JS 路径；`Copy element` 输出 `outerHTML`。
- 缺什么：**没有批注输入、没有提示词模板、没有元素坐标、没有页面 URL（需自己在 Console 里 `location.href`）、没有历史记录、不能跨多个元素汇总**。
- **核实说明（重要）**：本次 `web_fetch` 抓 `https://developer.chrome.com/docs/devtools/elements` 与 `.../css/reference` 都只拿到站点导航（正文被截断），**未取到可引用的官方段落**。该功能属于高置信度的既有能力（可直接在浏览器里右键验证），但本文不引用具体文档句子。

**判断**：它是「原料供应商」而不是方案。自研时选择器算法应对齐它，并补上它的两个缺陷：自动生成的选择器经常又长又脆（含哈希类名），以及元素可能根本不在 `document` 里（Shadow DOM / iframe / Canvas）。

参考：<https://developer.chrome.com/docs/devtools/elements>（正文未抓到）｜ <https://developer.chrome.com/docs/devtools/dom>

---

### 6. Chrome Web Store 同类插件检索

- 尝试抓取：`https://chromewebstore.google.com/search/select%20element%20prompt` → HTTP 200，但**返回正文为空**（该页面是 SPA，需 JS 渲染；`web_fetch` 拿不到结果列表）。
- 结论：**未核实**。不能据此断言「商店里没有」，只能说「本次未能核实到具体插件」。
- 建议 Lead / 用户本地人工复核以下关键词（2 分钟即可）：`element to prompt`、`select element AI`、`AI element context`、`design feedback AI`、`css selector copy ai`、`page annotate prompt`；以及直接搜竞品词 `react-grab`、`stagewise`。
- 旁证：`react-grab` 官方只提供 npm 脚本接入（无商店入口）；`stagewise` 已转为桌面 IDE；`Browser MCP` 的扩展是给 agent 用的。**头部玩家都没有做「纯本地一键复制提示词」这个形态**，这本身是个信号：要么没人做，要么需求足够窄、由 agent 侧（Cursor/Claude 的浏览器工具）覆盖。

---

## 四、检索过程与失败记录（便于复核，不掩盖盲区）

| 目标 | 结果 |
|---|---|
| `web_search` | HTTP 402（后端余额不足），未重试 |
| `html.duckduckgo.com` | HTTP 202 + 人机验证（reCAPTCHA 图片题），无结果 |
| `www.bing.com/search?q=...` | HTTP 200 但结果严重跑偏（把 "copy" 当漫画站），不可用 |
| `chromewebstore.google.com/search/...` | HTTP 200，正文为空（SPA） |
| `developer.chrome.com` 文档页 | 正文被导航截断，未取到 Copy 菜单段落 |
| `markup.io/pricing/`、`userback.io/pricing/` | 正文 JS 渲染，仅得标题 |
| `markup.io/features/` | 404 |
| GitHub 仓库页 | 正文被导航截断；改用 `raw.githubusercontent.com` 的 README 与 `api.github.com` 目录接口后成功 |

---

## 五、对自研的借鉴点

### 5.1 交互（最值得抄的两处）

1. **react-grab 的「悬停即高亮 + ⌘/Ctrl+C 复制」**：比 DevTools 的「先进入选取模式再点」更轻。建议做成双模：
   - 默认：`Alt+Shift+A`（或工具栏按钮）进入选取模式 → 鼠标移动实时高亮（overlay 描边 + 尺寸标签 `320 × 48`）→ 点击锁定 → 弹出批注小窗 → `Ctrl+Enter` 复制并退出；
   - 快捷：按住 `Alt` 悬停任意元素直接按 `C`，跳过选取模式直接锁定（给熟手）。
2. **DevTools 的「点击后不触发页面事件」**：选取模式下必须 `preventDefault + stopPropagation`（在捕获阶段拦 `click/mousedown/pointerdown`），否则点按钮会真跳转。react-grab 用 `isElementGrabbable` 过滤 + 「页面冻结」解决，值得照搬：锁定元素后把页面交互冻住，避免滚动/动画导致坐标漂移。

### 5.2 上下文 schema（提示词模板）

建议一次复制输出这样的结构（Markdown，人读友好、AI 好解析）：

```markdown
## 页面
- URL: https://example.com/pricing?plan=pro
- 标题: Pricing — Example
- 视口: 1440×900 @2x，滚动 Y=680

## 目标元素
- 选择器: main > section.pricing > div.card:nth-of-type(2)
- XPath: //*[@id="pricing"]/section[2]/div[2]
- 标签: <button class="btn btn--primary">立即购买</button>
- 文本: 立即购买
- 位置: x=842, y=412, w=168, h=44（相对视口）；距父容器上 24px
- 计算样式: display=flex; color=#fff; background=#2563eb; font-size=16px; padding=12px 24px
- 可访问性: role=button, name="立即购买"

## 我的批注
[间距] 这个按钮和上面的价格卡片挨太近了，上下留白想要 24px 以上。

## 期望
只改这个按钮所在的卡片区块，给出修改后的 CSS/组件代码，说明改哪几行。
```

关键设计：
- **选择器要做「稳定优先」的降级链**：`#id`（且非自动生成）→ `[data-testid]` → `[aria-label]` / `name` → 稳定的 class 组合（过滤 CSS Modules / styled-components 哈希，如 `/^[a-z]+-[a-z0-9]{5,}$/`）→ `nth-of-type` 路径（最多 N 层，超过就截断并提示「选择器可能不稳定」）。同时给 XPath 作为兜底。
- **坐标一定要给两套**：`getBoundingClientRect()`（视口坐标，随滚动变化）+ `offsetTop/offsetLeft` 链（文档坐标，稳定）。再带 `window.scrollY` 和 `devicePixelRatio`，否则 AI 无法还原位置。
- **附一段裁剪截图**（`chrome.tabs.captureVisibleTab` + 按 rect 裁剪）能极大提升多模态模型的理解准确率，属于「锦上添花但性价比极高」的功能。

### 5.3 技术实现要点（MV3）

- **UI 用 Shadow DOM 承载**，宿主节点 `position: fixed; z-index: 2147483647`，避免被页面 CSS 污染（这是所有同类工具的必踩坑）。
- **overlay 用 `pointer-events: none` 的高亮层 + 一个独立的捕获层**，不要给高亮层绑事件，否则选不中下层元素。选取层要能穿透：`pointer-events: none` 的元素在 `document.elementFromPoint` 里会被跳过，正好可用。
- **跨 frame**：`all_frames: true` + 顶层注入 UI、子 frame 只做元素上报；`elementFromPoint` 拿不到 iframe 内部元素，需要各 frame 自己算。
- **Shadow DOM**：`elementFromPoint` 返回的是宿主节点，需要 `shadowRoot.elementFromPoint()` 逐层下钻（可参考 react-grab 的 `getElementAtPoint` 递归思路）。
- **坐标基准**：`getBoundingClientRect()` 是视口坐标，`scrollX/scrollY` 变化会变；模板里要注明基准，或统一转成文档坐标。
- **剪贴板**：MV3 里 content script 里直接 `navigator.clipboard.writeText()` 通常可用（页面有焦点时）；不可靠时回退到 `document.execCommand('copy')`（用隐藏 textarea），再不行走 `chrome.offscreen`。
- **权限最小化**：`activeTab` + `scripting` + `storage` + `clipboardWrite` 足够；**不要**申请 `<all_urls>` host 权限（会触发商店审核慢 + 用户恐惧），用 `activeTab` 在用户点击时临时注入。若要做「任意站点自动可用」，用 `optional_host_permissions` 按需申请。
- **键盘冲突**：`Ctrl+Shift+C` 已被 DevTools 占用（且 DevTools 打开时扩展收不到），建议 `Alt+Shift+A`；并且不要用 `Ctrl+C` 裸键（会和复制文本冲突，react-grab 能用是因为它只在自己 dev 页面）。
- **数据落地**：`chrome.storage.local` 存最近 N 条批注历史，支持「重新复制」「导出 JSON」。全部本地，不发网络请求——这正好是竞品都没有的卖点。

### 5.4 明确的差异化（为什么值得自研）

现成方案的空白正好对齐需求：

| 需求点 | 现成方案缺口 |
|---|---|
| 任意站点 | react-grab 只支持 React dev；BugHerd/Pastel 要装它们的 SaaS |
| 无需账号、纯本地 | 视觉批注类全部要账号 + 云端 |
| 一键复制结构化提示词 | 没有一个方案同时输出「URL + 选择器 + 坐标 + 批注 + 期望」 |
| 贴给任意 AI | stagewise / Browser MCP 是「AI 来用浏览器」，不是「给 AI 喂上下文」 |
| 批注（自然语言意图） | DevTools 与 react-grab 都没有批注输入框 |

### 5.5 建议的 MVP 拆分（按投入产出排序）

1. **P0（0.5 天）**：选取模式 + 高亮 + 锁定 + 生成 Markdown（URL / 选择器 / outerHTML / rect / 滚动）+ 一键复制。
2. **P1（0.5 天）**：批注输入小窗（含 3–4 个快捷标签：间距/颜色/字体/布局）+ 模板化「期望」段 + 复制历史。
3. **P2（0.5 天）**：截图裁剪附件、多元素批量选取（生成列表）、导出 JSON、快捷键配置。
4. **P3（可选）**：`data-testid` / 组件名识别（读 Vue `__vueParentComponent`、React fiber 的 `_debugSource`，失败静默降级）；「一键发给 Cursor」的深链。

---

## 六、结论与建议（明确回答）

1. **现成方案能否完全满足需求？** —— **不能。** 逐项对照见 5.4：没有任何一个产品同时覆盖「任意站点 + 无需账号 + 本地 + 批注 + 一键复制含 URL/选择器/坐标的提示词」。
2. **是否存在「纯本地、任意站点、无需账号、一键复制提示词」的现成插件？** —— **在本次可核实的范围内不存在。** 需要说明两点限制：(a) Chrome Web Store 搜索页未能抓取（SPA 返回空），所以不能对商店做穷尽断言，建议人工复核 6 个关键词；(b) `web_search` 402、DDG 人机验证、Bing 结果污染，意味着「未发现」的置信度是「中高」而非「确定」。
3. **建议：自研。** 理由是三个「抄得到 + 补得上」——
   - 选取交互抄 `react-grab`（MIT，primitives 直接可用，含命中测试/页面冻结/剪贴板）；
   - 选择器算法对齐 DevTools `Copy selector`，并额外补 XPath 与稳定性降级链；
   - 批注 + 提示词模板是所有人都不做的事，而这正是用户要的核心价值（把「哪里」和「要什么」压缩成一段 AI 能直接执行的文本）。
4. **不建议采用的方案**：stagewise（已转型 agent IDE，AGPLv3，重）；Browser MCP（方向相反）；BugHerd / Pastel / MarkUp.io / Userback（SaaS 账号 + 云端，且不产提示词）。
5. **风险提示**：如果后续发现 Chrome Web Store 已有同类插件，最可能的形态是「个人开发者 + 无商店外链 + 少量安装量」，功能上大概率只做「复制 selector + 输入框」，**在坐标、截图、模板化期望、历史记录这几项上仍有空间**；建议 MVP 完成后做一次商店关键词复核再决定是否投入 P2/P3。

---

## 七、参考链接汇总

- stagewise：<https://github.com/stagewise-io/stagewise> ｜ <https://www.stagewise.io/> ｜ <https://www.stagewise.io/pricing>
- react-grab：<https://github.com/aidenybai/react-grab> ｜ <https://www.react-grab.com> ｜ <https://www.npmjs.com/package/react-grab>
- Browser MCP：<https://browsermcp.io/> ｜ <https://github.com/browsermcp/mcp> ｜ <https://chromewebstore.google.com/detail/bjfgambnhccakkhmkepdoekmckoijdlc>
- BugHerd：<https://bugherd.com/> ｜ <https://bugherd.com/pricing>
- Pastel：<https://usepastel.com/> ｜ <https://usepastel.com/plans> ｜ <https://usepastel.com/agents>
- MarkUp.io：<https://www.markup.io/> ｜ <https://www.markup.io/pricing/>
- Userback：<https://userback.io/> ｜ <https://userback.io/pricing/>
- Chrome DevTools：<https://developer.chrome.com/docs/devtools/elements> ｜ <https://developer.chrome.com/docs/devtools/dom>
- Chrome Web Store 搜索（未核实）：<https://chromewebstore.google.com/search/select%20element%20prompt>
