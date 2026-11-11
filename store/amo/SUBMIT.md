# ElementNote AMO 提交指南

目标：让 Firefox **永久**安装 ElementNote（不再随重启消失），可选公开上架 AMO 商店。

- 费用：**免费**
- 提交入口：<https://addons.mozilla.org/developers/>
- 上传文件：`store/amo/elementnote-1.0.0.xpi`
- 当前包状态：`web-ext lint` **0 errors**（源码目录 4 warnings；上传的商店包 3 warnings，见第 6 节）
- 账号要求：Mozilla 账号（邮箱验证；建议开启 2FA）

---

## 一、先选路线

| 路线 | 适合 | 结果 | 审核 |
|---|---|---|---|
| **A. 自签名 / 自己分发（Unlisted）** | 只想自己/团队永久使用 | 得到已签名 XPI，手动安装；不公开、不出现在商店搜索 | 通常较快（自动/轻量人工） |
| **B. 公开上架（Listed）** | 想让所有人从 AMO 安装、自动更新 | 有公开商店页面，可被搜索 | 需要完整 listing 审核，可能数天 |

两条路线都需要先上传同一个 XPI。选定路线后不能随意互换（可在 Developer Hub 里申请调整，但流程不同）。

---

## 二、路线 A：自签名，永久安装（推荐先做这个）

1. 打开 <https://addons.mozilla.org/developers/>，用 Mozilla 账号登录。
2. 点 **Submit a New Add-on**。
3. 选择 **On your own**（self-distribution / unlisted）。
4. 上传 `elementnote-1.0.0.xpi`。
5. 等待自动校验 + 签名完成（通常几分钟到几小时；新账号/新扩展可能人工抽查）。
6. 在 Developer Hub 的扩展页面下载 **signed XPI**。
7. Firefox 打开 `about:addons` → 右上角齿轮 → **Install Add-on From File…** → 选择签名后的 XPI。
8. 安装完成后扩展会一直保留，重启 Firefox 不会消失。

> 注意：必须安装 **签名后的** XPI。你自己用 `tools/build_amo_xpi.py` 打出来的未签名包仍然只能临时载入。

---

## 三、路线 B：公开上架 AMO

1. 同样在 Developer Hub 点 **Submit a New Add-on**。
2. 选择 **On addons.mozilla.org**（listed）。
3. 上传 `elementnote-1.0.0.xpi`。
4. 填写 Listing：
   - 名称、摘要、详细描述：直接复制 [`listing.md`](listing.md)
   - 分类：**Developer Tools**
   - 许可证：**MIT**
   - 隐私政策 URL：`https://N20xDuli.github.io/elementnote/privacy-policy.html`（已托管，可直接填）
   - 支持邮箱：替换成你的邮箱
   - 截图：上传 `screenshots/01-elementnote-page-1280x800.png`
5. 数据收集声明：选择 **None / 不收集**（与 manifest 的 `data_collection_permissions.required = ["none"]` 一致）。
6. 权限说明 / 审核备注：复制 [`reviewer-notes.md`](reviewer-notes.md) 中相关内容。
7. 提交审核。
8. 通过后，用户可直接从 AMO 安装；后续发新版本会自动更新。

---

## 四、AMO 会问的权限，怎么解释

| 权限 | 用途 | 是否可减少 |
|---|---|---|
| `<all_urls>`（host） | 元素拾取器需要在你打开的任意前端页面运行；内容脚本只在页面里加一个 Shadow DOM UI | 不能：工具的核心就是“任意页面选元素” |
| `scripting` | 在页面主世界只读读取 React/Vue/Angular 挂在 DOM 上的组件信息 | 不能：隔离世界读不到这些属性 |
| `storage` | 把批注和定位信息存在本机 `browser.storage.local`，按页面分片 | 不能：保存/恢复批注需要 |
| `clipboardWrite` | 一键复制生成的提示词 | 不能：核心交互 |

- **没有网络请求**：扩展不会 fetch/XHR/WebSocket/上报，源码里也没有远程脚本。
- **数据不离开浏览器**：页面文本、HTML 片段、样式、坐标只写本地 storage；只有用户手动点“复制”并粘贴到别处时才离开。
- 详细说明见 [`reviewer-notes.md`](reviewer-notes.md)。

> AMO 审核可能因为 `<all_urls>` 要求补充说明。`reviewer-notes.md` 已经写好了“为什么必须全站权限”和“如何 30 秒内测试”。

---

## 五、提交前 checklist

- [ ] `manifest.json` 里有 `browser_specific_settings.gecko.id = elementnote@local`
- [ ] 有 `data_collection_permissions.required = ["none"]`（2025-11-03 后 AMO 强制）
- [ ] `strict_min_version = 140.0`
- [ ] 上传的是 `store/amo/elementnote-1.0.0.xpi`，不是未签名的临时包
- [ ] 隐私政策 URL 可访问
- [ ] 支持邮箱已替换
- [ ] 截图已上传
- [ ] `web-ext lint` 0 errors
- [ ] 同意 Firefox Add-on Distribution Agreement（账号持有人操作）

---

## 六、当前 linter 结果与解释

命令：

```powershell
npx web-ext@latest lint --source-dir elementnote --output json
```

结果：**0 errors**。源码目录 lint 会有 4 个 warning；上传的 XPI 不含 `demo/`，所以商店包实际是 3 个。这些 warning 不阻断签名/上架：

1. `BACKGROUND_SERVICE_WORKER_IGNORED`
   Firefox 忽略 `background.service_worker`，使用同一 manifest 里的 `background.scripts`（跨浏览器双后台方案）。Chrome/Edge 反之。
2. `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`
   本扩展只面向桌面 Firefox；`data_collection_permissions` 在 Android 需要 Firefox 142+，而 `strict_min_version` 是 140。
3. `INLINE_SCRIPT`（`demo/index.html`）
   Demo 页面有内联脚本；XPI 不打包 `demo/`，商店包不包含它，因此不会出现这个 warning。
4. `UNSAFE_VAR_ASSIGNMENT`（`src/content.js`）
   `shadow.innerHTML = MARKUP` 使用的是常量模板字符串，不拼接用户输入；这是构建 Shadow DOM UI 的静态模板。

---

## 七、如果被拒/要求修改

常见原因与处理：

- **要求说明全站权限**：把 `reviewer-notes.md` 的 “Permissions justification” 段贴进去。
- **怀疑收集页面数据**：说明“只写本地 storage、无网络请求、用户手动复制才离开浏览器”，并附隐私政策。
- **要求源码**：本扩展没有构建/压缩步骤，可直接提供 `src/` 原始源码；MIT 许可证。
- **版本号冲突**：AMO 同一扩展每次更新必须递增 `manifest.json` 的 `version`，重新打包再上传。

---

## 八、参考

- 提交入口：<https://addons.mozilla.org/developers/>
- 签名与分发：<https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/>
- 自签名：<https://extensionworkshop.com/documentation/publish/self-distribution/>
- 数据收集声明：<https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/>
- MDN `browser_specific_settings`：<https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings>
