# 工作台连接与点击修复 · 0.2.3

日期：2026-11-05。执行宿主只读版本查询为 Cindy 0.1.125。

## 原因与证据

- 用户截图地址是 http://127.0.0.1:8789/main-view.html，当前浏览器 tab 也是该地址；读取时已是 chrome-error://chromewebdata/，/wake 无法访问。这是临时预览入口，不能作为已安装插件页面或真实电脑离线的证明。
- 正式包 main-view.html 原先使用内联脚本。宿主 ac785430449042f120a296b881a25ae52333f1e1 的 electronSandboxAdapter.ts:419、793 给 HTML 发送 default-src 'self' 且未放行内联脚本。界面可以显示，脚本与事件绑定会被拦截。此前普通 HTTP 预览没有复制该安全策略，遗漏了这项验收。
- 旧页面每 400ms 自动重发全部请求，包括写入与 AI 调用；幂等账单不能避免重复模型费用。现在仅重试只读 ping，实际操作只发送一次。

## 完成

- view.js 使用包内相对路径加载；没有放宽宿主 CSP，没有扩大权限。
- 校验 /wake 的 HTTP、JSON 和 running/starting 状态，握手成功后才发送业务请求；并发复用握手。异常与关闭时清理定时器。
- 未确认写入禁止新写入，保留原 requestId 供查询或用户主动重试；AI 不自动重发。
- 测试服务器使用相同 CSP，预览顶部明确标记独立测试账本与正式入口。
- Forge pack 成功；Forge install 回执 action=updated，version=0.2.3，namespace=local，instanceId=_ns__local__liang-ledger，enabled=true。

## 验证与界限

- Python 驱动 JavaScript 语法、业务、路由、AI 与通信回归：21/21 通过。
- 带宿主相同 CSP 的浏览器预览：重连成功；1.001 元被拒且输入保留；0.29 元成功保存；9.90 元月订阅创建并通过按钮确认扣款，汇总 10.19 元。
- 同源 320px / 900px 双页面均显示已连接账本与 10.19 元；scrollWidth 等于 clientWidth（305 / 885），无横向溢出。这是桌面视口模拟，不等于手机实机验收。
- 原真实插件账本查询仍为两笔记录、支出 2224 分；本轮测试数据仅写入项目 .cache/preview.sqlite，不写真实账本。
- 正式工作台导航已定位“更多 → 阿龍记账”，但前台桌面输入被 USER_INPUT_ACTIVE 拒绝，未继续抢占用户输入。正式工作台点击与真机 Device Link 验收尚未完成，未提交市场审核。

## 源码依据

- https://github.com/makecindy/cindy/blob/ac785430449042f120a296b881a25ae52333f1e1/apps/desktop/src/main/cindy-brain/runtime/electronSandboxAdapter.ts#L419
- https://github.com/makecindy/cindy/blob/ac785430449042f120a296b881a25ae52333f1e1/apps/desktop/src/main/cindy-brain/runtime/electronSandboxAdapter.ts#L793
- https://github.com/makecindy/cindy/blob/ac785430449042f120a296b881a25ae52333f1e1/apps/desktop/src/main/cindy-brain/index.ts#L8965
