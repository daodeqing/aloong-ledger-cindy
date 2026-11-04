# 交付与验收状态（2026-11-05）

## 已完成

- 独立源码、固定 id liang-ledger、版本 0.1.0、命令“记账”。
- mainView、mobile、Library、notify；没有网络、文件系统、Node、Android 或账号权限。
- 金额整数分、自然周期原始日期锚点、周期唯一键、请求幂等与冲突校验、事务回滚、编辑版本防覆盖。
- 工作台：今日/历史账单、月份与分类统计、账单编辑、订阅创建/编辑/启用/暂停/归档/确认/跳过、分页 JSON/CSV 导出、草稿、未知写入回查。
- Python 驱动 9/9 JavaScript/SQLite/路由测试通过。详见 business-tests.txt、verification.json。
- ghost_forge_pack 校验通过；安装包内容、资源路径、源码一致性校验通过。
- Cindy 内置浏览器的独立预览链路：320px 与 900px 实际 iframe 宽度、明暗主题、表单错误、新增 0.29 元、创建 9.90 元到期订阅、确认入账至月支出 10.19 元、页面重载后恢复均通过。
- 320px 视口 clientWidth=305（滚动条占 15），scrollWidth=305；900px 视口 scrollWidth=900。按钮最小高度 44px。
- Light/Dark 已并排截图查看。暗色主题背景 rgb(28,32,30)，文字 rgb(237,240,237)。静态检测的暗色 hover 建议项已修复为主题文字色。

## 本机与市场阻塞

ghost_forge_install 返回 MUTATION_CANCELLED：“用户拒绝了这次插件安装或更新。除非用户再次要求，不要重试。”

因此插件尚未安装，未进行真正 Cindy $记账、新增账单、订阅确认、宿主重启恢复。没有可用真机或模拟器，手机真实 Device Link 通信与真实触屏输入未验证。桌面窄视口、触控目标尺寸、页面/脑频道和手机来源路由测试不能等同于手机实机通过。

按用户约束“本机测试通过后再公开市场投稿”，未调用 ghost_contribution_prepare / submit，没有审核或上架记录，也没有将模拟测试记为宿主验收。

下一步需要用户重新明确授权安装，完成 Cindy 首次权限确认后再做宿主与手机验收；只有通过后再进行公开市场预检与提审。

## 仓库与产物

源码和安装包上传至独立私有仓库：https://github.com/daodeqing/aloong-ledger-cindy 。没有修改既有 daodeqing/liang-ledger 或 ALOONG 仓库。

产物位于 plugin/liang-ledger-0.1.0.cindy。准确大小及 SHA-256 见 verification.json。

## 清理

测试浏览器标签与全部 Python 预览服务已关闭。测试数据、下载的临时检查程序、复制的测试 Node、宿主源码证据缓存等在清理脚本中移入 Windows 回收站，保留源码、必要构建/验证/清理脚本、报告与安装包。清单与大小见 cleanup.json。

移至回收站只回收项目目录占用，不清空回收站，不能宣称实际释放了同等磁盘空间。
