# dsh-modeldeck

DSH 模型卡组插件（`@local/dsh-modeldeck`）：在会话输入框旁提供「模型卡组」快捷入口，按项目保存**固定配置**与**最近历史**，一键切换当前会话的提供商 / 模型 / 推理等级。

## 功能

- **项目隔离**：固定配置、最近历史、钉住状态、排序按工作区路径分键保存。
- **固定配置**：从 DSH 现有模型目录选择提供商→模型→推理等级新增；支持**重命名**（双击或铅笔图标）、**拖动排序**、**移除**。
- **最近历史**：自动记录每次成功的模型切换（含通过宿主原生模型选择器所做的切换，因为共享同一个 `ctx.modelDirectories.directoryFor(sessionId)` store）；按完整组合去重、置顶、上限 20 条；失败不记录。
- **钉住**：历史项一键钉住进入固定区；固定项取消钉住回到历史；同一组合不同时出现在两个区域。
- **快捷切换**：点击条目即调用受支持的 `directory.select()` 应用到当前会话；高亮当前匹配项；无匹配显示「自定义」。
- **兼容与异常**：仅展示已配置且可用模型与受支持推理等级；应用失败保留原配置并提示原因，不写历史。
- **UI**：触发器为图标按钮（`conversation.input.activity` 槽位），面板浮于输入框上方、无遮罩、不遮挡工具栏；图钉/移除等操作图标悬停显示。

## 安装（测试 profile）

```bash
dsh plugin --profile test add "D:/workspace/github/dsh-modeldeck"
dsh --profile test --no-open --port 0   # 打印带 token 的访问链接
```

或使用 `plugin_manager` 的 `install_bundle` 安装到目标 profile。

## 已知限制

- **持久化使用浏览器 localStorage**（按工作区路径分键，跨刷新/重启保留），而非 PRD 设想的 Host `ctx.storageDomain`。原因：客户端插件没有可写文件的 Host 通道（`dsh-api-workspace-files` 仅提供读取；自定义 Remote 需要 typert 构建产物，纯 JS 插件无法生成）。
- 相同模型「重复连续选择」会被 DSH 合并，历史不会重复触发；切换走再切回可复现去重置顶。
- 未做：跨设备同步、导入导出、按任务自动选模型。

## 开发

- `src/deck-core.js`：纯领域逻辑（组合键、去重/排序/限额、钉住、项目记录不变量），附 `node --test` 单测。
- `client.js`：Web 客户端（槽位、面板、目录/应用/历史）。
- `index.js`：Host 半边（会话事件观察的接缝，便于后续迁移到 Host 持久化）。
