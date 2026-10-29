# 发布到 npm

包名：`@misaka10091/dsh-modeldeck`（npm 作用域需与你的 npm 账号/组织一致）。
发布走 **GitHub Actions**（`.github/workflows/publish.yml`），推 `v*` tag 自动发布。

## 一次性准备

1. 在 npm 生成 **Automation / Granular access token**（对该包有 publish 权限）。
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加 `NPM_TOKEN`。
3. 确保仓库为 public（`npm publish --provenance` 需要，生成可验证的构建来源）。

## 发布流程

```bash
# 1) 本地升版本（会自动同步 dsh.plugin.json 的 version 并 git add）
npm version patch          # 或 minor / major

# 2) 推送提交与 tag，触发 Actions 发布
git push --follow-tags
```

Actions 会依次执行：`check:syntax` → `npm test` → `npm pack --dry-run` → `npm publish --access public --provenance`。
tag 名称必须与 `package.json` 版本一致（`v0.1.0` ↔ `0.1.0`），否则工作流会失败。

手动试跑（不真正上传）：Actions 页面选 **Publish npm → Run workflow**，把 `dry_run` 勾上。

## 本地预检（可选）

```bash
npm run check:syntax
npm test
npm pack --dry-run       # 确认打包内容
```

`files` 只包含运行时必需文件（`index.js`、`client.js`、`src/`、`cordis.patch.yml`、`locale/`、`icon.svg`、`dsh.plugin.json`、文档与 `LICENSE`），不含测试/本地目录。

## 安装（用户侧）

```bash
dsh plugin --profile desktop add "@misaka10091/dsh-modeldeck"
```

或使用 `plugin_manager` 的 `install_bundle`。
