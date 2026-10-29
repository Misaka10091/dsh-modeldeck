# DSH ModelDeck 执行计划

> 依赖：`design.md` 的契约。目标：产出可安装的插件包，并以可运行测试覆盖核心逻辑。

## 阶段 A：确认技术门（实现前）

- [ ] A1. 用 `cordis_inspect_query`（`Service`/`Event`/`Slots`）确认：项目持久化服务、`session/event` 的 `model/selection` 字段、`conversation.composer.dock` 槽位 props、`modelSelection` 投影可读性。
- [ ] A2. 依据 A1 结果固定 `ProjectDeckStore` 实现与 UI 槽位；若 inspection 不可用，按 design 第 5 节的接口先实现纯逻辑与可安装包，并标注集成未验证。
- 回滚点：A 阶段不改动现有 profile 状态。

## 阶段 B：纯逻辑与测试（可独立验证）

- [ ] B1. 新建 `src/deck-core.js`（ESM），实现：`configKey`、`recordSuccess`、`pinByKey`、`unpinByKey`、`addPreset`、`removePreset`、`reorderPresets`、`renamePreset`、不变量校验 `assertInvariants`。
- [ ] B2. 新建 `test/deck-core.test.js`（`node --test`），覆盖：
  - 去重与置顶（AC-03）
  - 限额淘汰且固定项不受影响（AC-04）
  - 钉住/取消钉住互斥（AC-05/AC-06）
  - 项目隔离（不同 projectId 互不影响）（AC-01 逻辑层）
  - 固定项唯一、冲突拒绝（D3）
  - 移除固定项不删历史 / 未用手动项移除即消失（D5）
  - 不支持推理时 key 规范化（AC-14 逻辑层）
- [ ] B3. 运行 `node --test test/`，全绿。**验证命令**：`"$NODE" --test test/`。

## 阶段 C：插件包与集成（安装可验证部分）

- [ ] C1. `package.json`：`name: @local/dsh-modeldeck`，`exports` 含 `.`、`./client`、`./locale/*.json`、`./icon`；`dsh.bundle.patch`、`dsh.client`（`platform: web`、`immediately: true`、`inject: ["@deepseek-ai/dsh-client-ui-conversation"]`）。
- [ ] C2. `cordis.patch.yml`：`- insert: [{ id: dsh-modeldeck, name: '@local/dsh-modeldeck', config: {} }]`。
- [ ] C3. `index.js`：Host 半边。`export function apply(ctx, config)`；注册 `session/event` 观察器（`ctx.effect` 清理）；暴露持久化服务与投影（按 A1 结论）。
- [ ] C4. `client.js`：注册 `conversation.composer.dock` 条目；渲染当前配置摘要 + 固定/历史列表 + 应用/钉住操作；仅使用 `--dsw-alias-*` token；文本走 locale。
- [ ] C5. `locale/en.json`、`locale/zh.json`、`icon.svg`：`meta.title`/`meta.description` 为真实文案。
- [ ] C6. 语法检查：`"$NODE" --check client.js`（浏览器模块为 IIFE/模块加载格式，必要时用 `--input-type=module` 校验 `index.js`/`src`）。

## 阶段 D：安装与验证（依赖 plugin_manager）

- [ ] D1. `plugin_manager install_bundle`（target=包绝对目录），读取 `application`/`warnings` 判定是否生效。
- [ ] D2. `cordis_inspect_query` 确认新行；在连接页面验证槽位渲染与交互；验证共享默认值副作用披露文案。
- [ ] D3. 若 `plugin_manager` 不可用：明确记录“包与逻辑已就绪、安装/渲染未验证”，不宣称视觉成功。

## 阶段 E：收尾

- [ ] E1. `trellis-check` 复核：spec 合规、语法、测试、跨层一致性。
- [ ] E2. 更新 `.trellis/spec/` 中与本插件相关的约定（如存储/错误处理），`trellis-update-spec`。
- [ ] E3. 提交改动（`git add`/`commit`），记录验证状态。
- [ ] E4. 按需归档任务。

## 验证命令汇总

```bash
# 纯逻辑测试
"$NODE" --test test/
# 语法检查
"$NODE" --check src/deck-core.js
"$NODE" --check index.js
# 清单校验（JSON 可解析）
"$NODE" -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"
```

## 风险与回滚

- 风险：持久化 API 未确认 → 以 `ProjectDeckStore` 适配层隔离，先交付纯逻辑与可安装骨架。
- 风险：槽位 props 不含会话选择器 → 退回 `conversation.input.activity`。
- 回滚：`plugin_manager remove_bundle`；数据按 `projectId` 独立，不影响其他项目。
