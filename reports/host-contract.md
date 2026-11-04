# 宿主接口核对（2026-11-05）

执行电脑 check_app_update 回执 currentVersion 为 0.1.125。GitHub get_tag 验证 v0.1.125 对应 ac785430449042f120a296b881a25ae52333f1e1。

核对同一提交：

- [ghostPreload.ts](https://github.com/makecindy/cindy/blob/ac785430449042f120a296b881a25ae52333f1e1/apps/desktop/src/preload/ghostPreload.ts)：library(req)、onHostMessage 与 send 桥接。
- [librarySlot.ts](https://github.com/makecindy/cindy/blob/ac785430449042f120a296b881a25ae52333f1e1/apps/desktop/src/main/cindy-brain/librarySlot.ts)：db.open / exec / batch / migrate、结构化错误、存储不可用处理。
- [libraryDbCore.ts](https://github.com/makecindy/cindy/blob/ac785430449042f120a296b881a25ae52333f1e1/apps/desktop/src/main/cindy-brain/libraryDbCore.ts)：db.exec 返回 rows，batch 整批事务、失败回滚；最多 200 条/批，查询最多 2000 行。
- [manifest.ts](https://github.com/makecindy/cindy/blob/ac785430449042f120a296b881a25ae52333f1e1/packages/plugin-protocol/src/manifest.ts)：schemaVersion 3、mainView、mobile、library、notify。
- [mobilePageService.ts](https://github.com/makecindy/cindy/blob/ac785430449042f120a296b881a25ae52333f1e1/apps/desktop/src/main/cindy-brain/mobilePageService.ts)：声明频道、页面来源与 /wake 转发。

随宿主手册核对 mainView 使用 fetch('/wake') 与 BroadcastChannel；手机每帧限 48 KiB，写入必须自行做 requestId 去重。实现每页 20 条，并用中文最长备注验证帧大小。mobilePageId 显式用于对应页面触发的 notify；不记忆“最近手机”。后台启动检查属于电脑提示。

这些是接口证据，不是手机实机或完整重启的通过证明。实际验收状态另见 delivery.md。
