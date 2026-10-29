# 发布到 npm

包名：`@misaka10091/dsh-modeldeck`（npm 作用域需与你的 npm 账号/组织一致）。

## 发布前检查

```bash
npm run check:syntax     # 语法检查
npm test                 # 领域逻辑单测
npm pack --dry-run       # 查看将被打包的文件
```

确认 `package.json` 的 `files` 只包含运行时必需文件（`index.js`、`client.js`、`src/`、`cordis.patch.yml`、`locale/`、`icon.svg`、`dsh.plugin.json`、文档与 `LICENSE`），不含测试/本地目录。

## 版本与发布

```bash
npm version patch        # 或 minor / major；会自动同步 dsh.plugin.json 的 version
npm publish --access public
git push --follow-tags
```

> `npm version` 的 `version` 脚本会把 `package.json` 的版本同步写入 `dsh.plugin.json`。

## 安装（用户侧）

```bash
dsh plugin --profile desktop add "@misaka10091/dsh-modeldeck"
```

或使用 `plugin_manager` 的 `install_bundle`。
