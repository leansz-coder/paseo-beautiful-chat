# 历史分组限制

2026-10-15，本机 Paseo 0.11.1 源码核对结果。

## 原因

`client/activity-groups.ts` 在渲染后对已挂载的相邻行分组。近期普通行可以折叠，但带 `data-index` 的历史虚拟行被明确排除。历史行是绝对定位，位置和总高度由 Paseo 的虚拟列表管理；只隐藏 DOM 会让插件显示状态与宿主的行集合及高度估计不一致。

工具在插件 transformer 中已被替换为 plugin item，因此也不再参与 Paseo 原生工具分组。结果就是历史工具仍是美化卡片，但逐条显示。该问题尚未修复，不是折叠开关关闭。

当前接口只向 transformer 提供单个 item 和 phase，要求同步、确定性转换。它没有相邻消息、完整分组上下文或虚拟列表锚点接口，不能可靠地跨条目聚合。使用可变全局缓存猜测相邻消息会与宿主投影缓存、分页和多个会话冲突。

## 正确实现的位置

应在 Paseo 形成虚拟列表输入前构建稳定的 activity group，再由组渲染器呈现插件卡片。组必须包含真实子条目、调用/失败/运行/思考统计及稳定 ID，展开状态不能依赖当前挂载窗口。

需要同步处理：分页追加旧记录、加载新消息、流式完成、失败、组内逐条展开、切换会话、跨虚拟边界和阅读位置恢复。用户消息、助手正文及待回答交互应保持边界。

参考源码位置：

- `packages/app/src/plugins/timeline/model.ts`：逐条 transformer。
- `packages/app/src/plugins/timeline/projection.ts`：按源对象缓存投影结果。
- `packages/app/src/agent-stream/presentation.ts`：插件投影和宿主分组顺序。
- `packages/app/src/agent-stream/strategy-web.tsx`：`data-index`、虚拟行测量、绝对定位和阅读锚点。
- `packages/app/src/agent-stream/presentation.test.ts`：只对未被插件接管的工具分组的测试。

本轮保留虚拟行保护，未修改安装中的 Paseo 客户端或重启会话。已修复普通分组在前置加载历史时更换组首、丢失展开选择的问题；不能据此声称所有滚动跳变已经解决。
