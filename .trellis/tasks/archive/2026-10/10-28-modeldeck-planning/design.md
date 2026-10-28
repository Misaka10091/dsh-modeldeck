# DSH ModelDeck 技术设计

> 对应需求：`prd.md`。本文只描述技术架构、契约、数据流与取舍，不重复需求条目。
> 事实来源：`research/installed-dsh-contracts.md`、`research/plugin-isolation-feasibility.md`、提取的官方插件开发文档与模板（`research/extracted/.../cordis-plugin-development/`）。

## 1. 交付形态与边界

- 交付一个 DSH 插件 **bundle** 包：`@local/dsh-modeldeck`。
  - Host 半边：`index.js`，导出 `export function apply(ctx, config) {}`。
  - Client 半边（Web）：`client.js`，通过 `window.__ModuleLoader__.load({ id, factory(require){...} })` 注册槽位条目。
  - 清单与资源：`package.json`（含 `dsh.bundle.patch`、`dsh.client`）、`cordis.patch.yml`、`locale/en.json`、`locale/zh.json`、`icon.svg`。
- 安装：由 `plugin_manager`（`action: install_bundle`，目标为工作区绝对包目录）安装到当前 profile；**当前主会话工具集中未提供该工具**，因此本轮实现止于“可安装的包 + 可运行的纯逻辑测试”，安装与 UI 渲染验证作为显式未验证项上报。
- 明确的边界：不修改 DSH 安装文件、不改 profile 的 `package.json`/`cordis.patch.yml`、不创建 `$DSH_HOME` 下的包。

## 2. 分层与模块划分

| 层 | 文件 | 职责 | 可验证性 |
| --- | --- | --- | --- |
| 纯领域逻辑 | `src/deck-core.js` | 组合键规范化、历史去重/置顶/限额、钉住/取消钉住、固定项排序、项目记录不变量 | Node 单测 |
| Host 集成 | `index.js` | 项目级持久化服务、`session/event` 观察器、向 Client 暴露投影/命令 | 语法检查 + 安装后运行 |
| Client UI | `client.js` | 槽位注册、当前配置摘要、固定/历史列表、应用与钉住交互 | 语法检查 + 现场页面 |
| 资源 | `locale/*.json`、`icon.svg`、清单 | 展示元数据 | 清单校验 |

设计原则（来自官方 practices）：会话日志是唯一事实来源；插件内存是派生缓存；所有注册以 `ctx.effect`/`ctx.on` 拥有并在卸载时清理；不为 `session/event` 新增自定义事件类型。

## 3. 关键契约

### 3.1 组合键 `ConfigKey`

```
key(provider, model, reasoningEffort?) = `${provider}\u0000${model}\u0000${reasoningEffort ?? ''}`
```
- 规范化：去除首尾空白；`reasoningEffort` 缺失与空串等价；大小写按 DSH 返回值原样比较（不做小写化，避免误判不同适配器 ID）。
- 显示名不参与 key。

### 3.2 项目记录 `ProjectDeck`

```ts
type Preset = {
  id: string;            // 稳定本地 id
  name: string;          // 显示名，可改
  provider: string;
  model: string;
  reasoningEffort?: string;
  source: 'manual' | 'pinned';
  order: number;         // 固定区排序
  createdAt: string;     // ISO
};
type HistoryEntry = {
  provider: string;
  model: string;
  reasoningEffort?: string;
  lastUsedAt: number;    // 最后成功使用时间（epoch ms）
};
type ProjectDeck = {
  projectId: string;     // workspace entity id
  presets: Preset[];
  history: HistoryEntry[];
  updatedAt: string;
};
```

**不变量**（由 `deck-core` 强制）：
1. 任一 `ConfigKey` 至多出现在 `presets` 或 `history` 之一（互斥）。
2. `presets` 内 `ConfigKey` 唯一（D3）。
3. `history` 内 `ConfigKey` 唯一，且按 `lastUsedAt` 降序。
4. 未钉住的历史最多 20 条；`presets`（含钉住来源）不受该上限影响。

### 3.3 应用契约（受支持，含已披露副作用）

```ts
const r = await ctx.remote.session.selectModel({ sessionId, provider, model, reasoningEffort? });
// 成功：r.ok && r.value.selected = { provider, model, reasoningEffort? }
// 失败：r.ok === false; r.error.code / r.error.message
```
- 前置校验：用 `ctx.remote.session.modelCatalog()` 的 `groups/routableProviders` 判断可用性；不可用则不发请求，直接报错。
- 成功后：以 `r.value.selected` 的规范化元组写历史（而非入参），确保与实际安装一致。
- 不使用 `ctx.sessionController.agents.selectForNextRequest` 等内部接口（prd AC-15）。

### 3.4 当前配置读取

- 客户端：`binding.session.projections.faceOf('modelSelection')` → `{ lastUsed, next }`；`getSnapshot()`/`subscribe()`。
- 匹配：用 `next ?? lastUsed` 与列表项 key 比较；都为空则视为“自定义”并显示目录默认。

## 4. 数据流

```
[用户点击条目]
  → 校验 catalog 可用性（不可用 → 提示，保留旧配置，不写历史）
  → ctx.remote.session.selectModel(...)
  → 成功：selected 元组 → deck-core.recordSuccess(deck, selected, now)
       · 若 key 已在 presets（钉住/手动）→ 仅更新其 lastUsedAt（不入 history）
       · 否则 upsert history：去重、置顶、按 20 条淘汰最旧未钉住项
       → 持久化（失败必须上报，不谎报成功）
  → 失败：展示 error，deck 不变
[DSH 自带入口切换]
  → Host 监听 session/event(model/selection) → 同一 recordSuccess（D2）
```

## 5. 项目隔离与存储

- **项目键**：优先 `ctx.workspaceRegistry` 实体 `id`（稳定）；无 entity 时回退到规范化 `path`。会话与工作区归属以 `cwd` 对应 workspace 实体判定。
- **存储介质**：待安装环境 inspection 确认。设计采用一个 `ProjectDeckStore` 接口隔离：
  ```ts
  interface ProjectDeckStore {
    load(projectId): Promise<ProjectDeck | undefined>;
    save(deck: ProjectDeck): Promise<void>;   // 失败必须抛出
  }
  ```
  首选 Host 侧可用的持久化服务（通过 `cordis_inspect_query` 的 `Service` 查询确认后再定），回退方案为插件自有数据目录的 JSON 文件（按 `projectId` 分文件）。**在确认存储 API 前不写死实现**，这是实现阶段的第一个验证门。
- 隔离保证：所有读写都以 `projectId` 为键；切换项目即切换键；不跨键读取。

## 6. 兼容与异常

| 场景 | 处理 |
| --- | --- |
| 模型/提供商不可用 | 应用前用 catalog 拦截，提示原因，保留旧配置，不写历史 |
| 不支持推理 | 隐藏推理控件；key 中 `reasoningEffort` 为空 |
| selectModel 返回失败 | 展示 `error.code/message`，deck 不变 |
| 持久化失败 | 明确报错，不显示为已保存（D9/AC-09） |
| 共享默认值副作用 | UI 常驻说明：其他项目未选择/新建会话可能继承默认 |
| 无当前项目/会话 | 禁用应用按钮并说明 |

## 7. 取舍与已知限制

- **放宽隔离**（prd 已确认）：接受 `selectModel` 的共享默认值副作用。这是方案 B 下唯一受支持路径。
- **历史观察范围**：插件挂载期间观察 `session/event`；不处理卸载期/崩溃期补录（列为后续）。
- **不新增事件类型**：历史状态保存在插件存储，不写 `model/selection` 以外的事件。
- **UI 依赖槽位契约**：首选 `conversation.composer.dock`；若其 props 不含所需会话选择器，则退回 `conversation.input.activity`。需现场 `Slots.listSubTree` 确认。

## 8. 上线与回滚

- 上线：`install_bundle` 安装后，profile 内所有会话可见；HMR 激活新 bundle。
- 回滚：`remove_bundle` 移除插件；数据文件独立保留（可按需清理）。
- 数据兼容：`ProjectDeck` 带 `schemaVersion`，读取时做向后兼容迁移；未知字段保留。

## 9. 待验证技术门（实现前必须确认）

1. 项目级持久化 API/路径与写入失败上报方式（决定 `ProjectDeckStore` 实现）。
2. UI 槽位契约与 props（`Slots.listSubTree`）。
3. `modelSelection` 投影在 Client 的实际可读性。
4. `session/event` 在 Host 侧对 `model/selection` 的可用性与事件字段。
5. 最低兼容 DSH 版本。
