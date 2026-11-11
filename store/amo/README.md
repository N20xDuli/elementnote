# AMO 上架材料（Firefox Add-ons）

这个目录是 **Mozilla Add-ons（AMO）提交包**，用于把 ElementNote 从「每次重启就消失的临时插件」变成可以永久安装的扩展。

## 先看这个

1. 阅读 [`SUBMIT.md`](SUBMIT.md)：两种提交路线（自签名 / 公开上架）的完整步骤。
2. 上传文件：[`elementnote-1.0.0.xpi`](elementnote-1.0.0.xpi)（已按 AMO 要求补充 `data_collection_permissions`，`web-ext lint` 0 errors）。
3. 上架文案：[`listing.md`](listing.md)。
4. 隐私政策：[`privacy-policy.md`](privacy-policy.md)（需替换联系邮箱并托管成 URL）。
5. 审核说明：[`reviewer-notes.md`](reviewer-notes.md)。
6. 截图：[`screenshots/`](screenshots/)。

## 你需要自己完成的动作

AMO 提交必须用 **你本人的 Mozilla 账号** 登录 Developer Hub，同意 Firefox Add-on Distribution Agreement，并完成邮箱验证/（建议）2FA。这部分涉及账号与法律同意，我无法代替你点「提交」。

我能做的是把包、文案、权限说明、审核备注、数据声明都准备好；你只需要登录、上传、粘贴、点提交。

## 重新打包

修改源码后，在 `elementnote/` 根目录执行：

```powershell
python tools/build_amo_xpi.py . store\amo\elementnote-1.0.0.xpi
```

> XPI 里只打包 `manifest.json`、`src/`、`icons/`；`docs/demo/tests/store` 不会进入商店包。
