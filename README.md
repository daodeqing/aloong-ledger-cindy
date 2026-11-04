# 阿龍记账 · Cindy 插件

独立的本地个人账本，插件 id 为 liang-ledger，版本 0.1.0。使用 Cindy Library SQLite，运行时不依赖 ALOONG 服务器、账号、Node、Codex 或 Android 服务。

## 使用

1. 将 [plugin/liang-ledger-0.1.0.cindy](plugin/liang-ledger-0.1.0.cindy) 导入 Cindy，并确认宿主展示的权限。
2. 从 Cindy 左侧打开“阿龍记账”，或在聊天中输入 $记账。
3. 记录支出/收入、查看今日或历史账单、编辑账单、按月看汇总与分类。
4. 添加每周、每月或每年订阅。到期后点“确认已扣款”才入账，也可跳过、暂停或归档。
5. 手机从绑定电脑的插件工作台打开。电脑必须在线，手机不持有离线账本。

金额以正数人民币元输入，数据库保存整数分；收支用 kind 区分。每月按原始日期锚点滚动，例如 1 月 31 日 → 2 月末 → 3 月 31 日；闰日年订阅在下个闰年恢复 2 月 29 日。不会补写过去所有订阅账单，过期多期时逐期确认或跳过。

## 数据与提醒

账本、订阅、周期处理、请求回执和表单草稿保存在 Cindy 管理的 Library。卸载插件的数据保留规则由 Cindy Library 决定。写入失败不会把不可用账本当成空账本重建。

所有写操作带 requestId。超时先查询原请求；页面提供“查询原请求”，只有用户主动选择时才重发完全相同的请求。修改账单/订阅还需使用查询返回的 revision。确认/跳过需要原样使用 period_key，防止跨页面重复入账。

到期检查仅在插件被唤醒或工作台打开时进行，每个订阅每天最多尝试提示一次。完全退出 Cindy 时没有后台提醒；轻提示未送达也仍可在到期列表中处理。提醒不会自动入账。

JSON 导出含账单、订阅和周期记录；CSV 只含账单，金额单位“分”。导出分页取全量，超时或断连会报错；完成后请核对文件。导入恢复、跨设备独立账本同步、共享账本与服务器迁移不在本版范围内。

## 源码与构建

- src/：规则、事务服务、工作台与清单。
- plugin/：可打包源码与安装包，独立于开发工具运行。
- scripts/build.py：Python 构建，不需要 npm。
- tests/：金额/日期、SQLite 事务、幂等与重启验证。
- reports/：实际测试与交付状态。

构建：python -X utf8 scripts/build.py。
验证：python -X utf8 scripts/verify.py（需要本机已有 Node 24，仅用于验证；运行插件不需要）。
测试预览：python -X utf8 scripts/preview_server.py，只监听 127.0.0.1:8787。它使用独立测试数据库，不能证明 Cindy 手机或实际 Library 链路通过。
清理：python -X utf8 scripts/cleanup.py，只将明确的项目缓存移入 Windows 回收站，并输出文件/大小报告。

## 兼容与来源

执行电脑核实 Cindy 0.1.125；官方 v0.1.125 指向 [ac785430449042f120a296b881a25ae52333f1e1](https://github.com/makecindy/cindy/tree/ac785430449042f120a296b881a25ae52333f1e1)。接口核对证据见 reports/host-contract.md。

分类文案与分类图标按用户要求源自 ALOONG 项目；没有复制服务器或 Android 自动捕获代码。源素材未附独立许可证，仓库未擅自赋予新的开源许可证。

本项目由用户主导，AI 辅助开发：Cindy (https://cindy.app)。
