# 发布到 npm

包名：`@misaka10091/dsh-modeldeck`。
发布走 **GitHub Actions**：`.github/workflows/npm-publish.yml`，推 `v*` tag 自动发布并创建 GitHub Release。

## 一次性准备

1. 在 npm 包设置里配置 **Trusted Publisher**（GitHub Actions）：
   - Repository：`Misaka10091/dsh-modeldeck`
   - Workflow filename：`npm-publish.yml`
   - 无需 `NPM_TOKEN` 密钥；认证来自 GitHub OIDC（`id-token: write`）。
2. 仓库设为 public（provenance 需要可验证来源）。

## 发布流程

```bash
# 1) 本地升版本：会同步 dsh.plugin.json 的 version 并 git add
npm version patch          # 或 minor / major

# 2) 推提交与 tag，触发 Actions 发布
git push --follow-tags
```

工作流会：校验 tag/版本/CHANGELOG → 语法检查 → 单测 → `npm pack --dry-run` → 打包 tarball →
`npm publish --access public --tag <latest|next>`（Trusted Publisher provenance）→ 创建 GitHub Release 并附上 tarball。

## 发布前置校验（脚本会自动做）

- tag 形如 `vX.Y.Z`（可带预发布后缀，如 `-beta.1`），无 build metadata；
- `package.json` 名称 = `@misaka10091/dsh-modeldeck`；
- `package.json#version` 与 `dsh.plugin.json#version` 都等于 tag；
- `repository.url` = `git+https://github.com/Misaka10091/dsh-modeldeck.git`；
- `CHANGELOG.md` 存在非空的 `## vX.Y.Z — ` 章节（作为 Release 正文）。

本地可先跑：

```bash
node scripts/prepare-release.mjs v0.1.0 .tmp/rel
npm run check:syntax && npm test && npm pack --dry-run
```

## 安装（用户侧）

Web profile（CLI）：
```bash
dsh plugin --profile web add "@misaka10091/dsh-modeldeck"
```
Desktop 应用：用应用内的插件管理（`plugin_manager` 的 `install_bundle`）安装；`desktop` profile 由 Electron 管理，通常不接受 CLI 插件命令。
