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
dsh --profile test --no-open --port 8123   # 固定端口，localStorage 才跨重启保留
```

或使用 `plugin_manager` 的 `install_bundle` 安装到目标 profile。

## 安装到 Desktop（正式使用，由用户自行执行）

```bash
dsh plugin --profile desktop add "D:/workspace/github/dsh-modeldeck"
```

然后重启 DeepSeek Harness 桌面应用。桌面渲染层 origin 固定为 `dsh-app://app`，因此 localStorage 会跨重启保留（存储位于 `%APPDATA%\@deepseek-ai\dsh-desktop\Local Storage`）。卸载：`dsh plugin --profile desktop remove @local/dsh-modeldeck`。

## 持久化说明

- 持久化使用浏览器 localStorage，按工作区路径分键。
- **Desktop 应用**：渲染 origin 恒为 `dsh-app://app`，跨重启保留。
- **`dsh web`**：每次启动端口随机，origin 变化导致数据丢失；需固定 `--port`（如 8123）。
- 清应用数据 / 重装 / 换设备会丢失；跨设备需改为 Host `ctx.storageDomain`（未实现，见下）。

## 开发

- `src/deck-core.js`：纯领域逻辑（组合键、去重/排序/限额、钉住、项目记录不变量），附 `node --test` 单测。
- `client.js`：Web 客户端（槽位、面板、目录/应用/历史）。
- `index.js`：Host 半边（会话事件观察的接缝，便于后续迁移到 Host 持久化）。
