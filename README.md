# dsh-modeldeck

DeepSeek Harness 模型卡组插件。在会话输入框旁打开卡组，保存常用的「提供商 / 模型 / 推理等级」组合，并一键应用到当前会话。卡组提供固定配置和最近历史，数据按项目区分。

要求 DeepSeek Harness `>=0.2.1-rc.1`。

## 安装

### Web（CLI）

从 npm 安装已发布版本：

```bash
dsh plugin --profile web add "@misaka10091/dsh-modeldeck"
```

本地开发或尚未发布到 npm 时，也可以从本仓库安装：

```bash
dsh plugin --profile web add "<本仓库的绝对路径>"
```

启动 Web profile 时固定端口，以便下次启动沿用同一个浏览器存储源：

```bash
dsh --profile web --no-open --port 8123
```

### Desktop

在桌面应用内通过插件管理安装（`plugin_manager` 的 `install_bundle`），目标选择本仓库绝对路径或已发布的 `@misaka10091/dsh-modeldeck`，安装后重启 DeepSeek Harness。桌面应用的 `desktop` profile 由 Electron 管理，通常不能通过 CLI 的 `dsh plugin --profile desktop add` 安装。

## 使用

1. 打开一个会话，点击输入框旁的「模型卡组」图标。
2. 点击「固定」区的 **＋**，依次选择提供商、模型和推理等级（如有），添加常用配置。
3. 点击固定配置或最近历史中的条目，将该组合应用到当前会话。匹配当前组合的条目会高亮；无法识别当前模型时显示「自定义」。
4. 双击固定配置或点击编辑图标可重命名；拖动可调整顺序。历史条目可以钉住到固定区，固定配置也可以取消钉住移回历史。悬停或聚焦条目可显示操作图标。

切换成功后会更新最近历史，包括通过 DSH 原生模型选择器完成的后续切换；相同组合会去重并按最近使用时间排序，最多保留 20 条。已经固定的组合不会重复出现在历史区。应用失败会显示错误，且不会把该次切换写入历史。

**注意：**应用模型时也会更新 DSH 的共享默认值；其他项目中新建的会话，或尚未选择模型的会话，之后可能沿用该默认值。

## 数据保存与限制

- 固定配置、历史、钉住状态和顺序保存在客户端浏览器的 `localStorage`，优先按工作区路径区分项目；无工作区路径时使用可用的项目标识，均不可用时共用 `global` 数据。
- Desktop 的页面源为 `dsh-app://app`，通常能在重启后继续读取本地数据。Web 使用浏览器页面源；更换端口或访问地址会读取到另一份数据，因此建议固定 `--port`。
- 清除站点或应用数据会删除卡组；当前版本没有跨设备同步。Host 端持久化接口尚未接入。

## 开发

```bash
npm run check:syntax
npm test
```

- [`client.js`](./client.js)：卡组界面、模型目录接入与当前的 `localStorage` 持久化。
- [`src/deck-core.js`](./src/deck-core.js)：配置去重、历史限额等纯逻辑；测试位于 [`test/deck-core.test.js`](./test/deck-core.test.js)。
- [`index.js`](./index.js)：Host 侧会话事件观察与未来持久化接入的接口；目前不承担卡组数据的持久化。

版本发布流程见 [`RELEASING.md`](./RELEASING.md)，变更记录见 [`CHANGELOG.md`](./CHANGELOG.md)。
