---
name: verify-taiji-yang
description: "tai-ji-yang 根包 tai-ji-yang-shell 的真实 DSH 宿主验收：隔离 DSH_HOME 自启 dsh web（或连接已为测试启动的 URL）、doctor 体检、Playwright 驱动六场景（brand / head / theme / projects / model-service / lifecycle）、证据三件套（verdict.json / summary.jsonl / 截图+控制台）、按 PID 清理。验收范围仅根包 tai-ji-yang-shell；子包 opendesign-design-mode 的真实宿主验收走 pnpm test:e2e:design-mode（node 直跑，web 与桌面双版本宿主），两套入口独立、互不替代。触发词：真机验收、宿主验收、verify taiji-yang、验收插件、DSH 验收。不用于静态自检（pnpm check）与单测（pnpm test），也不用于 taiji 本体的 verify-taiji。"
---

# verify-taiji-yang：tai-ji-yang-shell 真机验收技能

本技能把根包 tai-ji-yang-shell 装进**隔离 DSH_HOME** 的 dsh web 实例，按用户可见路径驱动六类场景，落证据，收尾不留进程。写给冷启动的验收 agent 与 dev-flow D3 wrapper。

分工边界：

- **验收范围 = 根包 tai-ji-yang-shell**：runner 安装只 add 仓根（根包），六场景的 DOM 断言全部指向根包 `taiji-*` 目标。子包 `packages/opendesign-design-mode` 的真实宿主验收走它自己的 node 直跑 e2e（`pnpm test:e2e:design-mode`，场景在 `packages/opendesign-design-mode/tests/e2e/`，覆盖 web 与桌面 0.2.x 双版本宿主）——两套验收入口独立，互不替代。
- `pnpm check`（静态断言 + 构建 + 全仓单测）验「代码结构与构建产物」；本技能验「真实宿主里的行为」。两者互补，互不替代。
- 本技能不写 e2e spec、不进 CI；驱动只走用户路径（点击/重载），绝不向模型发送请求。

## 1. 两种执行形态

一律在仓根（AGENTS.md 所在目录）执行；runner = `scripts/verify/run.mjs`。

### 形态 ①：连接已为测试启动的 URL

```bash
node scripts/verify/run.mjs --url "http://127.0.0.1:3080/?token=<token>" --scenarios brand,head
```

适用：主会话已手工启动好测试实例（两道进门弹窗 runner 会自动点掉）。`--url` 模式下 runner **不安装、不卸载、不停止任何进程**；lifecycle 场景在该模式整场景降级（见 §4）。

### 形态 ②：自启隔离实例（lifecycle 唯一通道）

```bash
node scripts/verify/run.mjs \
  --dsh-bin "$(command -v dsh)" \
  --dsh-home "$(mktemp -d /tmp/verify-taiji-yang-home.XXXXXX)" \
  --scenarios all
```

runner 依次执行：在隔离 DSH_HOME 里 `dsh plugin --profile web add <本仓根>`（只装入根包 tai-ji-yang-shell，不装子包）→ `dsh --profile web --no-open` 启动 → 从 stdout 的 `dsh web: <url>` 行解析认证 URL（**不猜端口不猜 token**）→ HTTP 探活就绪 → 跑场景 → 按记录的 PID（进程组）收尾。

参数表：

| 参数 | 说明 |
|------|------|
| `--url <url>` | 形态 ①；必须是本机回环地址（token 只绑本机） |
| `--dsh-bin <path>` | 形态 ②；dsh 可执行文件，`.js/.mjs/.cjs` 形态用当前 node 执行 |
| `--dsh-home <dir>` | 形态 ② 必填；**显式隔离** DSH_HOME，指向 `~/.dsh` 会被拒绝（runner 永不碰用户真实 profile） |
| `--port <n>` | 形态 ② 透传 `--port`；缺省由宿主配置决定 |
| `--profile <name>` | 形态 ② 的目标 profile，缺省 `web` |
| `--scenarios <清单>` | 逗号分隔内置 id / 场景文件路径；`all`（缺省）= brand,head,theme,projects,model-service,lifecycle |
| `--artifacts-dir <dir>` | 证据根；缺省 `~/.agents/skill-data/verify-taiji-yang`（runId 只出现在其下一层，不拼进缺省根） |
| `--run-id <id>` | 默认 UTC 时间戳；只允许字母数字与 `. _ -`（防路径穿越） |
| `--strict` | degraded 也以退出码 2 结束（缺省 degraded = 0） |
| `--headed` | 有头浏览器（默认 headless；runner 用全新临时上下文，不读个人浏览器 profile） |
| `--timeout-ms <ms>` | 自启模式 URL 就绪预算（默认 120000） |
| `--keep` | 收尾不杀自启进程，输出 PID 交调用方处置 |
| `--json` | 日志走 stderr，stdout 输出最终 JSON verdict |

安全纪律（runner 强制）：不硬编码 token / 端口 / 本机绝对路径；`--run-id`、`--profile` 拒绝路径分隔符与 `..`；`--url` 拒绝非回环地址；清理只对自己拉起的进程按 PID 发信号，禁 `pkill`。

## 2. Doctor

驱动前与驱动中异常时先体检（run.mjs 自动执行 lib 新鲜度与 URL 活性两项硬门；装配与控制台在页面连上后检查）：

```bash
node scripts/verify/doctor.mjs --url "<测试URL>"            # 形态 ①
node scripts/verify/doctor.mjs --dsh-bin dsh --dsh-home <隔离目录>   # 形态 ②（临时拉起，检查后收掉）
node scripts/verify/doctor.mjs --url "<测试URL>" --json     # 机读
```

五项判定（全绿才驱动）：

| 项 | 判定 |
|----|------|
| params | `--dsh-home` 隔离（拒 `~/.dsh` / 家目录 / 根）、bin 存在、`--url` 回环 |
| lib-fresh | `lib/index.js` 与 `index.js` 逐字一致；`client/` 无晚于 `lib/client.js` 的源文件（初筛——落红先 `pnpm build`） |
| url-liveness | HTTP 200 且响应含 root 挂载点（进程活着 ≠ 就绪） |
| assembly | 品牌栈在场（浏览器半场物化）+ `__TAIJI_SHELL_INFO__` 在场且 version = 本包版本（Node 半场注入） |
| console-clean | 无 Slot 崩溃（错误级控制台 / pageerror，过滤资源加载噪音） |

## 3. 场景

每个场景 = `scripts/verify/scenarios/<id>.mjs`（`export const meta` + `export async function run(ctx)`）；断言期望值依据 `client/` 源码当前值，源码改了场景会红，红即同步信号。场景串行执行，顺序固定为 brand → head → theme → projects → model-service → lifecycle（model-service 写隔离 home 的设置文档与凭据文件，排在只读观测类之后；卸载类最后：跑完包已不在）。

| 场景 | 验什么 | 前置 |
|------|--------|------|
| brand | 侧栏品牌栈（产品名 太极/TaiJi）、版本行 `v{本包}[ · dsh v{宿主}]` 不裁切、壳信息 global、hero 首屏品牌区、无 Slot 崩溃 | 无 |
| head | 空态：header 单行 ≤45px、无横向溢出、右侧栏开关贴最右；会话态：按钮视觉序单调、目标子序（对话→轨迹→打开方式→chevron→右侧栏）、两两无重叠、打开方式在场、More actions 隐藏、分段控件（高 30px / 底色 = bg-layer-1 / 激活 600 / ::after 隐藏）、header 高 41±2 | 会话态段需要测试 profile 已有会话 |
| theme | composer 快速配色 chip（不可达时设置页外观行）切非默认色 → brand-primary 解析值变化 → reload 后持久（插件 Config 通道）→ 恢复默认玄 | chip 或外观行可达 |
| projects | 整槽替换占位（`.taiji-pb-list` 在场）、数据就绪、默认项目组头、当前会话行 current 标记、「当前」chip 文字居中 | current 标记与 chip 需要已有会话 |
| model-service | 设置导航「模型」与「模型服务」并存、点各自条目各渲染己页（无串页）；供应商接入全流程（零模型保存被拒给指引 → 手动加模型保存 → 设置文档 providers 条目 + 凭据文件 ref 落盘 → 宿主「模型」分区热可见且页面未重载）；并发冲突自动重读重试双方保留；密钥零泄漏（设置文档无 sk- 明文）；同名供应商预检拒绝且零写入；模型清单来源态标注、筛选空态、托管只读行；路由创建与同名派生 id、成员落盘、白名单勾选/取消/悬挂清理（插件 Config 落盘断言）；删除供应商后设置文档条目与凭据 ref 双清除（无孤儿） | **仅形态 ②**（要读隔离 DSH_HOME 的设置文档与凭据文件）；URL 模式显式降级 |
| lifecycle | `dsh plugin remove` → reload → 品牌栈消失、`taiji-` 前缀元素清零、页面不白屏、无 Slot 崩溃、`--dump-config` 不含本包层 | **仅形态 ②**；禁用（disable）无 CLI 通道，显式登记 notProvable |

前置缺失的处理（强制，不许假 pass）：场景显式降级（degraded）并在 verdict 的 blockers/degraded 里给恢复动作。例：head 在无会话 profile 上 = degraded，恢复动作「预置会话后重跑」。

会话驱动纪律：head / projects 的会话态只**点击侧栏已有会话行**（openSession），绝不向 composer 输入或发送——不产生任何模型请求。预置会话由调用方在测试 profile 手工完成一次（本 runner 不伪造会话数据）。

## 4. 证据与 D3 消费契约

证据目录：`<artifacts-dir>/<runId>/<scenarioId>/`（artifactsDir 缺省 = `~/.agents/skill-data/verify-taiji-yang`；runId 与 scenarioId 各占一层）：

- `verdict.json` —— 三态 `pass | fail | degraded`；顶层 = verdict / test_evidence / deviations / blockers / notProvable / meta；meta 必带 **headCommit / host / dshVersion / scenario / runId**。
- `summary.jsonl` —— 每步一行：`{ step, command, exitCode, stats?, channel?, at }`。
- `assertions.jsonl` —— 每断言一行（期望 vs 实际）。
- `report.md` + 截图 + `console.txt` + 子命令输出附件。

镜像（dev-flow D3 wrapper 消费契约）：`verdict.json` 与 `summary.jsonl` 同时落 **artifacts-dir 根**（引擎事实依据只读根）；多场景时根上 verdict 为聚合（任一 fail = fail；无 fail 有 degraded = degraded）。**notProvable 的影响（与 evidence.mjs judge 同规，不许假 pass）**：场景断言全绿但存在 notProvable 登记时，verdict 至多 degraded、不判 pass（缺省退出码 0，`--strict` 时 2）——model-service 等含 notProvable 登记的场景 verdict 恒为 degraded 属预期形态，不是失败。退出码：**fail=1、degraded=0（`--strict` 时 2）、pass=0**；参数错误 2。

dev-flow D3 wrapper 的调用形态（引擎与 runner 之间只有 script 路径一个通道，wrapper 由 D0 生成）：

```
spawnSync('node', [runner, '--url'|'--dsh-bin'..., '--scenarios', <nodeId 对应场景>, '--artifacts-dir', <节点 artifactsDir>, '--run-id', <按 nodeId 派生>])
```

wrapper 读 `<artifactsDir>/verdict.json` 的 verdict 与退出码判定节点结果；同一 runner 的多个 verify 节点由调用方串行成链（lifecycle 必须排在链最后）。

## 5. Cleanup

收尾顺序（runner 自动执行；手工收尾按同序核对）：

1. 浏览器上下文关闭（Playwright 全新临时上下文，无用户态）。
2. 自启进程按 PID 停止：SIGTERM 进程组 → 5s 宽限 → SIGKILL 兜底；`--keep` 时保留并输出 PID。**禁 `pkill dsh` 类宽泛匹配。**
3. 隔离 DSH_HOME 可整树删除（一次性目录）；用户 `~/.dsh` runner 从不触碰。
4. 证据幸存核对：`ls <artifacts-dir>/<runId>/` 各场景目录完整——证据绝不落隔离 home（删了就没了）。

## 6. 维护

- 断言期望值与 `client/` 源码同步：改 `session-header.css` / 槽位类名 / chip 结构时，同步改对应场景（期望值在场景文件头部注释里标了来源）。
- 新场景：`scenarios/<id>.mjs` 实现 meta + run(ctx)，在 `scripts/verify/lib/args.mjs` 的 `KNOWN_SCENARIO_IDS` 登记，并补 COVERAGE.md 矩阵行。
- 选择器纪律：只用本包类名（`taiji-` 前缀）与宿主结构属性（`[role="tablist"]` 等），禁构建期 hash 类名。
