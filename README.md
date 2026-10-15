# Beautiful Chat Plus for Paseo

Beautiful Chat 的社区修改版，重点是紧凑的执行过程、美化后的工具详情、按需加载图片和较轻的渲染效果。基于 [ABorakati/beautiful-chat](https://github.com/ABorakati/beautiful-chat)，保留原项目 MIT 许可证。它不是 Paseo 官方插件。

## 功能

- 连续工具调用、思考和支持的纯图片结果默认合并，显示调用次数、思考段数，以及进行中、失败和取消数量。
- 展开分组仍使用美化卡片，每条工具和思考可以独立展开；提问和正文不会合入执行过程。
- 截图结果先显示紧凑摘要，点击才加载；支持图片预览、适应窗口和放大。
- 保留原生用户附件；为支持的 Claude/Codex 历史消息补回缺失的文件/图片入口，重复正文不猜测。
- 工具、思考和图片展开状态按会话及源消息隔离，虚拟卸载后恢复；图片加载占位保持高度。
- 淡蓝紫用户气泡、柔和玉绿强调色、较轻的玻璃效果，以及蓝绿运行圆环。
- 长代码分段显示，高亮请求合并与缓存；合并鼠标光效更新，减少无效动画和重复用量读取。

## 安装

在需要安装的 **Paseo daemon 所在机器**上执行，需要 Git、npm 和已开启的 Paseo 插件功能。

首次使用请在该主机的 **设置 → 插件**中开启插件。插件是受信任、未沙箱隔离的代码。

如果已经启用了原版 `beautiful-chat` 或本机实验版 `beautiful-chat-local`，先在插件设置中关闭它们，避免多个插件同时替换聊天消息。

安装已发布的版本：

```sh
paseo plugin add git:leansz-coder/paseo-beautiful-chat --ref v0.3.0
paseo plugin ls
```

也可以在 **设置 → 插件 → Plugin source** 输入：

```text
git:leansz-coder/paseo-beautiful-chat
```

此方式安装默认分支当前版本。安装后的插件 ID 为 `beautiful-chat-plus`，显示名为 **Beautiful Chat Plus**。安装和插件更新不需要重启 daemon。

插件按主机安装；连接同一个主机的客户端会获取该主机的插件。其他独立主机需要各自安装。

## 更新和回退

```sh
# 查看可用更新
paseo plugin update beautiful-chat-plus --check

# 查看并确认更新
paseo plugin update beautiful-chat-plus

# 明确切回某个已发布版本
paseo plugin update beautiful-chat-plus --ref v0.3.0
```

首次安装的 `--ref` 不会永久固定后续更新。普通 Git 更新会查看默认分支；需要指定版本时显式传 `--ref`。

关闭插件并恢复宿主显示：

```sh
paseo plugin disable beautiful-chat-plus
```

## 设置与兼容性

在插件的 **Chat presentation** 设置中可调整强调色、字体、玻璃、鼠标光效、用户气泡、Markdown 和执行过程折叠。展示偏好沿用原项目的客户端本地存储，不会自动在设备间同步；部分变换设置需要重新打开会话页才能应用到已有消息。

目前实测环境是 **Paseo 0.11.1 的 macOS 桌面客户端**。manifest 暂限定 `>=0.11.1 <0.12.0`，该范围不是每个版本都已测试的承诺。

- **分组和圆环只适用于桌面/Web。** 分组通过 DOM 观察宿主已挂载的近期消息，圆环使用 CSS。它们依赖 Paseo 页面结构，升级客户端后需要复核。
- **虚拟化旧历史保留独立美化卡片。** 不强行修改虚拟列表高度，以免破坏滚动定位。
- **原生 iOS/Android 不做 DOM 分组、附件恢复和圆环替换。** 共用卡片仍有原生渲染路径，但本版本未做真机验证；嵌入字体和部分 Web 效果不适用。
- 纯图片摘要只识别支持的完整 Markdown 图片语法；带正文、引用式或未完成的图片消息保留原生渲染。图片读取沿用大小和格式限制。
- 搜索只覆盖已渲染内容；折叠组中未挂载的详情不能由插件查找栏搜索，需要先展开。不要把它当作完整会话历史搜索。
- 新增摘要文字目前主要为中文，尚未提供完整多语言配置。

## 数据与运行边界

此版本的增强集中在显示层，没有新增会话停止、取消、重启或自动发送消息的功能。分组不修改原始消息记录，附件恢复会按 agent 读取主机上的原始 Claude/Codex 日志，分批扫描并增量索引附件元数据；不修改日志或向第三方发送日志。

原项目已有后端功能包括：按消息里的路径读取图片、语法高亮，以及用户点击文件链接后在 **daemon 所在机器**的文件管理器中定位文件。远程主机上的文件链接不会打开本机 Finder。用量显示会读取当前会话状态；点击外链可能打开浏览器，展开远程图片可能请求对应图片地址。

附件文字匹配必须在完整扫描后确认唯一；有可核对的消息 ID 时优先匹配。恢复仅保留最近 200 条上传记录，单行超过 8 MiB 或日志解析异常时禁用文字回退。首次长日志扫描完成前，补充附件可能暂未显示。历史分组仍有限制，也不保证消除所有滚动跳变。

## 开发

建议使用 Node.js 22 和 npm：

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
```

Git 安装会按照 lockfile 自动执行 `npm ci --omit=dev --ignore-scripts`，安装运行依赖。Paseo 负责编译 TypeScript，并提供 React、React Native 等宿主模块。

源代码保留原版的 Web 适配方式，包括分散在组件中的 DOM 辅助函数；跨平台隔离还需要进一步整理。当前版本适合作为桌面实验版使用。

## 来源与许可

基于原项目提交 `42b61d8301b5400a67821bbbfcf99fa8b681dc37`，在此基础上加入性能改进、图片预览修复、配色和执行过程分组。

发布仓库使用干净的源码快照，不包含本机实验记录、会话截图、主机配置或原实验仓库历史。

代码许可证见 [LICENSE](LICENSE)，内嵌字体和图标的来源及许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
