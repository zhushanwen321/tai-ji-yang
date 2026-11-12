# verify-taiji-yang 场景覆盖矩阵

P0 验收项（来自 README 承诺层与 DSH-PLUGIN-RULES 的真实验收分工）↔ 场景断言行的对账。维护单元 = 本表矩阵行：交付触达某行时同步改场景并在本表更新状态。覆盖范围 = 根包 tai-ji-yang-shell；子包 opendesign-design-mode 的验收项不在本表，见文末「子包维度」节。

状态：`covered`（场景断言已锁定）/ `degraded-channel`（有断言但缺通道，显式降级）/ `uncovered`（登记未做）/ `notProvable`（验收项在 runner 通道不可自然构造，显式登记不判定，转单测或 D3 真机承接；与 runner 证据原语 `ev.notProvable` 及 verdict.json 顶层 notProvable 清单同名）。

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
| 三入口同步（V8 步骤 6-8，D-3 护栏） | 太极分区配色行 swatch 点选 → brand-primary 变化 → chip 选中态同步（chip 可见时；不可见时显式降级为分区自身选中态断言） | covered（theme 场景第三入口支：点选立即生效逐断言；外观行选中态同步无断言承载，补断言属可选增强） |
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

## model-service（模型服务分区与接入，dsh-model-service RL2/RL3/RL4/RL6 的真机面）

场景只对隔离 DSH_HOME 自启形态可达（要读设置文档与凭据文件）；URL 模式整场景显式降级。

| 验收项 | 断言 | 状态 |
|--------|------|------|
| 导航并存（D2 追加形态） | 宿主「模型」与插件「模型服务」两条导航条目都在 | covered |
| 无串页 | 点宿主「模型」后 `.ms-section` 收起且高亮落宿主条目 | covered |
| 三视图切换条 | `.ms-section .ms-viewbar-button` 数 = 3 | covered |
| 空态矩阵（V9 步骤 1） | 全新实例供应商视图空态有引导文案 | covered |
| 零模型保存前置（V1 步骤 4a） | 保存被拒 + models.saveBlockedEmpty 指引文案 | covered |
| 保存链路两处落盘（V1 步骤 5/6） | 设置文档出现 providers.<key>（apiKeyEnv 为 ref 名）+ 凭据文件出现对应 ref | covered |
| 热重算不重启（V1 步骤 7/9，RL2） | 宿主「模型」分区可见新供应商 + 页面无 reload（注入标记存活） | covered |
| 并发冲突重读重试（V1 步骤 11，RL3） | 第二写者保存成功 → 首写者保存自动重试 → 双方改动均保留 | covered（构造偏差登记：第二写者 = 同宿主的第二个 web 连接，宿主「模型」分区写者因面板互斥不可自动构造；机制断言等价，真机 D3 可另复验） |
| 密钥零泄漏（V4，RL7 真机面） | 设置文档无 sk- 明文（凭据文件持密钥是权威语义） | covered |
| provider key 撞已注册 route（V4 步骤 9 b 支的 route 侧） | 预检拒绝 + 设置文档零写入 | covered |
| provider key 中文回落（V4 步骤 1） | 名称含中文时 provider key 回落 ASCII 标识（deriveProviderKey 序号回落） | notProvable（派生规则由 provider-key 单测承载（u-foundation 验收），场景供应商名用英文构造，真机形态随 V1 接入链核验） |
| 凭据 ref 撞名 b 支文案（V4 步骤 9，RL10） | 直改凭据文件写入无引用者 ref 后保存被拒 + 「其他 profile」占用提示 + 设置文档零写入 + 改名重试成功 | covered（场景 V4 步骤 9 b 支：直改凭据文件是决策 7 已登记的同型入口，判定只看凭据文件存在性与本 profile apiKeyEnv 枚举） |
| 凭据 ref 撞名 a 支文案（V4 步骤 9） | 宿主分区派生 TAIJI_ 前缀 ref 的占用提示 | notProvable（需宿主「模型」分区写 taiji-* 路由供应商的表单自动化，超出场景通道；credentials-client 单测覆盖） |
| 待清理清单重试（V4 步骤 6，AX9） | unset 失败登记 → 重试成功移除 | notProvable（需让凭据服务在删除动作时不可用，超出场景通道；credentials-client 单测覆盖） |
| 清单来源态与空态（V9） | 自定义行 ms-source-custom、筛选无结果空态 + 清除动作 | covered |
| 清单目录默认态来源标注（V9 步骤 3） | 目录默认 provider 的清单行 ms-source-directory + 来源徽标文案 | notProvable（场景自然路径下供应商均带自定义清单，目录默认行不可达；归 D3 真机核验） |
| 托管 provider 只读行（V9） | ms-source-managed 行渲染 | covered（隔离实例无托管行时登记 notProvable，不假红） |
| 删除供应商双清除（V4 步骤 4/5，RL6 真机面） | 设置文档条目与凭据 ref 均清除（无孤儿） | covered |
| 既有 provider 跨 profile 确认删除（V4 步骤 8，D7 删除侧） | 删除宿主侧派生 ref 的 provider 出现跨 profile 确认提示：确认才 unset、取消则 provider 条目与 ref 均保留 | notProvable（构造需在宿主「模型」分区接入供应商输入密钥，超出场景通道；分支判定由 credentials-client 单测覆盖，真机形态归 D3 复验） |
| 路由创建与派生 id（V5 步骤 1-2） | 空态引导；同名二次创建不被拒、加序号并存、删第二条恢复 | covered |
| 路由成员落盘（V5 步骤 3） | 成员引用物理 provider/model 进插件 Config routes | covered |
| 白名单启停（V6 步骤 1-3，SC8） | 勾选落盘 whitelist / 取消移除 / 重新勾选恢复 | covered |
| 白名单悬挂与清理（V6 步骤 4-5） | 删路由转悬挂（「路由已删除」标注不自动清理）；批量清理只移除悬挂 | covered |
| 空白名单 = 全不暴露（V6 步骤 6） | Config whitelist 空断言 | covered（对话流选择器侧归 D3） |
| 成员行可用性标注（V5 步骤 9-10，G18） | 删成员供应商后路由成员行「供应商已删」 | covered |
| 路由命中与回退（V5 步骤 4-8，RL5 真机面） | 对话流选中虚拟模型发消息：命中成员响应、条件不命中回退下一成员、双不命中可行动错误（ROUTE_NO_ACTIVE_MEMBER）、凭据缺失不静默切换（ROUTE_MEMBER_UNAVAILABLE） | notProvable（发消息需真实可用端点，归 D3 真机；命中/回退/终结机制由 index.test.ts 假上游单测与 route-evaluate.test.ts 覆盖） |
| 对话流真实报错（V7 步骤 1-5） | 成员不可用的流式终结与物理模型对照 | notProvable（发消息需真实可用端点，归 D3 真机；终结机制由 index.test.ts 假上游单测覆盖） |
| 路由全删注册注销（V6 步骤 4，RL9） | 宿主 llm 注册表不再持有 taiji-route- 前缀条目 | notProvable（场景通道断 UI 悬挂标注与 Config whitelist/routes 落盘；注册表侧由 index.test.ts 空路由集断言覆盖，对话流虚拟模型消失承载可见面） |
| 清单视图「尚未接入供应商」空态（V9 步骤 1） | 三视图空态之清单视图变体 | notProvable（隔离实例供应商视图恒列 pi-ai 内置目录行，清单非空是宿主真实形态；供应商与路由视图空态已断言） |
| 清单跳转定位（V9 步骤 4） | 「在供应商中编辑」落在对应展开体并定位模型 | notProvable（跳转态为分区组件内状态，断言需跨视图状态巡检；跳转入口渲染已随清单行 covered） |
| 注册冲突状态条（V7 步骤 6，回溯 GL3/GL6） | ROUTE_REGISTRATION_FAILED 状态条 | notProvable（需宿主已注册同名 taiji-route-* 适配器，隔离实例不可自然构造；状态条渲染与探测判定由单测与 D3 复验） |
| 配色对比度采样（V8 采样部分） | ink on soft ≥ 4.5:1（四族 × 六色 × 双模 48 组合） | covered（不在 runner 通道：由 pnpm check 的 client/theme/tokens.spec.ts 机器验算承载；runner 只做 DOM/解析值断言，不做像素采样——真机整体观感与六色跟随归 D3 人眼验收） |

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
