# verify-taiji-yang 场景覆盖矩阵

P0 验收项（来自 README 承诺层与 DSH-PLUGIN-RULES 的真实验收分工）↔ 场景断言行的对账。维护单元 = 本表矩阵行：交付触达某行时同步改场景并在本表更新状态。覆盖范围 = 根包 tai-ji-yang-shell；子包 opendesign-design-mode 的验收项不在本表，见文末「子包维度」节。

状态：`covered`（场景断言已锁定）/ `degraded-channel`（有断言但缺通道，显式降级）/ `uncovered`（登记未做）。

## brand（品牌区与版本行）

| 验收项 | 断言 | 状态 |
|--------|------|------|
| 打开即太极：侧栏品牌栈渲染 | `.taiji-brand-stack` 在场 | covered |
| 产品名文案（zh/en locale） | = 太极 / TaiJi | covered |
| 版本行 `v{本包} · dsh v{宿主}` | 文案匹配 + 不裁切 | covered |
| 宿主版本解析缺席降级只显本包版本 | 文案匹配 `v{本包}`，降级登记 | covered |
| 首绘前样式注入（Node 半场） | `__TAIJI_SHELL_INFO__` version = 本包版本 | covered |
| hero 首屏品牌区 | `.taiji-hero-area` 在场（空会话态） | covered |
| 无 Slot 崩溃 | 错误级控制台 = 0 | covered |

## head（会话头重塑，P-1）

| 验收项 | 断言 | 状态 |
|--------|------|------|
| header 单行化（空态/会话态） | 高 ≤45px / 41±2px | covered |
| 无横向溢出 | scrollWidth ≤ innerWidth | covered |
| 右侧栏开关贴最右（corner 子槽保留） | x 最大 + 右缘 ≈ header 右缘-14px | covered |
| 按钮视觉序单调无并列 | x 排严格递增 | covered |
| 目标按钮子序 | 对话→轨迹→打开方式→chevron→右侧栏 | covered |
| More actions 隐藏 | display none / DOM 缺席 | covered |
| 打开方式拆分钮在场（utilities 子槽） | aria-label 命中 | covered |
| 分段控件形态 | 高 30px / 底色 = bg-layer-1 解析值 / 激活 600 / ::after none | covered |
| 会话头状态图标（actions 槽追加） | 四态图标渲染 | uncovered（需会话处于运行/完成态，runner 不发模型请求；以手工验收或后续 fixture 扩展） |

## theme（配色切换）

| 验收项 | 断言 | 状态 |
|--------|------|------|
| chip 快速配色入口 | chip 可见 + 色卡弹出 | covered |
| 切换换表 | brand-primary 解析值变化 | covered |
| 持久（插件 Config volatile） | reload 后仍所选色 | covered |
| 恢复默认（场景收尾不污染实例） | brand-primary 回基线 | covered |
| 六色齐备 | swatch 数量 = 6 | covered（经外观行/chip 渲染核验） |
| 明暗模式跟随宿主（本包不写偏好） | 切换配色不改宿主明暗 | uncovered（需宿主偏好驱动；属宿主域，登记不属本包验收范围） |
| 字体复合简写（字重/行高落地） | 正文 computed font-weight/line-height | uncovered（head 的激活字重 600 已覆盖一处消费点；全量对账归 pnpm check 的静态断言） |

## projects（项目分组侧栏，P-4）

| 验收项 | 断言 | 状态 |
|--------|------|------|
| 整槽替换生效 | `.taiji-pb-list` 在场 | covered |
| 数据服务就绪 | 无 `.taiji-pb-unavailable` | covered |
| 默认项目组头 | `.taiji-pb-ghead-default` 在场 | covered |
| 当前会话行标记 | `.taiji-pb-row-current` 在场（前置 = 已有会话） | covered（无会话时显式降级） |
| 「当前」chip 居中 | 文字与 chip 中心偏差 x/y 均 ≤1px | covered（与当前行同前置） |
| 项目建/改名/删除/排序（设置页 taiji 分区） | 交互链路 | uncovered（写通道场景，隔离 profile 可安全做；待扩展） |
| 会话归组（拖拽/组头「+」pending 消费） | 归属映射变化 | uncovered（同上） |
| 禁用后项目数据留存 / 卸载后随行清除 | Config 字段存在性 | uncovered（需 dump 插件 Config 的宿主通道；lifecycle 已验「卸载后组合层消失」，数据层待扩展） |

## lifecycle（生命周期回落）

| 验收项 | 断言 | 状态 |
|--------|------|------|
| 卸载后品牌栈消失（回落宿主） | reload 后 `.taiji-brand-stack` 不在场 | covered（仅隔离 profile） |
| 三处痕迹清零 | `taiji-` 前缀元素 = 0 | covered |
| 页面不白屏 | root 子元素 > 0 | covered |
| 组合层移除 | `--dump-config` 不含本包层 | covered（desktop profile 拒绝 dump 时显式降级） |
| 禁用（disable）回落 | fiber 卸载、贡献点撤销、Config 留存 | degraded-channel（DSH CLI 无 disable 子命令；notProvable 登记，恢复动作 = 宿主插件页手工禁用核对） |
| 卸载后悬空 patch 行（宿主行为，README 排障 8） | 仅登记不判定 | covered（宿主统一行为，非本包缺陷） |

## 环境与安全（跨场景不变量）

| 验收项 | 断言 | 状态 |
|--------|------|------|
| 隔离：不碰用户 ~/.dsh | args 拒绝 + doctor params | covered（tests/verify-runner.spec.ts 合成覆盖） |
| 零模型请求 | 场景只点击/重载，不输入文本 | covered（设计约束 + 代码审查口径） |
| 按 PID 清理、禁 pkill | 进程组 SIGTERM/SIGKILL | covered（合成假 dsh bin 测试） |
| 凭据不入公开日志 | URL 行 redactToken | covered（单测覆盖） |

## 子包维度（opendesign-design-mode）：不在本 runner 覆盖范围

子包的真实宿主验收场景——预览面板、伺服路由、doctor、preset 注册、材质化、共存回归——全部不在本 runner 覆盖范围，本表不为它们登记 covered / uncovered 状态。

- 入口：`pnpm test:e2e:design-mode`（node 直跑，场景在 `packages/opendesign-design-mode/tests/e2e/`，覆盖 web 与桌面 0.2.x 双版本宿主）。
- 共存回归命题（两包安装进同一 profile，子包 preset 注册与 UI 注入不干扰根包 shell 包）由该 e2e 的 S8 场景承载。本 runner 自启形态只装根包，单装态结果不得登记为共存回归通过。
