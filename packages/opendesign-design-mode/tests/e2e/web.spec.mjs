/**
 * opendesign-design-mode 双版本 e2e —— web 版（0.1.7 隔离 DSH_HOME）。
 *
 * 场景编排（opendesign-assets-quality 设计 §4.1 V1-V10 的 L3 可脚本化子集 + V1 既有回归面；
 * 验收计划表 A8 的 web 宿主半场——A11/A12 的模型行为段归 L4，不在本套件）：
 *   S1 V1+V3+V4注入形态 —— preset 可见性（roster 卡片 + 选择器菜单 + deck 协议信号文案）+
 *      默认会话行为不变（standard 会话无设计内容）+ 设计会话注入断言（rich-assets fixture：
 *      形状包清单段含 dashboard 条目与 zh 触发词、craft 指路块根路径、manifest 感知设计系统
 *      清单行、panel 评审团协议段、ppt 条目 deck 协议指针）+ 材质化落盘恰 5 文件（4 复制件
 *      + .od-frames/deck-framework.md，内容与 lib/materialize/copy.js renderDeckFrameworkFile
 *      派生文本逐字一致，V1 设计包 D8 + opendesign-assets-quality D9）。
 *   S2 V5+V8缺省态 —— doctor 十一分节齐全（前八节 V1 零回归）；⑨ 资产丰富度非降级形态
 *      （craft 3 册 / 形状包 1 / manifest 命中 1）；⑩ 协议对账未登记态（无法比对 + 登记指引
 *      + 已知信息行）；⑪ 质量发现监听器运行形态（V2 场景前置核对）。
 *   S3 V2+V10 —— 质量环回注（真机写盘）：陌生既有文件触碰只记录不回注（V10/RL10）→
 *      快照外新写 P0 产物照常回注（V2/RL1 真机半场）→ 回注消息协议信号形态（user/message
 *      事件 data.source.kind=opendesign-design-mode/lint + 文本含检查项 id/修复指引/作用域句）→
 *      同内容重写指纹去重（回注消息计数不变 + duplicate 记录恰一行，SI2/RL3）。
 *   S4 V7 —— 非设计会话零侵入：standard 会话写 P0 HTML，零监听零回注（preset 过滤，
 *      .od-quality/ 不出现、事件流无 lint 消息）。
 *   S5 V6+V1·RL5 —— 无资产环境（资源根指向空目录）：roster broken + 默认 preset 不受影响；
 *      SI3 假阳性形态（清单损坏）：诊断文案区分「未检测到」与「检测失败请重启 DSH 重试」。
 *   S6 V1·V6 漂移 —— 资产漂移 fixture（清单在非默认相对位置）仍可定位 + 画像版本正确。
 *   S7 V9+V1·RL7 —— resume 代际重组 + resume 检查环不变量（RL10）：gen1 创建设计会话 →
 *      写 P0 产物回注（followup）→ 关实例换 gen2 资产 → resume → 新一轮 system 节点反映
 *      gen2、无 gen1 残留句 → doctor ⑪ 读出检查记录 → 同文件同内容重写触发第二代回注
 *      （指纹进程内重启即清的幂等代价，SC4）→ 再写同内容记 duplicate 不再回注。
 *   S8 V1·V11 写入形态 —— git fixture 项目目录连续三次设计会话（一次换资产）：.od-frames/
 *      恰 5 管理名（4 复制件 + deck-framework.md，gen2 无壳声明轮 deck-framework.md 无条件
 *      重铺）、幂等、git status 无 tracked 变更（反向断言）。
 *   S9 V1·A9/A10/A11 —— shell 包共存回归（V1 设计包 impl-plan 验收项：brand/projects/lifecycle 三回归）：verify runner 以 --url 连共存实例跑 brand+projects、
 *      以自启形态对共存 home 跑 lifecycle（卸载 shell）——「preset 注册与 UI 注入不干扰
 *      shell 包」只在 opendesign 在场（两包共存 profile）时才可证明，单装态结果不作数。
 *
 * 评论回路场景（opendesign-comment-loop 设计 §4.1；编号带 comment-loop· 域前缀，与本文件
 * 既有 opendesign-assets-quality 域 V 编号区分）：
 *   S10 comment-loop·V1 + comment-anchor·V1 —— 拾取桥全路径首评：设计面板进评论模式 →
 *      frameLocator 悬停高亮/点击选中（锚点行 id 级）→ 输入发送 → 线程落盘带 anchor
 *      （D1 三级降级的 id 级）→ 聊天流回注消息 kind 可辨 + 围栏 JSON 含同一 anchor
 *      （D7）→ 产物内编号徽章在位 → doctor 第⑫节评论环缺席/在场两形态 → 回合结束后
 *      回注消息仍在事件流（通用在轨断言）。
 *   S11 comment-loop·V3 —— 无活 Agent 边界（D3 实测形态）：重启未重开会话 → 写通道
 *      404 session-unknown fail-closed 且零落盘；重开会话 → 200 + 投递态如实 + 不重复线程。
 *      no-agent 徽标/重试通道在本宿主实现不可经 e2e 造出，由 L1（U2/U3/U4）覆盖。
 *   S12 comment-loop·V5 —— 普通（非 OpenDesign）会话：列表/iframe 两形态评论元素零出现，
 *      路由层不判型（写通道往返照常）；地址模式弹回由 L1 present-card-link 断言覆盖。
 *      评论侧栏折叠条/展开面板全页零出现；路由层不判型——普通会话写通道往返照常（仅受
 *      鉴权与落点约束）。preset 清单零变化归根包 check-manifest 既有断言，不在本套件。
 *   S13 comment-loop·V6 —— resolve → reply 重开循环（首评经拾取入口置态）：标记已解决
 *      （delivery 保留）→ 追加评论自动回 open 且新投递周期 delivered（围栏载荷 text = 末条
 *      追加且带线程首评 anchor——D7 追加评论回注载荷带首评锚点）→ 产物同路径重写旧评论
 *      不消失不错挂（D8 关联）→ 产物删除边界：线程保留列出、伺服路由 404。
 *   S14 comment-loop·V10 —— steer 前置评论投递（AS9 探针载体；首评经拾取入口）：长任务
 *      消息先置运行态 → 运行中拾取发评论 → delivery=delivered + 消息 kind/载荷断言。通道
 *      判据 = 评论投递是否开启新轮 system 节点（followup 开新轮 / steer 不开）：steer 形态
 *      全量断言（无新轮 + 回合结束后消息仍在事件流）；followup 形态按设计 §4.1 V10 协议
 *      登记探针不适用（防弱化为对 followup 恒真的永绿断言），凭据环境长任务重造后补跑。
 *   S15 comment-loop·V4 —— 写通道安全（原始 HTTP 形态，不经面板）：无凭据 POST 401 /
 *      不可信 Host/Origin/cross-site 403（宿主 Host/Origin 围栏）/ 越界载荷 404·403·400
 *      且零落盘；anchor 载荷负路径（level 词表外 / sel 超限 / 显式 null 400——D1 写入侧
 *      校验的 HTTP 半场）；正向对照 = 带凭据 GET 基路径 200。
 *
 * 元素锚点场景（opendesign-comment-anchor 设计 §4.1；编号带 comment-anchor 域标注的 P 组，
 * 判据 id 为该设计包 V/RL 编号）：
 *   P2 V2 —— 三级降级：同一产物上对带 id 元素 / 带锚属性祖先 section 内部元素 / 无 id
 *      无锚属性裸链接各拾取一评——落盘 anchor 逐级锁定（id / data-od-id / path 链逐字）
 *      + 徽章三枚按 anchors 下发集重建。deck 形态（data-screen-label）降级不设独立场景：
 *      U3 单测锁值（设计 §4.1 V2 判据登记）。
 *   P3 V3 —— 联动定位与失效：侧栏定位钮 → 产物内滚动定位 + 高亮闪框（D8(b)）→ 重写
 *      产物删除目标 id → ETag 变化重挂 → anchors-status 回报 → 侧栏条目「锚点失效」态
 *      （定位钮禁用不发起 locate），其余条目不受影响。
 *   P4 V3③+V8①③+RL7 —— 改稿可见性：模拟改稿（改目标元素内容、保留锚属性、插入同型
 *      兄弟使 path 级序数漂移）→ ETag 变化 → ≤6 秒内 iframe 重挂 ready 二次握手 → 徽章
 *      重建且 id/data 级命中；path 级失效如实标注不判失败（D1 已接受代价口径）。
 *   P5 V4+V5+V11 —— 布局联动：打开预览自动收起左侧边栏、关闭还原恰一次（RL6）；V5 硬
 *      边界矩阵行（手动收过侧栏再打开预览被误展开——面板按钮一键再收，手动接管后关闭
 *      面板不再触碰侧栏）；V11②③ 列表↔iframe 往返与切走切回（keepMounted 保活）不重放
 *      布局动作；V11④ 多实例分屏（宿主 Split 动作——u-probe 探针已定 e2e 承载）各实例
 *      独立记账全程无报错。侧栏开合机器判据 = 宿主「Collapse sidebar」按钮在场 ⇔ 展开
 *      （隔离实例实测：收起态该按钮缺席，无 Expand 词形）。
 *   P6 V7+RL2/RL3 —— 注入完整性：sandbox 属性逐字 allow-scripts 不含 allow-same-origin；
 *      GET 响应 = 磁盘字节 + 注入标签（与 injectPickScript 生产构造逐字对账）；HEAD 无
 *      body 且 HTML 附 ETag；非 HTML 资源与设备壳（.od-frames/）响应无注入；顶层直开
 *      （无面板父窗口）零拾取 UI 零改动。
 *   P7 RL5 —— 桥契约负路径：v ≠ 1 与前缀不符两类可构造形态双向静默（脚本→面板 picked
 *      零落盘；面板→脚本 pick-mode 不渲染 overlay）+ 合法报文对照通道连通；来源伪造不可
 *      构造由单测 mock 承载（RL5 分工登记）。
 *   P8 V6+D3 —— 入口唯一化：面板无首评直发输入组件；追加/resolve 可用；拾取提交失败
 *      回执可见（submit-result ok:false → 输入框保留文本 + 行内提示 + 发送钮恢复，恢复
 *      通道后可重发）；产物不可拾取（列表渲染后删产物 → 点击行 → 伺服 404 失败行 +
 *      评论模式开关禁用 + 既有线程追加照常）→ 恢复产物 Reload 后拾取可用可发首评。
 *
 * 真实模型自纠行为（V2 的模型修复段）不在本套件（验收计划 A11：L4 归交付后行为观察）；
 * comment-loop·V1 的「agent 实际读产物改稿写盘（文件工具触达路径）」段同口径归 D3 真机
 * 验收（comment-loop U6 待验证检查点：A11 模式成本已知，交付后补验）；comment-anchor·V8④
 * 「真模型按回注消息改稿保留锚属性」同口径归 L4（设计 §4.1 V8 ④ degraded 后补登记）。
 * 无 API key 的隔离实例上发消息：system 提示词在 provider 调用前已提交会话日志
 * （dsh-agent-loop step() 先 commit 后 request，亲读核实）——注入断言走该通道；质量环
 * 回注经宿主 agents 服务的 followup 开新轮，UserMessage 同样在 provider 调用前 commit
 * （agent-loop agent.ts:471 session.append('user/message', message)，data = 消息本体）。
 *
 * 真机驱动纪律：进程生命周期（安装/启动/URL 解析/探活/按 PID 清理）复用项目 verification
 * skill 的 runner 库（scripts/verify/lib/*——只 import 不改写）；会话日志断言通道 =
 * `--patch` overlay 把 dsh-session-persistence-jsonl 切到 compression:none（宿主公开配置
 * 机制，非宿主源码改动）。收尾按记录的 PID 杀进程组，禁 pkill。
 *
 * 页面语言约定：本套件断言基线 = 宿主 chrome 与面板 en 字典文案（'Sent'/'Mark resolved'
 * 等既有断言口径）。runner 库 openVerifyPage 固定 locale zh-CN（shell 包验收所用），该
 * 形态下宿主 UI 与面板字典全中文、与本套件既有选择器/文案断言冲突——页面打开由本文件
 * 自管（en-US context），runner 库只复用进程与 boot 工具。宿主 0.1.7 中文 boot 形态
 * （zh-CN 下 aria=选择工作区 等）由探针段 runlog 登记，不再作为本套件驱动形态。
 *
 * 运行：node packages/opendesign-design-mode/tests/e2e/web.spec.mjs（仓根执行；退出码 0 = 全绿）。
 * 环境变量：DSH_BIN（缺省 PATH 上的 dsh，须为 0.1.7-rc.2）、KEEP_E2E_STATE=1（保留隔离 home 供排障）、
 * E2E_ONLY=S10,P4,u-probe（只跑标题首段 id 命中的场景，排障用；缺省全跑）。
 *
 * 探针段（opendesign-comment-anchor 设计包 wave 0；编号裸用该包 AS/V 编号）：
 *   u-probe —— AS7(b) frameLocator 驱动伺服产物 iframe + V11 步④ dockkit tab 动作驱动性。
 *   结论已由 u-probe 单元落盘 .tmp/dev-flow/opendesign-comment-anchor/probe/（AS7 成立、
 *   分屏可驱动）；场景随套件全量运行、承担驱动形态回归断言（boot 链已并入本套件共享 en
 *   驱动）：11 步中 8 步带硬断言（boot 链两步、步①进 iframe、AS7(b)②③④、V11④⑤ tab/pane
 *   基准、V11④⑦ Meta+\ 分屏——失败即场景红、套件非零退出），仅 3 个探测输出步骤（tab 右键
 *   菜单清单 / 分栏按钮路径 / 全局句柄清单）维持登记性质（无条件 ok，结论看运行日志）。
 */
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const PKG_ROOT = path.join(REPO_ROOT, 'packages', 'opendesign-design-mode')
const E2E_FIXTURES = path.join(PKG_ROOT, 'tests', 'e2e', 'fixtures')
const FIXTURES = path.join(PKG_ROOT, 'tests', 'fixtures')
const require = createRequire(path.join(REPO_ROOT, 'package.json'))

const playwright = require('playwright')
const { probeUrl, killProcessTree, installPlugin } = await import(
  path.join(REPO_ROOT, 'scripts', 'verify', 'lib', 'dsh-process.mjs')
)
const { dshSpawnCommand, parseDshUrlLine } = await import(
  path.join(REPO_ROOT, 'scripts', 'verify', 'lib', 'args.mjs')
)
const { bootInto } = await import(
  path.join(REPO_ROOT, 'scripts', 'verify', 'lib', 'browser.mjs')
)

const DSH_BIN = process.env.DSH_BIN ?? 'dsh'
const KEEP_STATE = process.env.KEEP_E2E_STATE === '1'

/** 本轮全部隔离状态与证据的根（os.tmpdir 下，OS 生命周期回收；KEEP_STATE 时保留供排障）。 */
const RUN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-e2e-'))
const TEMPLATE_HOME = path.join(RUN_ROOT, 'template-home')
const WORKSPACE_ROOT = path.join(RUN_ROOT, 'workspaces')
fs.mkdirSync(WORKSPACE_ROOT, { recursive: true })
/** 全部自启进程的 PID（收尾按 PID 杀进程组；禁 pkill）。 */
const livePids = []

/**
 * 打开验证页面（本套件自管形态）：全新 chromium 上下文 + **locale 'en-US'**——宿主
 * dsh-client-locale 按 navigator 语言匹配已注册语言包，en-US 使宿主 chrome 与面板 en
 * 字典生效，与本套件既有英文选择器/文案断言基线一致（runner 库 openVerifyPage 固定
 * zh-CN，为 shell 包中文文案验收所用，两套断言基线不同源——见文件头「页面语言约定」）。
 */
async function openVerifyPageEn(playwrightModule, { url, viewport = { width: 1440, height: 900 } }) {
  const browser = await playwrightModule.chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport, locale: 'en-US' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
  return {
    url,
    page,
    async close() {
      await context.close().catch(() => {})
      await browser.close().catch(() => {})
    },
  }
}

// ── 断言 harness ─────────────────────────────────────────────────────────────

/** 单条断言失败（携带场景与步骤定位）。 */
class AssertionError extends Error {}

/**
 * 步骤内断言。失败抛 {@link AssertionError}，由场景 runner 捕获归因到步骤。
 * @param {boolean} cond
 * @param {string} message - 期望 vs 实际的可定位描述。
 */
function assert(cond, message) {
  if (!cond) throw new AssertionError(message)
}

/** 场景步骤：逐条记录，全部通过 = 场景绿；任一失败归因到步骤名。 */
function step(results, name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
    console.log(`    ✓ ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error })
    console.log(`    ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`)
  }
}
/** 异步步骤（同 step，Promise 语义）。 */
async function stepAsync(results, name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`    ✓ ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error })
    console.log(`    ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`)
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ── fixture 特征串（运行时从 fixture 文件提取，fixture 改动不致断言漂移）──────────

/** mini-od 场景包目录（manifest 所在；路由段任务档绝对路径的锚）。 */
const MINI_OD_SCENARIO = path.join(
  FIXTURES, 'mini-od', 'plugins', '_official', 'scenarios', 'od-next-strategy',
)
/** rich-assets 场景包目录（三目录齐备 fixture；V1 清单段/指路块断言的资产根）。 */
const RICH_ROOT = path.join(E2E_FIXTURES, 'rich-assets')
const RICH_SCENARIO = path.join(RICH_ROOT, 'plugins', '_official', 'scenarios', 'od-next-strategy')
/** 设计会话注入文本的稳定特征：U3 路由段标题（自产内容，各代 fixture 同形）。 */
const DESIGN_INJECTION_MARK = '## Task routing (design mode)'
/** mini-od 注入文本的资产特征：路由段里的 prototype 任务档绝对路径。 */
const MINI_OD_PROFILE_PATH = path.join(MINI_OD_SCENARIO, 'assets', 'task-profiles', 'prototype.md')
/** rich-assets 注入文本的资产特征：路由段里的 prototype 任务档绝对路径。 */
const RICH_PROFILE_PATH = path.join(RICH_SCENARIO, 'assets', 'task-profiles', 'prototype.md')
/** resume gen1 特征句 A（fixture 文件内含；断言「不含」用）。 */
const GEN1_SENTENCE = 'deliver the actual image file'
/** resume gen2 特征句 B（升级模拟句；断言「含」用）。 */
const GEN2_SENTENCE = 'report the media capability gap'
/** 质量环回注消息的 source.kind（lib/quality/feedback.js LINT_SOURCE_KIND 同值；AX7 协议信号形态）。 */
const LINT_SOURCE_KIND = 'opendesign-design-mode/lint'
/** P0 命中特征（purple-gradient：线性渐变含紫 hex，lint.ts PURPLE_HEXES 命中形态）。 */
const DIRTY_GRADIENT = 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'

for (const [file, mark] of [
  [path.join(E2E_FIXTURES, 'resume-gen1', 'assets', 'core-system-prompt.md'), GEN1_SENTENCE],
  [path.join(E2E_FIXTURES, 'resume-gen2', 'assets', 'core-system-prompt.md'), GEN2_SENTENCE],
]) {
  assert(fs.readFileSync(file, 'utf8').includes(mark), `fixture 特征句缺席：${file} 应含 ${JSON.stringify(mark)}`)
}
/** rich-assets 三目录在場自检（fixture 自身损坏早失败，不落到场景里报含糊错）。 */
for (const required of [
  path.join(RICH_ROOT, 'design-templates', 'dashboard', 'SKILL.md'),
  path.join(RICH_ROOT, 'craft', 'state-coverage.md'),
  path.join(RICH_ROOT, 'design-systems', 'sample-brand', 'manifest.json'),
]) {
  assert(fs.existsSync(required), `rich-assets fixture 缺文件：${required}`)
}

// 材质化写清单与 deck 协议派生文本直接对账生产实现（同仓构建产物；清单/文本漂移即红）。
const { MATERIALIZED_WRITE_LIST, DECK_FRAMEWORK_FILE_NAME } = await import(
  path.join(PKG_ROOT, 'lib', 'materialize', 'copy.js')
)
const { renderDeckFrameworkFile } = await import(path.join(PKG_ROOT, 'lib', 'protocols', 'deck.js'))
assert(
  JSON.stringify([...MATERIALIZED_WRITE_LIST].sort()) ===
  JSON.stringify(['android.html', DECK_FRAMEWORK_FILE_NAME, 'iphone.html', 'layout.css', 'neutral.html'].sort()),
  `材质化写清单形态不对：${JSON.stringify(MATERIALIZED_WRITE_LIST)}`,
)
const DECK_FILE_EXPECTED = renderDeckFrameworkFile()
assert(
  DECK_FILE_EXPECTED.includes('# HTML deck host protocol')
    && DECK_FILE_EXPECTED.includes('## Existing deck or selected template')
    && DECK_FILE_EXPECTED.includes('## New deck only'),
  'deck 协议铺盘文本应含三段结构（适用限定句 + Existing deck 兼容段 + New deck 规范段）',
)

// 评论环（comment-loop）契约词表与消息构造直接对账生产实现（同仓构建产物；词表/消息漂移即红）。
const {
  COMMENT_SOURCE_KIND,
  COMMENTS_API_BASE_PATH,
  COMMENTS_API_PATHS,
  COMMENTS_DIR_NAME,
  COMMENTS_FILE_NAME,
  COMMENT_DELIVERY_STATES,
  COMMENT_TEXT_MAX_LENGTH,
  COMMENT_THREAD_ID_PREFIX,
} = await import(path.join(PKG_ROOT, 'lib', 'comments', 'contract.js'))
const { buildCommentMessage } = await import(path.join(PKG_ROOT, 'lib', 'comments', 'feedback.js'))
const { DOCTOR_SECTIONS, DOCTOR_SECTION_COUNT } = await import(path.join(PKG_ROOT, 'lib', 'commands', 'doctor.js'))
const { injectPickScript, OPENDESIGN_ARTIFACTS_PREFIX_PATH, shouldInjectPickScript } = await import(
  path.join(PKG_ROOT, 'lib', 'serve', 'artifacts-route.js')
)
assert(
  COMMENT_SOURCE_KIND !== LINT_SOURCE_KIND,
  `评论回注 kind 应与质量环 lint kind 并列不同值（comment-loop contract.ts）：${COMMENT_SOURCE_KIND}`,
)

// ── 隔离实例生命周期 ─────────────────────────────────────────────────────────

/**
 * 模板 home：一次性把两包装进 web profile（pnpm 安装最贵，只做一次；其余场景克隆它）。
 * 克隆保留 node_modules 里的仓内符号链接（指向本仓 lib/，改动即生效）。
 */
async function ensureTemplateHome() {
  fs.mkdirSync(TEMPLATE_HOME, { recursive: true })
  for (const repo of [REPO_ROOT, PKG_ROOT]) {
    const outcome = installPlugin({ dshBin: DSH_BIN, dshHome: TEMPLATE_HOME, profile: 'web', repo })
    if (!outcome.ok) {
      throw new Error(`模板 home 插件安装失败（${repo}）：${outcome.reason}\n${outcome.hint}\n${outcome.output.slice(-800)}`)
    }
  }
}

/**
 * 场景实例：克隆模板 home → seed 默认工作区（指向场景工作目录）→ 自启隔离 dsh web
 * （compression:none patch + OD_RESOURCE_ROOT fixture 覆盖）→ 探活就绪。
 * @param {object} input
 * @param {string} input.label - 场景名（home 目录名成分）。
 * @param {string} input.fixtureRoot - OD_RESOURCE_ROOT 覆盖值（fixture 资产根）。
 * @param {string} input.workspaceDir - 会话工作目录（seed 进默认工作区；须已存在）。
 * @returns {Promise<{ url: string, home: string, page: import('playwright').Page, close(): Promise<void> }>}
 */
async function withInstance({ label, fixtureRoot, workspaceDir }) {
  const home = path.join(RUN_ROOT, `home-${label}`)
  fs.cpSync(TEMPLATE_HOME, home, { recursive: true })
  fs.rmSync(path.join(home, 'sessions'), { recursive: true, force: true })
  fs.rmSync(path.join(home, 'storages'), { recursive: true, force: true })

  // 默认工作区 seed：路径必须是 realpath（宿主 attachSession 按 realpath 对账，/tmp 符号链接
  // 环境实测：非 realpath 形态 seed 会让会话 attach 失败）。
  fs.mkdirSync(path.join(home, 'storages'), { recursive: true })
  const workspaceId = crypto.randomUUID()
  const workspaceReal = fs.realpathSync(workspaceDir)
  fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: {
      initialized: true,
      workspaceIds: [workspaceId],
      archivedSessionIds: [],
      pinnedSessionIds: [],
      defaultWorkspaceId: workspaceId,
    },
    tables: {
      workspaces: {
        [workspaceId]: {
          path: workspaceReal,
          title: path.basename(workspaceDir),
          sessionIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  }, null, 2))

  // 会话日志切未压缩 JSONL（断言通道）：patch 只覆盖 compression，root 沿用宿主基线表达式。
  const patchFile = writeSessionLogPatch(home)
  return startInstance({ label, home, fixtureRoot, patchFile, cwd: workspaceDir })
}

/** 写会话日志 patch（compression:none 断言通道；root 沿用宿主基线表达式）。 */
function writeSessionLogPatch(home) {
  const patchFile = path.join(home, 'e2e-patch.yml')
  fs.writeFileSync(patchFile, [
    '# e2e 观察用 overlay（V1·U8）：会话日志落盘为未压缩 JSONL，供 system 节点断言',
    '- id: session-persistence-jsonl',
    '  config:',
    "    root: !!js dshHomePath('sessions')",
    '    compression: none',
    '',
  ].join('\n'))
  return patchFile
}

/**
 * 自启隔离 dsh web（--patch + OD_RESOURCE_ROOT 覆盖）→ stdout 解析认证 URL → 探活 → 开页面。
 * 失败即按 PID 收场（不留孤儿）；stopInstance 按 PID 杀进程组。
 *
 * cwd = 场景工作目录：伺服根按会话解析（lib/serve/artifacts-route.ts 按 URL session 段经
 * resolveSessionCwdById 取会话 cwd，与材质化同一通道）——把 dsh 进程落在工作目录，会话
 * cwd（header.cwd / workingDirectory）即 seed 工作区，伺服根、材质化落点与探针产物随之
 * 对齐。这正是用户「cd 项目目录 && dsh web」的启动形态；进程 cwd 不再是伺服根的直接来源。
 */
async function startInstance({ label, home, fixtureRoot, patchFile, cwd }) {
  // --patch 是 launcher 旗标，必须位于 --profile 之前（dsh CLI 实测：放在 profile 之后报 unknown option）；
  // dsh bin 可能是 .js 形态（dshSpawnCommand 返回 [node, bin]），展开后再拼 launcher 参数。
  const [dshFile, ...dshPrefix] = dshSpawnCommand(DSH_BIN)
  const child = spawn(dshFile, [
    ...dshPrefix, '--patch', patchFile, '--profile', 'web', '--no-open', '--port', '0',
  ], {
    env: { ...process.env, DSH_HOME: home, OD_RESOURCE_ROOT: fixtureRoot },
    cwd: cwd !== undefined ? fs.realpathSync(cwd) : undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // 进程组长：stop 按组终止（runner 库同纪律）
  })
  livePids.push(child.pid)

  // 从 stdout 解析认证 URL（不猜端口不猜 token；token 含 - 与 _，正则 [A-Za-z0-9_-]+ 同款纪律）。
  let output = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { output += `[stderr] ${String(chunk)}` })
  const deadline = Date.now() + 60000
  let url = null
  while (url === null && Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`dsh web 提前退出（label=${label}）：\n${output.slice(-2000)}`)
    }
    for (const line of output.split('\n')) {
      const parsed = parseDshUrlLine(line)
      if (parsed !== null) { url = parsed.url; break }
    }
    if (url !== null) break
    await sleep(200)
  }
  if (url === null) {
    await stopInstance(child.pid)
    throw new Error(`等待 dsh web URL 行超时（label=${label}）。输出尾部：\n${output.slice(-2000)}`)
  }

  // HTTP 探活（进程活着 ≠ 就绪；runner 库同语义）。
  let probe = { ok: false, reason: 'not probed' }
  const probeDeadline = Date.now() + 30000
  while (Date.now() < probeDeadline) {
    probe = await probeUrl(url)
    if (probe.ok) break
    await sleep(300)
  }
  if (!probe.ok) {
    await stopInstance(child.pid)
    throw new Error(`dsh web 探活失败（label=${label}）：${probe.reason}`)
  }

  const session = await openVerifyPageEn(playwright, { url })
  await bootInto(session.page)
  await clearModalGates(session.page)

  return {
    url,
    home,
    page: session.page,
    async close() {
      await session.close()
      await stopInstance(child.pid)
    },
  }
}

/**
 * 清掉残留引导弹窗（bootInto 的门类循环有时早于第二个弹窗渲染完成就退出，
 * 留下带遮罩的 API key 引导框——0.1.7 实测其「Save and continue」在无 key 时禁用，
 * Escape 不一定可关）。策略：可见门类按钮优先点，其次 Escape，直到遮罩消失（预算 10s）。
 */
async function clearModalGates(page) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      masked: Array.from(document.querySelectorAll('[class*="_mask_"]')).some((el) => el.offsetWidth > 0),
      dialog: Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => el.offsetWidth > 0),
    }))
    if (!state.masked && !state.dialog) return
    const gate = page.locator('button:visible', { hasText: /Configure later|Skip|Not now|稍后|跳过|继续|Continue/i }).first()
    if (await gate.isVisible().catch(() => false)) {
      await gate.click().catch(() => {})
    } else {
      await page.keyboard.press('Escape').catch(() => {})
    }
    await page.waitForTimeout(500)
  }
}

/** 按记录 PID 杀进程组（SIGTERM → 兜底 SIGKILL；runner 库实现）。 */
async function stopInstance(pid) {
  const index = livePids.indexOf(pid)
  if (index !== -1) livePids.splice(index, 1)
  await killProcessTree(pid)
}

// ── UI 驱动助手（选择器全部为宿主结构属性 / 本包 odp- 类名，无构建期 hash）──────

/**
 * 在 hero 选择默认工作区（seed 的场景工作目录）。芯片 aria-label 恒为 'Choose workspace'，
 * 选中后可见文案变为工作区标题（0.1.7 实测）。
 */
async function pickWorkspace(page, workspaceDir) {
  const title = path.basename(workspaceDir)
  await page.getByRole('button', { name: 'Choose workspace' }).click()
  await page.locator('[role="menuitem"]', { hasText: title }).first().click()
  await page.waitForTimeout(800)
  const chipText = await page.getByRole('button', { name: 'Choose workspace' }).textContent()
  if (chipText === null || !chipText.includes(title)) {
    throw new AssertionError(`工作区选择未生效：芯片文案 ${JSON.stringify(chipText?.trim())} 不含 ${JSON.stringify(title)}`)
  }
}

/**
 * 打开 preset 芯片菜单并返回菜单项文本清单（新会话选择器 roster 的 healthy 子集）。
 * 结束时按 Escape 收起菜单。
 * @returns {Promise<string[]>}
 */
async function readPickerItems(page) {
  const chip = page.locator('button[aria-haspopup="menu"][title*="agent preset"]').first()
  await chip.click()
  await page.waitForTimeout(500)
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('[role="menuitem"]'))
    .map((el) => (el.textContent ?? '').trim()))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  return items
}

/** 在 hero 把 preset 选为设计模式（芯片 staged pick；对 blank 会话立即生效）。 */
async function pickDesignPreset(page) {
  const chip = page.locator('button[aria-haspopup="menu"][title*="agent preset"]').first()
  await chip.click()
  await page.waitForTimeout(400)
  await page.locator('[role="menuitem"]', { hasText: 'OpenDesign 设计模式' }).first().click()
  await page.waitForTimeout(1200)
  const chipText = await chip.textContent()
  if (chipText === null || !chipText.includes('OpenDesign 设计模式')) {
    throw new AssertionError(`设计 preset 选择未生效：芯片文案 ${JSON.stringify(chipText?.trim())}`)
  }
}

/**
 * 发送一条用户消息并等到回合跑完（无 API key 的隔离实例上，回合以 MISSING_CREDENTIAL
 * 失败收场——system 提示词在 provider 调用前已提交会话日志，该失败文案即「回合已跑」信号）。
 */
async function sendUserMessage(page, text) {
  const composer = page.locator('[contenteditable="true"]').first()
  await composer.click()
  await page.keyboard.type(text)
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Send message' }).click()
  await page.waitForFunction(
    () => document.body.innerText.includes('MISSING_CREDENTIAL') || document.body.innerText.includes('This turn failed'),
    undefined,
    { timeout: 45000 },
  )
  await page.waitForTimeout(1500) // 落盘 batch flush 余量
}

/**
 * 在会话内执行 /opendesign-doctor 并返回页面全文（命令输出直接渲染在会话流）。
 * 前置：当前会话已存在（至少发过一条消息）。
 */
async function runDoctor(page) {
  const composer = page.locator('[contenteditable="true"]').first()
  await composer.click()
  await page.keyboard.type('/opendesign-doctor')
  await page.waitForTimeout(1500)
  const option = page.getByRole('option', { name: /opendesign-doctor/ }).first()
  const optionCount = await option.count()
  if (optionCount === 0) throw new AssertionError('/opendesign-doctor 未出现在 slash 命令菜单')
  await option.click()
  await page.waitForTimeout(3500) // 十一节报告（含 ⑩⑪ 的探测与记录读取）渲染余量
  return page.evaluate(() => document.body.innerText)
}

/**
 * 读取设置页 Agent presets 分区的 roster 形态（卡片 id / 分组标题 / broken 徽标 / 诊断文案）。
 * 打开设置 → Agent presets → 抓 DOM → Escape 收起。
 */
async function readSettingsRoster(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.waitForTimeout(900)
  await page.getByText('Agent presets', { exact: true }).first().click()
  await page.waitForTimeout(1500)
  const roster = await page.evaluate(() => ({
    groups: Array.from(document.querySelectorAll('h3')).map((h) => (h.textContent ?? '').trim()),
    cards: Array.from(document.querySelectorAll('[data-agent-preset-id]')).map((el) => ({
      id: el.getAttribute('data-agent-preset-id'),
      text: (el.textContent ?? '').trim(),
      alert: el.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      broken: el.textContent?.includes('Failed to load') ?? false,
    })),
  }))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  return roster
}

/** 打开右侧栏设计面板（guide 入口，无地址形态 → 产物列表兜底）。 */
async function openDesignPanel(page) {
  await page.getByRole('button', { name: 'Open right sidebar' }).click()
  await page.waitForTimeout(900)
  await page.getByText('Design preview').first().click()
  await page.waitForTimeout(1500)
  const body = await page.locator('.odp-body').count()
  if (body === 0) throw new AssertionError('设计面板未打开（.odp-body 缺席）')
}

// ── 会话日志断言通道（compression:none 的 JSONL）────────────────────────────

/** 收集隔离 home 下全部会话日志（按 mtime 升序）。 */
function collectSessionFiles(home) {
  const root = path.join(home, 'sessions')
  if (!fs.existsSync(root)) return []
  const files = []
  for (const dir of fs.readdirSync(root)) {
    const dirPath = path.join(root, dir)
    if (!fs.statSync(dirPath).isDirectory()) continue
    for (const sessionId of fs.readdirSync(dirPath)) {
      const file = path.join(dirPath, sessionId, 'session.v4.jsonl')
      if (fs.existsSync(file)) files.push({ file, sessionId, mtime: fs.statSync(file).mtimeMs })
    }
  }
  files.sort((a, b) => a.mtime - b.mtime)
  return files
}

/** 读取一份会话日志的 system/message 文本清单、user/message 消息、preset 选定记录与 turn/start 轮次号。 */
function readSessionLog(file) {
  const systemMessages = []
  const userMessages = []
  const presetSelections = []
  const turnStarts = []
  for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    if (line === '') continue
    const event = JSON.parse(line)
    if (event.type === 'system/message') {
      systemMessages.push(event.data?.message?.content?.[0]?.text ?? '')
    }
    if (event.type === 'user/message') {
      // user/message 的 data = 消息本体（dsh-agent-loop agent.ts:471 append 载荷）；
      // 回注消息（AX7）以 data.source.kind 自报身份，不冒充用户发言；source 全量提取
      // （D3 五字段随消息持久化——assertCommentMessageText 对账用）。
      userMessages.push({
        kind: event.data?.source?.kind ?? null,
        text: event.data?.content?.[0]?.text ?? '',
        source: event.data?.source ?? null,
      })
    }
    if (event.type === 'agent-preset/selected') {
      presetSelections.push(event.data?.agentPreset ?? '')
    }
    if (event.type === 'turn/start') {
      // 宿主 turnBoundary 投影事件（dsh-agent-loop lib/index.js turnBoundaryProjectionDefinition，
      // 亲读核实）；followup = next-turn 开新轮、steer = next-step 注入当前轮——轮次计数是
      // 评论环投递通道判据（comment-loop·V10）。
      turnStarts.push(event.data?.turn ?? null)
    }
  }
  return { systemMessages, userMessages, presetSelections, turnStarts }
}

/**
 * 轮询会话日志直到谓词满足（落盘有 batch 窗口，轮询而非盲等）。
 * @returns {Promise<{ file: string, log: ReturnType<readSessionLog> }>}
 */
async function waitForSessionLog(home, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let lastSeen = 'no session files yet'
  while (Date.now() < deadline) {
    for (const entry of collectSessionFiles(home).reverse()) {
      const log = readSessionLog(entry.file)
      if (predicate(entry, log)) return { file: entry.file, log }
      lastSeen = `${entry.sessionId} sys=${log.systemMessages.length}`
    }
    await sleep(500)
  }
  throw new AssertionError(`等待会话日志超时（${timeoutMs}ms；最后见到：${lastSeen}）`)
}

// ── 质量环记录读侧（.od-quality/report.jsonl，SC5 行格式 = lib/quality/feedback.js）──

/** 读取会话工作目录的 report.jsonl（缺席返回空清单；损坏行跳过——读侧容忍半行写入）。 */
function readQualityReport(workspace) {
  const file = path.join(workspace, '.od-quality', 'report.jsonl')
  if (!fs.existsSync(file)) return []
  const lines = []
  for (const lineText of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = lineText.trim()
    if (trimmed === '') continue
    try { lines.push(JSON.parse(trimmed)) } catch { /* 半行写入容忍 */ }
  }
  return lines
}

/** 轮询直到 report.jsonl 满足谓词（写侧 appendFile 即时落盘，轮询只为时序余量）。 */
async function waitForReportLine(workspace, predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let lastSeen = 'no report yet'
  while (Date.now() < deadline) {
    const lines = readQualityReport(workspace)
    if (lines.some(predicate)) return lines
    lastSeen = `${lines.length} lines`
    await sleep(400)
  }
  throw new AssertionError(`等待 .od-quality/report.jsonl 超时（${timeoutMs}ms；最后见到：${lastSeen}）`)
}

/** 收集隔离 home 下全部会话日志里的质量环回注消息（kind 匹配 LINT_SOURCE_KIND）。 */
function collectLintFeedbackMessages(home) {
  return collectSessionFiles(home)
    .flatMap((entry) => readSessionLog(entry.file).userMessages)
    .filter((message) => message.kind === LINT_SOURCE_KIND)
}

/** 轮询直到回注消息计数达到 expected（并返回当时计数）。 */
async function waitForLintFeedbackCount(home, expected, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let count = 0
  while (Date.now() < deadline) {
    count = collectLintFeedbackMessages(home).length
    if (count >= expected) return count
    await sleep(500)
  }
  throw new AssertionError(`等待质量环回注消息达到 ${expected} 条超时（${timeoutMs}ms；实际 ${count} 条）`)
}

/** 构造一个含 P0 特征（紫渐变）且过完整性哨兵（文末 </html>）的产物 HTML 文本。 */
function dirtyArtifactHtml(title) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    `  <title>${title}</title>`,
    '  <style>',
    `    .hero { background: ${DIRTY_GRADIENT}; color: #fff; padding: 48px; }`,
    '  </style>',
    '</head>',
    '<body>',
    `  <div class="hero"><h1>${title}</h1></div>`,
    '</body>',
    '</html>',
  ].join('\n')
}

/** doctor 十二分节标题（lib/commands/doctor.ts DOCTOR_SECTIONS 字面对账；comment-loop U5 第⑫节评论环在列）。 */
const DOCTOR_SECTIONS_12 = [
  '安装形态与资源根',
  '清单路径与三层版本',
  'roster 完整性核验',
  '改写规则命中清单',
  '材质化状态',
  '资产代际提示',
  '异常与恢复动作',
  '止损位状态',
  '资产丰富度',
  '协议与检查器对账',
  '质量发现',
  '评论环',
]

/** 断言 doctor 输出含全部分节标题行（`【N/12】标题`；前八节 = V1 零回归面），并与 DOCTOR_SECTIONS 常量双向对账（漂移即红）。 */
function expectDoctorSections(body) {
  assert(body.includes('OpenDesign 设计模式诊断报告'), '缺诊断报告标题')
  assert(
    JSON.stringify(Object.values(DOCTOR_SECTIONS)) === JSON.stringify(DOCTOR_SECTIONS_12),
    `DOCTOR_SECTIONS 常量与本 spec 字面对账表漂移：${JSON.stringify(DOCTOR_SECTIONS)}`,
  )
  DOCTOR_SECTIONS_12.forEach((title, index) => {
    assert(body.includes(`【${index + 1}/${DOCTOR_SECTION_COUNT}】${title}`), `缺分节 ${index + 1}/${DOCTOR_SECTION_COUNT} ${title}`)
  })
}

// ── 元素锚点（comment-anchor）共享载体 ────────────────────────────────────────

/**
 * 拾取场景专用产物（运行时写盘，S12 legacy.html / u-probe pick-probe.html 同款先例）：
 * 三级降级各留一个载体元素（D1）——#main-title（id 级）、section 内部无 id 段落（data 级，
 * 最近祖先带 data-od-id）、footer 裸链接（path 级，无 id 无锚属性）。path 级 sel 固定为
 * 'html > body:nth-of-type(1) > footer:nth-of-type(1) > a:nth-of-type(1)'（pick-script
 * pathSelectorFor 的 tag:nth-of-type 链；footer/a 均为该型唯一子元素）。
 */
const PICK_ARTIFACT_NAME = 'pick-me.html'
const PICK_ARTIFACT_PATH_SEL = 'html > body:nth-of-type(1) > footer:nth-of-type(1) > a:nth-of-type(1)'
function pickArtifactHtml({ title = 'Main Title' } = {}) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8" /><title>pick target</title></head>',
    '<body>',
    `  <section id="hero" data-od-id="hero-sec">`,
    `    <h1 id="main-title">${title}</h1>`,
    '    <p>intro copy for data anchor</p>',
    '  </section>',
    '  <footer>',
    '    <a href="#top">bare footer link</a>',
    '  </footer>',
    '</body>',
    '</html>',
  ].join('\n')
}

/** 侧栏开合机器判据（隔离实例实测）：宿主左侧栏展开 ⇔ 「Collapse sidebar」按钮在场；收起态该按钮缺席（无 Expand 词形）。 */
async function leftSidebarExpanded(page) {
  return page.evaluate(() => document.querySelector('button[aria-label="Collapse sidebar"]') !== null)
}

/** 等「Collapse sidebar」按钮达到期望在场态（侧栏动作经宿主 store 异步投影，轮询不盲等）。 */
async function waitForSidebarState(page, expanded, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  let current = null
  while (Date.now() < deadline) {
    current = await leftSidebarExpanded(page)
    if (current === expanded) return
    await sleep(300)
  }
  throw new AssertionError(`左侧栏未达到期望态（期望 ${expanded ? '展开' : '收起'}，实得 ${current ? '展开' : '收起'}）`)
}

// ── 场景工作目录 ─────────────────────────────────────────────────────────────

/** 建场景工作目录（可选 git 化；返回 realpath）。 */
function makeWorkspaceDir(label, { git = false } = {}) {
  const dir = fs.mkdtempSync(path.join(WORKSPACE_ROOT, `${label}-`))
  if (git) {
    const run = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
    run(['init', '-q'])
    run(['-c', 'user.email=e2e@example.invalid', '-c', 'user.name=e2e', 'commit', '--allow-empty', '-q', '-m', 'init'])
    if (run(['log', '--oneline']).status !== 0) throw new Error(`git fixture 初始化失败：${dir}`)
  }
  return dir
}

/** 把探针产物 fixture 拷进工作目录（V10/RL8 的 cwd 内产物 + 非产物文件）。 */
function seedProbeArtifact(dir) {
  for (const name of ['index.html', 'secret-note.txt']) {
    fs.copyFileSync(path.join(E2E_FIXTURES, 'probe-artifact', name), path.join(dir, name))
  }
}

// ── 评论环（comment-loop）共享驱动与断言通道 ─────────────────────────────────

/** 按注入标记找会话 id（collectSessionFiles 的 sessionId 段 = 宿主会话 id）。 */
function findSessionIdBySystemMark(home, mark) {
  const entry = collectSessionFiles(home)
    .map((f) => ({ ...f, log: readSessionLog(f.file) }))
    .find((f) => f.log.systemMessages.some((t) => t.includes(mark)))
  if (entry === undefined) throw new AssertionError(`找不到 system 节点含 ${JSON.stringify(mark)} 的会话日志`)
  return entry.sessionId
}

/** 读会话工作目录评论数据文件的线程全集（D1 单文件权威；文件缺席返回 null——区别于空清单）。 */
function readCommentThreads(workspace) {
  const file = path.join(workspace, COMMENTS_DIR_NAME, COMMENTS_FILE_NAME)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8')).threads
}

/** 轮询评论数据文件直到谓词满足（写侧事务即时落盘，轮询只为时序余量）。 */
async function waitForCommentThreads(workspace, predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  let lastSeen = 'file absent'
  while (Date.now() < deadline) {
    const threads = readCommentThreads(workspace)
    if (threads !== null && predicate(threads)) return threads
    lastSeen = threads === null ? 'file absent' : `${threads.length} threads`
    await sleep(400)
  }
  throw new AssertionError(`等待评论数据文件超时（${timeoutMs}ms；最后见到：${lastSeen}）`)
}

/** 收集隔离 home 全部会话日志里的评论回注消息（kind 匹配 COMMENT_SOURCE_KIND；AX2 独立 kind）。 */
function collectCommentFeedbackMessages(home) {
  return collectSessionFiles(home)
    .flatMap((entry) => readSessionLog(entry.file).userMessages)
    .filter((message) => message.kind === COMMENT_SOURCE_KIND)
}

/** 轮询直到评论回注消息计数达到 expected。 */
async function waitForCommentFeedbackCount(home, expected, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let count = 0
  while (Date.now() < deadline) {
    count = collectCommentFeedbackMessages(home).length
    if (count >= expected) return count
    await sleep(500)
  }
  throw new AssertionError(`等待评论回注消息达到 ${expected} 条超时（${timeoutMs}ms；实际 ${count} 条）`)
}

/**
 * 页面内同源 fetch（相对路径寻址——与面板 client/comments/api.ts 同一通道；返回
 * status / text / JSON body，非 JSON 响应 body = null）。
 */
async function pageFetch(page, pathname, init) {
  return page.evaluate(async ({ pathname, init }) => {
    const response = await fetch(pathname, init)
    const text = await response.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = null }
    return { status: response.status, text, body }
  }, { pathname, init })
}

/** 展开评论侧栏折叠条（挂载条件 = iframe 模式 × 设计会话 × 有当前产物，client/comments/panel.tsx）。 */
async function openCommentsSidebar(page) {
  const tab = page.locator('button.odp-comments-tab')
  await tab.waitFor({ state: 'visible', timeout: 15000 })
  await tab.click()
  await page.waitForSelector('.odp-comments-panel', { timeout: 10000 })
}

/**
 * 保证评论侧栏处于展开态：展开面板（.odp-comments-panel）在 DOM 才有头部开关与线程条目；
 * 折叠态（或重挂/切产物后 expanded 复位）先点折叠条展开。openCommentsSidebar 的幂等形态。
 */
async function ensureCommentsSidebarExpanded(page) {
  if (await page.locator('.odp-comments-panel').count() === 0) {
    await openCommentsSidebar(page)
  }
}

/**
 * 经拾取入口发送一条评论并等到线程徽标出现「Sent」（D3 入口唯一化后的唯一首评路径：
 * 评论模式开关 → 产物内点击选中 → 输入面板 → 发送 → 面板 create 成功重拉侧栏）。
 * 前置：iframe 内拾取脚本已 ready（评论模式开关禁用态解除）。
 */
async function sendCommentViaPick(page, selector, text) {
  // 侧栏已展开（.odp-comments-panel 在场）则不再点折叠条——折叠条仅折叠态在 DOM
  // （panel.tsx expanded 二态渲染），重复点击会 waitFor 超时（P2 冒烟实测）。
  await ensureCommentsSidebarExpanded(page)
  const toggle = page.locator('.odp-comments-panel button[aria-label="Comment mode"]')
  await toggle.waitFor({ state: 'visible', timeout: 15000 })
  // ready 前（拾取脚本未握手）开关禁用——就绪轮询而非盲等（D8(a) 就绪态管理的用户可见面）
  await page.waitForFunction(
    () => {
      const button = document.querySelector('.odp-comments-panel button[aria-label="Comment mode"]')
      return button !== null && !button.disabled
    },
    undefined,
    { timeout: 20000 },
  )
  // 评论模式是持续开关（aria-pressed）而非触发器：拾取成功后模式仍开启，重复点击会把它
  // 翻转关闭、随后的 hover 高亮与点击拾取全部失效（P2/P3/P4 冒烟实测）——仅在未开启时点击。
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click()
  }
  const frame = page.frameLocator('iframe.odp-frame')
  await frame.locator(selector).hover()
  await frame.locator('.od-pick-box').waitFor({ state: 'visible', timeout: 5000 })
  await frame.locator(selector).click()
  const panel = frame.locator('.od-pick-panel')
  await panel.waitFor({ state: 'visible', timeout: 5000 })
  await panel.locator('textarea').fill(text)
  await panel.locator('button.od-pick-primary').click()
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.odp-thread .odp-badge')).some((el) => el.textContent?.trim() === 'Sent'),
    undefined,
    { timeout: 20000 },
  )
  // 收拾拾取面板：成功回执已关闭输入框（cancelSelection），断言其消失防残留污染后续拾取
  await frame.locator('.od-pick-panel').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
}

/**
 * 断言回注消息形态与生产构造逐字一致（AX2 独立 kind + D3 source 五字段 + D6 三段文本 +
 * D7 锚点扩展：围栏 JSON 含线程首评 anchor 与保留锚点指令句）——期望值直接调
 * buildCommentMessage 生成（anchor 随线程透传），生产实现漂移即红。
 */
function assertCommentMessageText(message, thread, payloadText) {
  assert(
    message.kind === COMMENT_SOURCE_KIND,
    `回注消息 source.kind 应为 ${COMMENT_SOURCE_KIND}（AX2 独立 kind，不冒充 kind='user'）：${JSON.stringify(message.kind)}`,
  )
  const expected = buildCommentMessage({
    threadId: thread.id,
    artifactPath: thread.artifactPath,
    text: payloadText,
    createdAt: thread.createdAt,
    ...(thread.anchor !== undefined ? { anchor: thread.anchor } : {}),
  })
  const expectedText = expected.content?.[0]?.text ?? ''
  assert(
    JSON.stringify(message.source) === JSON.stringify(expected.source),
    `回注消息 source 应与生产构造逐字一致（D3 五字段 kind/form/summary/artifactPath/threadId 随消息持久化）：\n实际：${JSON.stringify(message.source)}\n期望：${JSON.stringify(expected.source)}`,
  )
  assert(
    message.text === expectedText,
    `回注消息文本应逐字等于 buildCommentMessage 构造（D6 三段形态）：\n实际：${String(message.text).slice(0, 400)}\n期望：${expectedText.slice(0, 400)}`,
  )
}

/** doctor 第⑫节评论环的计数/分布行（与 lib/commands/doctor.ts renderCommentsSection 同式拼装）。 */
function commentDistributionLine(threads) {
  const distribution = COMMENT_DELIVERY_STATES.map((state) => {
    const count = threads.filter((thread) => thread.delivery === state).length
    return `${state} ${count}`
  }).join(' / ')
  return `线程计数：${threads.length}；各 delivery 状态分布：${distribution}`
}

/** 隔离 home 全部会话日志的 turn/start 事件计数（comment-loop·V10 通道判据：followup 开新轮则 +1，steer 注入当前轮不变）。 */
function totalTurnStartCount(home) {
  return collectSessionFiles(home)
    .map((f) => readSessionLog(f.file).turnStarts.length)
    .reduce((sum, count) => sum + count, 0)
}

/**
 * 设计会话 + 产物预览就位的共享搭建（comment-loop / comment-anchor 场景同形态：
 * makeWorkspaceDir + withInstance + pick/pick/send 链 + 材质化标记在盘等待）。
 * seed 除探针产物外固定写拾取载体 pick-me.html（三级降级三元素，comment-anchor 场景共用）；
 * {@link artifact} 决定进入 iframe 的产物行（缺省 index.html——探针断言场景沿用）。
 * 返回实例句柄与会话 id；评论侧栏展开留给各场景按需执行。
 */
async function bootDesignSessionWithArtifact({ label, workspace, artifact = 'index.html' }) {
  seedProbeArtifact(workspace)
  fs.writeFileSync(path.join(workspace, PICK_ARTIFACT_NAME), pickArtifactHtml())
  const instance = await withInstance({ label, fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  const { page, home } = instance
  await pickWorkspace(page, workspace)
  await pickDesignPreset(page)
  await sendUserMessage(page, 'design a landing page for the comment loop')
  const sessionId = findSessionIdBySystemMark(home, DESIGN_INJECTION_MARK)
  // 材质化标记在盘（probeDesignSession 伺服可达前提 = 评论侧栏挂载前提；S1 材质化同通道）
  const framesReady = path.join(fs.realpathSync(workspace), '.od-frames', DECK_FRAMEWORK_FILE_NAME)
  const deadline = Date.now() + 20000
  while (!fs.existsSync(framesReady) && Date.now() < deadline) await sleep(500)
  assert(fs.existsSync(framesReady), `材质化标记缺席（评论侧栏挂载前提）：${framesReady}`)
  await openDesignPanel(page)
  await page.waitForFunction(
    (name) => Array.from(document.querySelectorAll('.odp-row')).some((el) => el.textContent?.trim() === name),
    artifact,
    { timeout: 15000 },
  )
  await page.locator('.odp-row', { hasText: artifact }).first().click()
  await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
  return { instance, page, home, workspace, sessionId }
}

// ── 场景 ─────────────────────────────────────────────────────────────────────

const MINI_OD_ROOT = path.join(FIXTURES, 'mini-od')
const GEN1_ROOT = path.join(E2E_FIXTURES, 'resume-gen1')
const GEN2_ROOT = path.join(E2E_FIXTURES, 'resume-gen2')
const EMPTY_ROOT = path.join(E2E_FIXTURES, 'empty-assets')
const SI3_ROOT = path.join(E2E_FIXTURES, 'si3-broken-manifest')
const DRIFT_ROOT = path.join(FIXTURES, 'drift-od', 'upgraded', 'v2')
const LEGACY_PAGE_HTML = path.join(E2E_FIXTURES, 'legacy-page', 'index.html')
/** V1 设计包 D8 复制件管理名清单（与 lib/materialize/copy.ts MATERIALIZED_FILE_NAMES 对账）。 */
const OD_FRAMES_FILES = ['android.html', 'iphone.html', 'neutral.html', 'layout.css']

/** 场景 S1（V1+V3+V4 注入形态）：roster 可见性 + 注入（四新段/指针/panel 段）+ 默认会话不变 + 材质化 5 文件。 */
async function scenarioV1() {
  const results = []
  const workspace = makeWorkspaceDir('v1')
  const instance = await withInstance({ label: 'v1', fixtureRoot: RICH_ROOT, workspaceDir: workspace })
  try {
    const { page, home } = instance

    await stepAsync(results, 'roster 卡片在 custom 分组且名称/描述正确（RL1 设置页形态 + V3 文案回写）', async () => {
      const roster = await readSettingsRoster(page)
      assert(roster.groups.includes('Custom'), `分组标题缺 Custom：${JSON.stringify(roster.groups)}`)
      const card = roster.cards.find((c) => c.id === 'opendesign')
      assert(card !== undefined, `roster 缺 opendesign 卡片：${JSON.stringify(roster.cards.map((c) => c.id))}`)
      assert(card.text.includes('OpenDesign 设计模式'), `卡片名不对：${JSON.stringify(card.text.slice(0, 80))}`)
      assert(card.text.includes('未装 OpenDesign 时入口显式降级提示'), `卡片描述不对：${JSON.stringify(card.text.slice(0, 160))}`)
      assert(card.text.includes('演示稿带 deck 协议信号'), `卡片描述缺 deck 协议信号句（opendesign-assets-quality D9 文案回写）：${JSON.stringify(card.text.slice(0, 220))}`)
      assert(card.broken === false, `卡片不应为 broken：${JSON.stringify(card.alert)}`)
    })

    await stepAsync(results, '新会话选择器菜单含设计模式卡片（RL1 picker 形态）', async () => {
      await pickWorkspace(page, workspace)
      const items = await readPickerItems(page)
      const item = items.find((t) => t.includes('OpenDesign 设计模式'))
      assert(item !== undefined, `选择器菜单缺设计模式：${JSON.stringify(items)}`)
      assert(item.includes('以本机 OpenDesign 资产驱动的设计会话'), `菜单项描述不对：${JSON.stringify(item)}`)
    })

    await stepAsync(results, '默认 preset 行为不变：standard 会话 system 节点无设计内容', async () => {
      await sendUserMessage(page, 'plain session smoke')
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.length > 0)
      const sys = log.systemMessages.at(-1) ?? ''
      assert(!sys.includes(DESIGN_INJECTION_MARK), 'standard 会话 system 节点不应含设计路由段')
      assert(!sys.includes(RICH_PROFILE_PATH), 'standard 会话 system 节点不应含设计任务档路径')
    })

    await stepAsync(results, '设计会话：注入路由段与 prototype 任务档路径（V1 注入断言）', async () => {
      await page.getByRole('button', { name: 'New session' }).first().click()
      await page.waitForTimeout(1000)
      await clearModalGates(page)
      await pickWorkspace(page, workspace)
      await pickDesignPreset(page)
      await sendUserMessage(page, 'design a coffee brand landing page')
      const { log } = await waitForSessionLog(
        home,
        (_entry, l) => l.systemMessages.some((t) => t.includes(DESIGN_INJECTION_MARK)),
        30000,
      )
      assert(log.presetSelections.includes('opendesign'), `preset 选定记录缺失：${JSON.stringify(log.presetSelections)}`)
      const sys = log.systemMessages.find((t) => t.includes(DESIGN_INJECTION_MARK)) ?? ''
      assert(sys.includes(RICH_PROFILE_PATH), '注入文本缺 prototype 任务档绝对路径（路由段）')
    })

    await stepAsync(results, '注入文本含形状包清单段：dashboard 条目 + zh 触发词 + 根路径声明（V1/D2）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('### Shape templates (design-templates)')))
      const sys = log.systemMessages.find((t) => t.includes('### Shape templates (design-templates)')) ?? ''
      assert(sys.includes('### Shape templates (design-templates)'), '缺形状包清单段标题')
      assert(sys.includes(`root: \`${RICH_ROOT}/design-templates\``), '清单段缺 design-templates 根绝对路径声明')
      const entry = sys.split('\n').find((line) => line.startsWith('- dashboard'))
      assert(entry !== undefined, `清单段缺 dashboard 条目：${JSON.stringify(sys.slice(sys.indexOf('Shape templates'), sys.indexOf('Shape templates') + 600))}`)
      assert(entry.includes('mode: prototype'), 'dashboard 条目缺 od.mode 摘录')
      assert(entry.includes('Admin / analytics dashboard'), 'dashboard 条目缺 description 首句摘录')
      assert(entry.includes('zh: 后台, 管理后台'), `dashboard 条目缺中文触发词摘录：${JSON.stringify(entry)}`)
    })

    await stepAsync(results, '注入文本含 craft 指路块：craft/ 根绝对路径（V1/D1 指路自读形态）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('name="craft"')))
      const sys = log.systemMessages.find((t) => t.includes('name="craft"')) ?? ''
      assert(sys.includes('<od-next-context kind="fact" name="craft">'), '缺 craft 事实注入块')
      assert(sys.includes(`"root":"${RICH_ROOT}/craft"`), `craft 块缺 craft/ 根绝对路径：${JSON.stringify(sys.match(/\{[^}]*craft[^}]*\}/)?.[0]?.slice(0, 300))}`)
      assert(sys.includes('craft.requires'), 'craft 块缺消费指引（按形状包 craft.requires 自读）')
    })

    await stepAsync(results, '注入文本含 manifest 感知设计系统清单段：sample-brand 行 + 深层文件指路（V1/D3）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('### Design systems installed on this machine')))
      const sys = log.systemMessages.find((t) => t.includes('### Design systems installed on this machine')) ?? ''
      const entry = sys.split('\n').find((line) => line.startsWith('- sample-brand'))
      assert(entry !== undefined, `设计系统清单段缺 sample-brand 行：${JSON.stringify(sys.slice(0, 500))}`)
      assert(entry.includes('Sample Brand'), '清单行缺 manifest name')
      assert(entry.includes('Technology & SaaS'), '清单行缺 manifest category')
      assert(entry.includes('USAGE.md'), '清单行缺深层文件指路（USAGE.md 在场探测）')
    })

    await stepAsync(results, '注入文本含 panel 评审团协议段：五面板骨架与数值参数（V4 注入形态/opendesign-assets-quality D8）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('Critique Theater')))
      const sys = log.systemMessages.find((t) => t.includes('Critique Theater')) ?? ''
      assert(sys.includes('# Critique Theater'), '缺 panel 协议段标题（五面板评审骨架）')
      assert(sys.includes('maxRounds="3"'), 'panel 段缺轮数参数（缺省兜底 3）')
      assert(sys.includes('threshold="8"'), 'panel 段缺收敛阈值参数（缺省兜底 8.0）')
      assert(sys.includes('<CRITIQUE_RUN'), 'panel 段缺评审 wire protocol 标记块')
    })

    await stepAsync(results, '注入文本含 ppt 条目 deck 协议指针（V3/opendesign-assets-quality D9 指针 + 自读形态）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('Deck protocol note')))
      const sys = log.systemMessages.find((t) => t.includes('Deck protocol note')) ?? ''
      assert(sys.includes('`.od-frames/deck-framework.md`'), 'ppt 条目缺 deck 协议文件指针（.od-frames/deck-framework.md）')
    })

    step(results, '注入文本无占位符与 od CLI 特征串残留（RL3 的 e2e 旁证）', () => {
      const files = collectSessionFiles(home)
      const designLogs = files.map((f) => readSessionLog(f.file)).filter((l) => l.systemMessages.some((t) => t.includes(DESIGN_INJECTION_MARK)))
      assert(designLogs.length > 0, '找不到设计会话日志')
      const all = designLogs.flatMap((l) => l.systemMessages).join('\n')
      assert(!all.includes('{{SKILL_CATALOG}}'), '注入文本含 {{SKILL_CATALOG}} 字面（占位符防御失效）')
      assert(!all.includes('$OD_BIN'), '注入文本含 $OD_BIN 特征串（改写器对注入文本的命令清零失效）')
      assert(!all.includes('$OD_NODE_BIN'), '注入文本含 $OD_NODE_BIN 特征串（改写器对注入文本的命令清零失效）')
    })

    await stepAsync(results, '材质化：.od-frames/ 恰 5 管理名（4 复制件 + deck-framework.md）落盘且逐字节一致（V1 设计包 D8 + opendesign-assets-quality D9）', async () => {
      const framesDir = path.join(workspace, '.od-frames')
      await waitForSessionLog(home, (_entry, l) => l.systemMessages.length > 0, 1000).catch(() => {})
      let frames = []
      const deadline = Date.now() + 20000
      while (Date.now() < deadline) {
        frames = fs.existsSync(framesDir) ? fs.readdirSync(framesDir) : []
        if (MATERIALIZED_WRITE_LIST.every((name) => frames.includes(name))) break
        await sleep(500)
      }
      assert(
        MATERIALIZED_WRITE_LIST.every((name) => frames.includes(name)),
        `.od-frames/ 缺写清单管理名：${JSON.stringify(frames)}（期望 ${JSON.stringify(MATERIALIZED_WRITE_LIST)}）`,
      )
      assert(frames.length === MATERIALIZED_WRITE_LIST.length, `.od-frames/ 出现清单外文件：${JSON.stringify(frames)}`)
      const prototypeDir = path.join(RICH_SCENARIO, 'assets', 'task-profiles', 'prototype')
      for (const name of OD_FRAMES_FILES) {
        const written = fs.readFileSync(path.join(framesDir, name))
        // fixture 实布局：三个 html 在 device-frames/ 子目录，layout.css 在 prototype/ 根（与清单 resources 声明一致）
        const source = path.join(prototypeDir, name === 'layout.css' ? name : path.join('device-frames', name))
        assert(written.equals(fs.readFileSync(source)), `材质化副本与源不一致：${name}`)
      }
      const deckFile = fs.readFileSync(path.join(framesDir, DECK_FRAMEWORK_FILE_NAME), 'utf8')
      assert(deckFile === DECK_FILE_EXPECTED, `deck-framework.md 与派生登记文本不一致（${deckFile.length} vs ${DECK_FILE_EXPECTED.length} 字符）`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/** 场景 S2+S3（V5 前八节零回归 + 面板 + 探针）：预览面板交互 + 探针隔离 + doctor 十一节（mini-od ⑨ 降级形态）。 */
async function scenarioPanelAndDoctor() {
  const results = []
  const workspace = makeWorkspaceDir('panel')
  seedProbeArtifact(workspace)
  const instance = await withInstance({ label: 'panel', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  try {
    const { page, home } = instance
    await pickWorkspace(page, workspace)
    await pickDesignPreset(page)
    await sendUserMessage(page, 'design a landing page')

    await stepAsync(results, 'doctor 输出十一分节齐全，前八节零回归（V5）', async () => {
      const body = await runDoctor(page)
      expectDoctorSections(body)
      assert(body.includes('资源根：'), '缺资源根行')
      assert(body.includes('manifest 版本'), '缺 manifest 版本行')
      assert(body.includes('结论：全部声明文件在场'), 'roster 核验应全过')
    })

    await stepAsync(results, 'doctor ⑨ 资产丰富度：mini-od 三目录缺失降级形态带恢复动作（V6 降级口径）', async () => {
      const body = await runDoctor(page)
      assert(body.includes('【9/12】资产丰富度'), '缺第⑨节资产丰富度')
      assert(body.includes('craft/ 目录缺失'), `⑨ 应报 craft 目录缺失降级：${body.slice(body.indexOf('【9/12】'), body.indexOf('【10/12】'))}`)
      assert(body.includes('design-templates/ 目录缺失'), '⑨ 应报形状包目录缺失降级')
      assert(body.includes('检查资产根（资源根见第①节）与 OD 安装完整性'), '⑨ 降级缺资产根完整性恢复动作')
    })

    await stepAsync(results, 'doctor ⑩ 协议对账：登记锚三行 + clone 未登记「无法比对」+ 登记恢复动作（V8 缺省态）', async () => {
      const body = await runDoctor(page)
      assert(body.includes('【10/12】协议与检查器对账'), '缺第⑩节协议对账')
      assert(body.includes('panel 评审团协议'), '⑩ 缺 panel 登记锚行')
      assert(body.includes('deck 演示稿协议'), '⑩ 缺 deck 登记锚行')
      assert(body.includes('反 AI 味检查项清单'), '⑩ 缺检查项清单登记锚行')
      assert(body.includes('源码仓 clone 探测：未登记'), '⑩ 未登记态应报「未登记」')
      assert(body.includes('无法比对'), '⑩ 未登记态应报「无法比对」')
      assert(body.includes('重新运行 /opendesign-doctor 并附 OpenDesign 源码仓 clone 路径参数'), '⑩ 缺登记路径恢复动作')
      assert(body.includes('已知信息：clone HEAD 可能滞后'), '⑩ 缺 clone HEAD 滞后已知信息行')
    })

    await stepAsync(results, 'doctor ⑪ 质量发现：监听器运行形态（设计会话已起监听，V5 第⑪节）', async () => {
      const workspaceReal = fs.realpathSync(workspace)
      await waitForReportLine(workspaceReal, (line) => line.type === 'watcher' && line.event === 'started')
      const body = await runDoctor(page)
      assert(body.includes('【11/12】质量发现'), '缺第⑪节质量发现')
      assert(body.includes('监听器状态：运行中推定'), `⑪ 应报监听器运行中推定：${body.slice(body.indexOf('【11/12】'), body.indexOf('【11/12】') + 600)}`)
      assert(body.includes('累计启动 1 次'), '⑪ 监听器累计启动计数不对')
      assert(body.includes('检查发现：共 0 条'), '⑪ 应报零发现（快照内既有文件未触碰不产生记录）')
      assert(body.includes('产物写盘身份记录：0 条'), '⑪ 应报零身份记录（尚未有快照外写盘）')
    })

    await stepAsync(results, 'doctor 材质化状态报告落点清单（第⑤节）', async () => {
      const body = await runDoctor(page)
      assert(body.includes(path.join(workspace, '.od-frames')), '材质化状态缺写入落点路径')
      assert(body.includes('个管理名全部在场'), '材质化状态缺全在场结论')
    })

    await stepAsync(results, '预览面板：fixture 产物出现在产物列表（V1·A3b 兜底列表）', async () => {
      await openDesignPanel(page)
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.odp-row')).map((r) => (r.textContent ?? '').trim()))
      assert(rows.includes('index.html'), `产物列表缺 index.html：${JSON.stringify(rows)}`)
    })

    await stepAsync(results, '预览面板：产物经伺服路由载入 iframe 且 sandbox 只放脚本（V1·RL6 与 V1 设计包 D7）', async () => {
      await page.locator('.odp-row').first().click()
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
      const sandbox = await page.getAttribute('iframe.odp-frame', 'sandbox')
      assert(sandbox === 'allow-scripts', `iframe sandbox 形态不对：${JSON.stringify(sandbox)}（不得含 allow-same-origin）`)
    })

    await stepAsync(results, '产物脚本可执行且探针写 DOM（V1·RL6 交互性）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      const results0 = await frame.locator('#probe-results').textContent({ timeout: 15000 })
      assert(results0 !== null && results0 !== 'pending', `探针未产出结果：${JSON.stringify(results0)}`)
    })

    await stepAsync(results, '探针：document.cookie 为空（V1·RL8：fetch 不携带宿主 cookie 的前提语义）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      const cookie = await frame.locator('#probe-cookie').textContent({ timeout: 10000 })
      assert(cookie !== null && /^cookie: \(empty\)|^cookie: blocked SecurityError/.test(cookie.trim()), `产物内 cookie 应为隔离形态（空或 SecurityError）：${JSON.stringify(cookie?.slice(0, 160))}`)
    })

    await stepAsync(results, '探针：伺服根非产物文件不可得（V1·RL8：无 canary 泄漏）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      const secret = await frame.locator('#probe-secret').textContent({ timeout: 10000 })
      assert(secret !== null && !secret.includes('SECRET-NOTE-CANARY'), `非产物内容泄漏：${JSON.stringify(secret?.slice(0, 160))}`)
    })

    await stepAsync(results, '探针：宿主 open 路由响应不可得（V1·RL8：围栏拒/opaque origin）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      const open = await frame.locator('#probe-open').textContent({ timeout: 10000 })
      assert(open !== null && !open.includes('status=200'), `open 路由响应疑似可得：${JSON.stringify(open?.slice(0, 160))}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 S2b（V5 第⑨节非降级形态）：rich-assets 三目录齐备 → doctor ⑨ 报真实清点数
 * （craft 册数按规则书口径排除两个元文件、形状包与解析异常、manifest 命中、清单段注入行数）。
 */
async function scenarioDoctorRich() {
  const results = []
  const workspace = makeWorkspaceDir('v5-rich')
  const instance = await withInstance({ label: 'v5-rich', fixtureRoot: RICH_ROOT, workspaceDir: workspace })
  try {
    const { page } = instance
    await pickWorkspace(page, workspace)
    await pickDesignPreset(page)
    await sendUserMessage(page, 'doctor richness check')
    await stepAsync(results, 'doctor ⑨ 资产丰富度非降级：craft 3 册（排除元文件）/ 形状包 1 / manifest 命中 1（V5/D10⑨）', async () => {
      const body = await runDoctor(page)
      assert(body.includes('craft 手册：3 册'), `⑨ craft 册数不对（rich-assets 3 手册 + README 元文件应排除）：${body.slice(body.indexOf('【9/12】'), body.indexOf('【10/12】'))}`)
      assert(body.includes('排除 README.md 与 FUTURE_SECTIONS.md 两个元文件'), '⑨ 缺规则书口径说明')
      assert(body.includes('形状包：1 个（解析异常 0 个）'), '⑨ 形状包计数不对（rich-assets 恰 dashboard 一包）')
      assert(body.includes('设计系统 manifest 命中：1 个（解析异常 0 个）'), '⑨ manifest 命中计数不对（rich-assets 恰 sample-brand 一包）')
      assert(body.includes('形状包清单段 1 行 / 设计系统清单段 1 行'), '⑨ 清单段注入行数不对')
      assert(body.includes('craft 指路块：注入'), '⑨ 应报 craft 指路块注入（craft/ 在场）')
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 S3（V2+V10/RL1 真机半场+RL10）：质量环回注与指纹去重。
 *
 * 时序：设计会话（触发监听启动）→ 会话开始前 seed 的陌生既有文件触碰 → 只记录不回注
 * （V10）→ 快照外新写 P0 产物 → 防抖 + 哨兵 + 检查 → followup 回注（协议信号形态断言）
 * → 同内容重写 → 指纹去重（回注计数不变 + duplicate 记录恰一行）。
 */
async function scenarioQualityLoop() {
  const results = []
  const workspace = makeWorkspaceDir('v2')
  // V10：会话开始前放陌生既有文件（监听启动快照内、无产物身份记录）
  fs.copyFileSync(LEGACY_PAGE_HTML, path.join(workspace, 'legacy-page.html'))
  const instance = await withInstance({ label: 'v2', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  const workspaceReal = fs.realpathSync(workspace)
  try {
    const { page, home } = instance
    await pickWorkspace(page, workspace)
    await pickDesignPreset(page)
    await sendUserMessage(page, 'design a pricing page')

    await stepAsync(results, '监听器启动记录在场（watcher started 行，V2 前置）', async () => {
      await waitForReportLine(workspaceReal, (line) => line.type === 'watcher' && line.event === 'started')
    })

    await stepAsync(results, 'V10：触碰陌生既有文件——只落 finding 记录（unrecognized-existing），零回注', async () => {
      // 读-改-写回：保持 </html> 文末结尾（过完整性哨兵），内容变化触发 fs.watch
      const file = path.join(workspaceReal, 'legacy-page.html')
      const original = fs.readFileSync(file, 'utf8')
      fs.writeFileSync(file, original.replace('</body>', '  <div aria-hidden="true"></div>\n</body>'))
      await waitForReportLine(workspaceReal, (line) => line.type === 'finding' && line.reason === 'unrecognized-existing')
      const lines = readQualityReport(workspaceReal)
      const hits = lines.filter((line) => line.type === 'finding' && line.id === 'purple-gradient' && line.reason === 'unrecognized-existing')
      assert(hits.length === 1, `陌生既有文件的 purple-gradient finding 应恰 1 行：${JSON.stringify(lines)}`)
      assert(hits[0].path === 'legacy-page.html', `finding path 应为 cwd 相对路径：${JSON.stringify(hits[0])}`)
      assert(collectLintFeedbackMessages(home).length === 0, '陌生既有文件命中不应产生回注消息（V10 零回注）')
    })

    await stepAsync(results, 'V2：快照外新写 P0 产物——防抖后检查，回注消息以包专有 source.kind 注入会话（RL1 真机半场/AX7）', async () => {
      fs.writeFileSync(path.join(workspaceReal, 'pricing.html'), dirtyArtifactHtml('Pricing'))
      await waitForLintFeedbackCount(home, 1)
      const messages = collectLintFeedbackMessages(home)
      const message = messages[0]
      assert(message.text.includes('[opendesign-design-mode 质量环]'), '回注文本开头应自报质量环身份（AX7）')
      assert(message.text.includes('purple-gradient'), '回注文本缺检查项 id')
      assert(message.text.includes('修复指引'), '回注文本缺修复指引')
      assert(message.text.includes('仅修复你本会话产出的 HTML'), '回注文本缺作用域句（V10 作用域声明）')
      assert(message.text.includes('修复后无需回复本消息'), '回注文本缺无需回复句')
    })

    await stepAsync(results, 'V2：report.jsonl 记录链完整——身份行 + finding（fed-back）落盘（RL9/SC5）', async () => {
      await waitForReportLine(workspaceReal, (line) => line.type === 'finding' && line.reason === 'fed-back')
      const lines = readQualityReport(workspaceReal)
      assert(lines.some((line) => line.type === 'artifact' && line.path === 'pricing.html'), `快照外新写产物应有身份行：${JSON.stringify(lines.filter((l) => l.type === 'artifact'))}`)
      const fedBack = lines.filter((line) => line.type === 'finding' && line.id === 'purple-gradient' && line.reason === 'fed-back')
      assert(fedBack.length === 1, `pricing.html 的 purple-gradient fed-back finding 应恰 1 行：${JSON.stringify(fedBack)}`)
      assert(fedBack[0].severity === 'P0', '回注发现 severity 应为 P0')
    })

    await stepAsync(results, 'V2/SI2：同内容重写指纹去重——回注消息计数不变，duplicate 记录恰一行（RL3）', async () => {
      // 同内容重写：内容指纹（sha256 + P0 id 集）不变 → 去重不再回注，仅落 duplicate 记录
      fs.writeFileSync(path.join(workspaceReal, 'pricing.html'), dirtyArtifactHtml('Pricing'))
      await waitForReportLine(workspaceReal, (line) => line.type === 'finding' && line.reason === 'duplicate')
      await sleep(2500) // 第二次写盘的防抖 + 检查 + 回注窗口余量：确认没有第二条回注
      const messages = collectLintFeedbackMessages(home)
      assert(messages.length === 1, `指纹去重后回注消息应仍为 1 条（去重事件计数）：${messages.length}`)
      const duplicates = readQualityReport(workspaceReal).filter((line) => line.type === 'finding' && line.reason === 'duplicate')
      assert(duplicates.length === 1 && duplicates[0].id === 'purple-gradient', `duplicate 记录应恰 1 行（purple-gradient）：${JSON.stringify(duplicates)}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 S4（V7/RL6）：非设计会话零侵入——standard 会话写 P0 HTML 进其工作目录，
 * 零监听（无 .od-quality/ 目录）零回注（事件流无 lint 消息），插件不接管普通会话。
 */
async function scenarioStandardZeroIntrusion() {
  const results = []
  const workspace = makeWorkspaceDir('v7')
  const instance = await withInstance({ label: 'v7', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  const workspaceReal = fs.realpathSync(workspace)
  try {
    const { page, home } = instance
    await pickWorkspace(page, workspace)
    await sendUserMessage(page, 'plain session writing an html file')

    await stepAsync(results, 'V7：standard 会话写 P0 HTML——零监听（.od-quality/ 不出现）', async () => {
      fs.writeFileSync(path.join(workspaceReal, 'legacy.html'), dirtyArtifactHtml('Plain session page'))
      await sleep(3000) // 防抖（800ms）+ 检查窗口余量：若有监听该窗口内必然产生记录
      assert(!fs.existsSync(path.join(workspaceReal, '.od-quality')), 'standard 会话工作目录不应出现 .od-quality/（零监听）')
    })

    await stepAsync(results, 'V7：standard 会话事件流零回注消息（preset 过滤生效）', async () => {
      const messages = collectSessionFiles(home).flatMap((entry) => readSessionLog(entry.file).userMessages)
      assert(messages.every((message) => message.kind !== LINT_SOURCE_KIND), `standard 会话不应有质量环回注消息：${JSON.stringify(messages.filter((m) => m.kind === LINT_SOURCE_KIND))}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/** 本机是否装有真实 OpenDesign.app（V5 的前置条件判定；run6 实测装有机回退路径见下）。 */
const REAL_OD_INSTALLED = ['/Applications/Open Design.app', '/Applications/Open Design Beta.app', '/Applications/Open Design Prerelease.app', '/Applications/Open Design Preview.app']
  .some((p) => fs.existsSync(p))

/**
 * 场景 S5（主编排注册名「S5 V6无资产+SI3」；A5/V5+RL5 = V1 设计包 impl-plan 验收项编号）：无资产环境降级 + SI3 假阳性形态区分。
 *
 * 前置条件 = 「未安装 OpenDesign 的机器」（fixture README 的假设）。本机已装 OD 时，
 * 定位链的多候选回退（buildVersionProfile：override 候选损坏/缺席 → 落到真机渠道候选）
 * 会把 preset 恢复为 healthy——这是插件的正确定型行为，V5 的 broken 断言在此不可触发。
 * 此时本场景降级为断言「多候选回退」形态（选择器 healthy + doctor 列出坏候选与选中依据），
 * broken 全量断言保留在无 OD 机器分支；降级事实随运行输出呈报（不静默）。
 */
async function scenarioNoAssets() {
  const results = []
  const workspace = makeWorkspaceDir('v5')

  if (REAL_OD_INSTALLED) {
    console.log('    [环境降级] 本机已装 OpenDesign.app：V5/SI3 的 broken 全量断言不可触发（多候选回退到真机渠道），改断言回退形态；broken 断言需在无 OD 机器上补跑')
  }

  // 形态一：资源根指向空目录（未安装形态）
  const missing = await withInstance({ label: 'v5-missing', fixtureRoot: EMPTY_ROOT, workspaceDir: workspace })
  try {
    const { page } = missing
    await pickWorkspace(page, workspace)

    if (!REAL_OD_INSTALLED) {
      await stepAsync(results, '无资产：新会话选择器不出现设计模式（V1·RL5 入口过滤）', async () => {
        const items = await readPickerItems(page)
        assert(!items.some((t) => t.includes('OpenDesign')), `broken preset 不应出现在选择器：${JSON.stringify(items)}`)
        assert(items.some((t) => t.includes('Standard mode')), `healthy preset 应保留：${JSON.stringify(items)}`)
      })

      await stepAsync(results, '无资产：设置页诊断含「未检测到 OpenDesign」安装指引（SI3 第一形态）', async () => {
        const roster = await readSettingsRoster(page)
        const card = roster.cards.find((c) => c.id === 'opendesign')
        assert(card !== undefined, 'broken preset 卡片应在设置页 roster（管理面渲染全量）')
        assert(card.broken, `卡片应带 broken 徽标：${JSON.stringify(card.text.slice(0, 100))}`)
        assert(card.alert !== null && card.alert.includes('未检测到 OpenDesign'), `诊断文案不对：${JSON.stringify(card.alert)}`)
      })
    } else {
      await stepAsync(results, '空 override + 真机候选：选择器 healthy（多候选回退形态，本机已装 OD）', async () => {
        const items = await readPickerItems(page)
        assert(items.some((t) => t.includes('OpenDesign 设计模式')), `回退后设计模式应可用：${JSON.stringify(items.map((t) => t.slice(0, 24)))}`)
      })
    }

    await stepAsync(results, '无资产形态：默认 preset 不受影响（standard 仍在场）', async () => {
      const roster = await readSettingsRoster(page)
      const standard = roster.cards.find((c) => c.id === 'standard')
      assert(standard !== undefined && !standard.broken, 'standard preset 应不受影响')
    })
  } finally {
    await missing.close()
  }

  // 形态二：清单损坏（已装但探测失败，SI3 假阳性收窄方向）
  const si3 = await withInstance({ label: 'v5-si3', fixtureRoot: SI3_ROOT, workspaceDir: workspace })
  try {
    if (!REAL_OD_INSTALLED) {
      await stepAsync(results, '清单损坏：诊断文案报「检测失败请重启 DSH 重试」而非误报未安装（SI3）', async () => {
        const roster = await readSettingsRoster(si3.page)
        const card = roster.cards.find((c) => c.id === 'opendesign')
        assert(card !== undefined && card.broken, 'SI3 形态下 preset 应 broken')
        assert(card.alert !== null && card.alert.includes('重启 DSH 重试'), `文案缺重启指引：${JSON.stringify(card.alert)}`)
        assert(card.alert !== null && !card.alert.includes('未检测到 OpenDesign，请安装'), `SI3 形态误报未安装：${JSON.stringify(card.alert)}`)
      })
    } else {
      await stepAsync(results, '清单损坏 override + 真机候选：doctor 列出坏候选且选中真机渠道（回退形态）', async () => {
        await pickWorkspace(si3.page, workspace)
        await pickDesignPreset(si3.page)
        await sendUserMessage(si3.page, 'doctor candidates check')
        const body = await runDoctor(si3.page)
        assert(body.includes('渠道 override'), 'doctor 应列出 override 候选')
        assert(body.includes('（渠道 stable）') && body.includes('← 已选中'), 'doctor 应标出真机渠道选中项')
        assert(body.includes('manifest 版本'), 'doctor 应报告真机安装的清单版本')
      })
    }
  } finally {
    await si3.close()
  }
  return results
}

/** 场景 S6（主编排注册名「S6 V1·V6 漂移」；A6/V6 = V1 设计包 impl-plan 验收项编号）：资产漂移 fixture 仍可定位 + 画像版本正确。 */
async function scenarioDrift() {
  const results = []
  const workspace = makeWorkspaceDir('v6')
  const instance = await withInstance({ label: 'v6-drift', fixtureRoot: DRIFT_ROOT, workspaceDir: workspace })
  try {
    const { page, home } = instance
    await pickWorkspace(page, workspace)
    await pickDesignPreset(page)
    await sendUserMessage(page, 'design a landing page')

    await stepAsync(results, '漂移布局：设计 preset 未 broken、会话正常注入（搜索式发现定位到非默认清单位置）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes(DESIGN_INJECTION_MARK)))
      const sys = log.systemMessages.find((t) => t.includes(DESIGN_INJECTION_MARK)) ?? ''
      assert(sys.includes(path.join(DRIFT_ROOT, 'od-next-strategy', 'assets', 'task-profiles', 'prototype.md')), '注入文本缺漂移树的 prototype 任务档路径')
    })

    await stepAsync(results, '漂移布局：doctor 画像报告漂移路径与实际版本（V1·V6）', async () => {
      const body = await runDoctor(page)
      assert(body.includes('清单路径：'), '缺清单路径行')
      assert(body.includes(path.join('upgraded', 'v2', 'od-next-strategy')), `清单路径应指向漂移位置：${body.slice(0, 400)}`)
      assert(body.includes('manifest 版本：3.4.0'), `manifest 版本应 3.4.0：${body.slice(0, 600)}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/** 场景 S7（主编排注册名「S7 V9+V1·RL7 resume 代际重组+检查环不变量」；代际重组半场承接 V1 设计包 impl-plan 验收项 A13（V1·RL7 = V1 红灯 resume 重组语义，非本轮 RL7 注入体积预算），检查环不变量半场为本轮 V9）：resume 代际重组。 */
async function scenarioResume() {
  const results = []
  const workspace = makeWorkspaceDir('v9')
  const home = path.join(RUN_ROOT, 'home-v9-resume')
  fs.cpSync(TEMPLATE_HOME, home, { recursive: true })
  fs.rmSync(path.join(home, 'sessions'), { recursive: true, force: true })
  fs.rmSync(path.join(home, 'storages'), { recursive: true, force: true })
  fs.mkdirSync(path.join(home, 'storages'), { recursive: true })
  const workspaceId = crypto.randomUUID()
  const workspaceReal = fs.realpathSync(workspace)
  const writeWorkspaceSeed = () => {
    fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [], pinnedSessionIds: [], defaultWorkspaceId: workspaceId },
      tables: { workspaces: { [workspaceId]: { path: workspaceReal, title: path.basename(workspace), sessionIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } },
    }, null, 2))
  }
  writeWorkspaceSeed()
  const patchFile = writeSessionLogPatch(home)
  const launch = (fixtureRoot) => startInstance({ label: 'v9-resume', home, fixtureRoot, patchFile, cwd: workspace })

  let gen1 = null
  let gen2 = null
  try {
    gen1 = await launch(GEN1_ROOT)
    await pickWorkspace(gen1.page, workspace)
    await pickDesignPreset(gen1.page)
    await sendUserMessage(gen1.page, 'start a poster design')
    const gen1Entry = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes(GEN1_SENTENCE)) || l.systemMessages.length > 0)
    assert(
      gen1Entry.log.systemMessages.some((t) => t.includes('resume gen1')),
      'gen1 注入文本应含 gen1 资产内容（fixture 正文标记）',
    )

    // V9 前半：gen1 会话内写 P0 产物 → 监听器回注（followup）。该产物落 report.jsonl
    // 身份行——resume 后新一代监听器据此把它豁免出启动快照（改写照常回注，D5④）。
    await stepAsync(results, 'V9 前半：gen1 会话写 P0 产物并获得回注（第一代检查环）', async () => {
      const workspaceReal = fs.realpathSync(workspace)
      await waitForReportLine(workspaceReal, (line) => line.type === 'watcher' && line.event === 'started')
      fs.writeFileSync(path.join(workspaceReal, 'poster.html'), dirtyArtifactHtml('Poster'))
      await waitForLintFeedbackCount(home, 1)
      const messages = collectLintFeedbackMessages(home)
      assert(messages[0].text.includes('poster.html'), `回注文本应指向产物相对路径：${JSON.stringify(messages[0].text.slice(0, 200))}`)
    })

    await gen1.close()
    gen1 = null

    // 资产换代（模拟 OD 升级）：同 home、资源根改指 gen2，重启实例
    writeWorkspaceSeed()
    gen2 = await launch(GEN2_ROOT)
    const gen2Page = gen2.page
    await pickWorkspace(gen2Page, workspace)

    await stepAsync(results, 'resume：侧栏会话行点击重开设计会话且 preset 重挂（V9）', async () => {
      // 侧栏列表顶部是 blank 占位行（'New session'），目标行按 gen1 会话日志的 id 精确点击
      const designEntry = collectSessionFiles(home)
        .map((f) => ({ ...f, log: readSessionLog(f.file) }))
        .find((f) => f.log.systemMessages.some((t) => t.includes('resume gen1')))
      assert(designEntry !== undefined, '找不到 gen1 设计会话日志')
      const row = gen2Page.locator(`.taiji-pb-row[data-session-id="${designEntry.sessionId}"]`)
      assert(await row.count() > 0, `侧栏缺 gen1 会话行（${designEntry.sessionId}）`)
      await row.click()
      await gen2Page.waitForTimeout(2500)
      await clearModalGates(gen2Page)
      // 会话头 preset 标签（AgentPresetLabel）随 roster 读回异步渲染，轮询等它出现；
      // 标签可能不在可视裁剪区内（innerText 不含），按 DOM textContent 判定（0.1.7 实测）
      const labelDeadline = Date.now() + 12000
      let labeled = false
      while (Date.now() < labelDeadline) {
        const has = await gen2Page.evaluate(() => document.documentElement.textContent.includes('OpenDesign 设计模式'))
        if (has) { labeled = true; break }
        await sleep(500)
      }
      assert(labeled, 'resume 后会话头/页面缺设计 preset 标识（preset 未重挂）')
    })

    await stepAsync(results, 'resume：新一轮 system 节点反映 gen2 资产、无 gen1 特征句残留（V1·RL7）', async () => {
      await sendUserMessage(gen2Page, 'continue the poster with a hero section')
      const entry = collectSessionFiles(home)
        .map((f) => ({ ...f, log: readSessionLog(f.file) }))
        .find((f) => f.log.systemMessages.length > 1 || f.log.systemMessages.some((t) => t.includes(GEN2_SENTENCE)))
      assert(entry !== undefined, '找不到 resume 后的会话日志')
      const newest = entry.log.systemMessages.at(-1) ?? ''
      assert(newest.includes(GEN2_SENTENCE), `新轮 system 节点应含 gen2 特征句：${JSON.stringify(newest.slice(0, 200))}`)
      assert(newest.includes('resume gen2'), '新轮 system 节点应含 gen2 资产正文标记')
      assert(!newest.includes(GEN1_SENTENCE), `新轮 system 节点残留 gen1 特征句（旧代际内容）`)
      assert(!newest.includes('resume gen1'), '新轮 system 节点残留 gen1 正文标记')
    })

    await stepAsync(results, 'resume：doctor 提示资产代际差异（V9 doctor 形态）', async () => {
      const body = await runDoctor(gen2Page)
      assert(body.includes('资产代际提示'), 'doctor 缺第⑥节代际提示标题')
      assert(body.includes('resume'), '代际提示未覆盖 resume 场景')
      assert(body.includes('v3.2.1'), `doctor 当前资产版本应为 gen2 的 3.2.1：${body.slice(0, 400)}`)
    })

    await stepAsync(results, 'V9：doctor ⑪ 读出 gen1 检查记录——fed-back 发现 + 产物身份记录可回查（RL9/D5④ 读侧）', async () => {
      const body = await runDoctor(gen2Page)
      assert(body.includes('监听器状态'), '⑪ 缺监听器状态行')
      assert(body.includes('[P0] purple-gradient — poster.html'), '⑪ 应呈现 gen1 产物的 P0 发现行')
      assert(body.includes('已回注送达会话'), '⑪ 发现行应带 fed-back 裁决中文说明')
      assert(body.includes('产物写盘身份记录：1 条'), '⑪ 产物写盘身份记录应可回查（D5④ 豁免集数据源）')
      assert(body.includes('poster.html'), '⑪ 身份记录应含 poster.html')
    })

    // V9 后半（resume 后监听器复活与第二代回注）依赖宿主 resume 重组发 agent-preset/selected
    // 事件——0.1.7 实测不发（registry select() 对有历史回合的会话 locked，resume 走投影状态
    // 重挂且幂等不写事件，亲读 packages/preset/agent-preset-registry/src/index.ts:368-377、
    // 构建产物 dsh-agent-preset-registry 0.1.7-rc.2 lib/index.js:756/:761 与会话日志实读核实；
    // 设计上游依赖 UD8 分版本登记）：gen2 进程无新 started 行、同内容重写零回注。自愈接线是
    // 设计外新机制，D4 采用栏明示不做（UD8 退场条件同口径）；本场景按双实态探测：复活则走
    // V9 完整断言（0.2.2 或后续宿主补线形态），未复活则按 0.1.7 预期实态显式断言（监听器
    // 不启动、改写零回注零新检查记录）+ 环境分界播报与补跑路径呈报。
    const resumeWatcherRevived = await (async () => {
      const workspaceReal = fs.realpathSync(workspace)
      fs.writeFileSync(path.join(workspaceReal, 'poster.html'), dirtyArtifactHtml('Poster'))
      const deadline = Date.now() + 12000
      while (Date.now() < deadline) {
        const starts = readQualityReport(workspaceReal).filter((l) => l.type === 'watcher' && l.event === 'started').length
        if (starts >= 2) return true
        await sleep(500)
      }
      return false
    })()

    if (resumeWatcherRevived) {
      await stepAsync(results, 'V9/SC4：resume 后同内容重写上一代产物——身份豁免照常回注一次（指纹进程内重启即清的幂等代价）', async () => {
        await waitForLintFeedbackCount(home, 2)
        const messages = collectLintFeedbackMessages(home)
        assert(messages.length === 2, `resume 后同内容首写应恰第二次回注（指纹重启即清 + 身份豁免照常回注）：${messages.length}`)
        assert(messages[1].text.includes('poster.html'), `第二次回注应仍指向 poster.html：${JSON.stringify(messages[1].text.slice(0, 200))}`)
      })

      await stepAsync(results, 'V9/SI2：第二代指纹去重——再次同内容重写不再回注（RL3 的 resume 形态）', async () => {
        const workspaceReal = fs.realpathSync(workspace)
        fs.writeFileSync(path.join(workspaceReal, 'poster.html'), dirtyArtifactHtml('Poster'))
        await waitForReportLine(workspaceReal, (line) => line.type === 'finding' && line.reason === 'duplicate')
        await sleep(2500)
        assert(collectLintFeedbackMessages(home).length === 2, '第二代同内容重写应被指纹去重，回注计数停在 2')
      })
    } else {
      // 0.1.7 预期实态显式断言（UD8/D4 分版本登记）：resume 后监听器不启动——探测循环写入
      // 的 poster.html 已过防抖窗口（≥12s ≫ 防抖 800ms），若监听器意外存活早应出现第二代
      // started 行与回注；此处把实态固化为断言，宿主行为偏离登记分界时在此红灯。
      await stepAsync(results, 'V9 后半（0.1.7 预期实态，UD8/D4）：resume 后监听器不启动——改写零回注、零新检查记录', async () => {
        const workspaceReal = fs.realpathSync(workspace)
        const report = readQualityReport(workspaceReal)
        const starts = report.filter((l) => l.type === 'watcher' && l.event === 'started').length
        assert(starts === 1, `0.1.7 resume 后不应有新一代监听器 started 行（预期恰 1 行=第一代）：${starts}`)
        const messages = collectLintFeedbackMessages(home)
        assert(messages.length === 1, `0.1.7 resume 后同内容改写不应触发回注（监听器未启动）：${messages.length}`)
        const findings = report.filter((l) => l.type === 'finding')
        assert(findings.length === 1, `0.1.7 resume 后不应有新 finding 行（仅 gen1 的 fed-back 一行）：${findings.length}`)
        const artifacts = report.filter((l) => l.type === 'artifact')
        assert(artifacts.length === 1, `0.1.7 resume 后不应有新产物身份行（仅 gen1 的 poster.html 一行）：${artifacts.length}`)
      })
      console.log('    [环境分界] 0.1.7 宿主 resume 重组不发 agent-preset/selected 事件（UD8/D4 已登记，registry select() 对已开局会话 locked）：监听器不启动为预期实态（已按显式断言固化）；V9/SC4+SI2 完整断言在事件发射形态宿主（0.2.2+）上补跑')
      results.push({ name: 'V9 后半（0.1.7 分版本实态断言）：监听器不启动 + 改写零回注零新记录（完整断言待事件发射宿主补跑）', ok: true })
    }
  } finally {
    if (gen1 !== null) await gen1.close()
    if (gen2 !== null) await gen2.close()
  }
  return results
}

/** 场景 S8（主编排注册名「S8 V1·V11 项目目录写入形态（5 管理名）」；A15/V11 = V1 设计包 impl-plan 验收项编号）：git fixture 连续三次设计会话（一次换资产）的写入形态。 */
async function scenarioProjectWrites() {
  const results = []
  const workspace = makeWorkspaceDir('v11', { git: true })
  const home = path.join(RUN_ROOT, 'home-v11-writes')
  fs.cpSync(TEMPLATE_HOME, home, { recursive: true })
  fs.rmSync(path.join(home, 'sessions'), { recursive: true, force: true })
  fs.rmSync(path.join(home, 'storages'), { recursive: true, force: true })
  fs.mkdirSync(path.join(home, 'storages'), { recursive: true })
  const workspaceId = crypto.randomUUID()
  const workspaceReal = fs.realpathSync(workspace)
  fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [], pinnedSessionIds: [], defaultWorkspaceId: workspaceId },
    tables: { workspaces: { [workspaceId]: { path: workspaceReal, title: path.basename(workspace), sessionIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } },
  }, null, 2))
  const patchFile = writeSessionLogPatch(home)
  const launch = (fixtureRoot) => startInstance({ label: 'v11-writes', home, fixtureRoot, patchFile, cwd: workspace })
  /** 在当前实例上再造一个设计会话并跑一轮（New session → 选工作区 → 选设计 → 发消息）。 */
  const runDesignSession = async (instance, message) => {
    await instance.page.getByRole('button', { name: 'New session' }).first().click()
    await instance.page.waitForTimeout(1000)
    await clearModalGates(instance.page)
    await pickWorkspace(instance.page, workspace)
    await pickDesignPreset(instance.page)
    await sendUserMessage(instance.page, message)
  }
  const gitStatus = () => spawnSync('git', ['status', '--porcelain'], { cwd: workspace, encoding: 'utf8' }).stdout.trim().split('\n').filter((l) => l !== '')

  let genA = null
  let genB = null
  try {
    genA = await launch(MINI_OD_ROOT)
    await runDesignSession(genA, 'session one: landing page')
    await runDesignSession(genA, 'session two: poster page')

    // 换资产（模拟 OD 升级）后第三次会话：旧产物以新壳重铺（V1 设计包 D8 显式接受的行为）
    await genA.close()
    genA = null
    genB = await launch(GEN2_ROOT)
    await runDesignSession(genB, 'session three: deck page')

    step(results, 'V11：新增文件恰为 .od-frames/ 五管理名（V1 设计包 D8 清单 4 复制件 + deck-framework.md 派生件）', () => {
      const framesDir = path.join(workspace, '.od-frames')
      assert(fs.existsSync(framesDir), '.od-frames/ 未落盘')
      const names = fs.readdirSync(framesDir)
      assert(
        MATERIALIZED_WRITE_LIST.every((name) => names.includes(name)) && names.length === MATERIALIZED_WRITE_LIST.length,
        `.od-frames/ 文件集合不对：${JSON.stringify(names)}（期望 ${JSON.stringify(MATERIALIZED_WRITE_LIST)}）`,
      )
    })

    step(results, 'V11：git status 无 tracked 变更、untracked 恰为 .od-frames/ 与 .od-quality/（反向断言 V1 设计包 D8 ④ + opendesign-assets-quality D4 记录目录）', () => {
      const lines = gitStatus()
      const tracked = lines.filter((l) => !l.startsWith('??'))
      assert(tracked.length === 0, `既有 tracked 文件被改写：${JSON.stringify(tracked)}`)
      const untracked = lines.filter((l) => l.startsWith('??'))
      assert(
        untracked.length === 2 && untracked.every((l) => l.includes('.od-frames/') || l.includes('.od-quality/')),
        `untracked 应恰为 .od-frames/ 与 .od-quality/（材质化根 + 质量环记录目录）：${JSON.stringify(untracked)}`,
      )
    })

    step(results, 'V11：幂等——重复会话不堆积；升级轮（gen2 不声明壳资源）旧副本原样保留、无清单外写入', () => {
      const framesDir = path.join(workspace, '.od-frames')
      // gen2 清单未声明设备壳资源（复制件重铺计划为空）：既有四复制件按 V1 设计包 D8 覆盖语义原样
      // 保留，deck-framework.md（派生登记件）无条件重铺——不堆积新文件、不被清除，
      // 重铺波及面不变量的升级轮形态。
      const names = fs.readdirSync(framesDir)
      assert(
        MATERIALIZED_WRITE_LIST.every((name) => names.includes(name)) && names.length === MATERIALIZED_WRITE_LIST.length,
        `.od-frames/ 文件集合在升级轮后不对：${JSON.stringify(names)}`,
      )
      const projectFiles = fs.readdirSync(workspace)
      assert(
        projectFiles.filter((name) => name !== '.git' && name !== '.od-frames' && name !== '.od-quality').length === 0,
        `项目目录出现清单外文件：${JSON.stringify(projectFiles)}（.od-quality/ 是质量环记录目录，D4 设计内写入）`,
      )
      // mini-od 轮写下的副本与其源逐字节一致（升级轮之前的覆盖语义已在 S1 断言，这里对账升级轮不清除）
      const prototypeDir = path.join(MINI_OD_SCENARIO, 'assets', 'task-profiles', 'prototype')
      for (const name of OD_FRAMES_FILES) {
        const source = path.join(prototypeDir, name === 'layout.css' ? name : path.join('device-frames', name))
        assert(fs.readFileSync(path.join(framesDir, name)).equals(fs.readFileSync(source)), `升级轮后副本应保持 mini-od 源内容（${name}）`)
      }
      assert(
        fs.readFileSync(path.join(framesDir, DECK_FRAMEWORK_FILE_NAME), 'utf8') === DECK_FILE_EXPECTED,
        '升级轮后 deck-framework.md 应保持派生登记文本（无条件重铺语义）',
      )
    })
  } finally {
    if (genA !== null) await genA.close()
    if (genB !== null) await genB.close()
  }
  return results
}

// ── 评论回路场景（opendesign-comment-loop 设计 §4.1；无凭据环境可验判据子集）──

/**
 * 场景 S10（comment-loop·V1 + comment-anchor·V1 拾取桥全路径，RL1）：评论回路首评真机全链。
 *
 * 判据（两设计 §4.1 V1 criteria 的无凭据可验子集）：面板进评论模式 → frameLocator 悬停
 * 出高亮框与元素标签（GL1 交互形态）→ 点击选中弹出输入框且锚点行呈 id 级（D6）→ 发送
 * 后线程落盘 open × delivered 带 anchor:{level:'id', sel:'#main-title'}（D1 id 级载体）；
 * 聊天流出现 source.kind = opendesign-design-mode/comment 的回注消息，围栏 JSON 含同一
 * anchor 与保留锚点指令句（D7，文本与 buildCommentMessage 构造逐字一致）；产物内编号
 * 徽章在位（anchors 下发集渲染，D8(a)）；侧栏条目锚点行（级别名 + sel 原样）；doctor
 * 第⑫节评论环缺席/在场两形态；回合结束后回注消息仍在事件流。整条链路无面板直发输入
 * 组件参与（D3 入口唯一化）。「agent 实际读产物源码改写写盘」段需凭据环境真模型，归
 * D3 真机验收承接（套件头 L4 口径）。设计步骤①「设计会话产出产物」以 seed 产物 +
 * 设计会话判定与材质化标记在盘承载。
 */
async function scenarioCommentLoopV1() {
  const results = []
  const workspace = makeWorkspaceDir('cl-v1')
  const { instance, page, home, workspace: ws } = await bootDesignSessionWithArtifact({ label: 'cl-v1', workspace, artifact: PICK_ARTIFACT_NAME })
  const frame = page.frameLocator('iframe.odp-frame')
  try {
    await stepAsync(results, 'comment-loop·V1：doctor 第⑫节缺席常态——评论文件不存在/计数 0/路由族 5 条声明形态（首次评论前正常态）', async () => {
      const body = await runDoctor(page)
      expectDoctorSections(body)
      assert(body.includes('【12/12】评论环'), '缺第⑫节评论环')
      assert(body.includes('评论文件：不存在'), '⑫ 缺席常态应报评论文件不存在（不伪装损坏也不自动建）')
      assert(body.includes('线程计数：0'), '⑫ 缺席常态线程计数应为 0')
      assert(body.includes(`路由族契约共 ${COMMENTS_API_PATHS.length} 条`), `⑫ 路由族声明应为 ${COMMENTS_API_PATHS.length} 条`)
      assert(body.includes('注册状态：声明形态'), '⑫ 注册状态应如实标注声明形态（不冒充运行时核验）')
    })

    await stepAsync(results, 'comment-anchor·V1 步骤①②：评论模式开启 + 悬停高亮——overlay 层高亮框与元素标签在位（GL1 交互形态）', async () => {
      await openCommentsSidebar(page)
      const toggle = page.locator('.odp-comments-panel button[aria-label="Comment mode"]')
      await toggle.waitFor({ state: 'visible', timeout: 15000 })
      await page.waitForFunction(
        () => {
          const button = document.querySelector('.odp-comments-panel button[aria-label="Comment mode"]')
          return button !== null && !button.disabled
        },
        undefined,
        { timeout: 20000 },
      )
      await toggle.click()
      await frame.locator('#main-title').hover()
      await frame.locator('.od-pick-box').waitFor({ state: 'visible', timeout: 5000 })
      const label = await frame.locator('.od-pick-label').textContent()
      assert(label !== null && label.includes('h1#main-title'), `悬停元素标签应为 tag#id 形态：${JSON.stringify(label)}`)
    })

    await stepAsync(results, 'comment-anchor·V1 步骤③：点击选中——评论输入框弹出且锚点行呈 id 级（D6 锚点预览）', async () => {
      await frame.locator('#main-title').click()
      const panel = frame.locator('.od-pick-panel')
      await panel.waitFor({ state: 'visible', timeout: 5000 })
      const preview = await panel.locator('.od-pick-anchor').textContent()
      assert(preview?.trim() === 'id · #main-title', `输入框锚点行应为「level · sel」id 级：${JSON.stringify(preview)}`)
    })

    await stepAsync(results, 'comment-anchor·V1 步骤④：输入发送——面板线程徽标随投递结果显示 Sent（整链无直发输入组件参与）', async () => {
      const panel = frame.locator('.od-pick-panel')
      await panel.locator('textarea').fill('主视觉配色太艳，压暗一档')
      await panel.locator('button.od-pick-primary').click()
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('.odp-thread .odp-badge')).some((el) => el.textContent?.trim() === 'Sent'),
        undefined,
        { timeout: 20000 },
      )
      // 成功回执（D6）：输入框随 submit-result ok 关闭
      await panel.waitFor({ state: 'detached', timeout: 5000 })
      const directComposer = await page.evaluate(() => ({
        textarea: document.querySelectorAll('.odp-comments-panel textarea.odp-comment-input').length,
        composer: document.querySelectorAll('.odp-comments-composer').length,
      }))
      assert(directComposer.textarea === 0 && directComposer.composer === 0, `面板不应存在直发输入组件（D3 入口唯一化）：${JSON.stringify(directComposer)}`)
    })

    await stepAsync(results, 'comment-loop·V1：线程落盘 open × delivered 带 id 级 anchor——c_ 前缀 id / artifactPath 挂靠 / deliveredAt 在场（D1）', async () => {
      const threads = await waitForCommentThreads(ws, (list) => list.length >= 1)
      assert(threads.length === 1, `首评应恰 1 线程：${JSON.stringify(threads.map((t) => t.id))}`)
      const thread = threads[0]
      assert(thread.id.startsWith(COMMENT_THREAD_ID_PREFIX), `线程 id 应带 ${COMMENT_THREAD_ID_PREFIX} 前缀：${thread.id}`)
      assert(thread.artifactPath === PICK_ARTIFACT_NAME, `评论应挂靠当前预览产物：${thread.artifactPath}`)
      assert(thread.text === '主视觉配色太艳，压暗一档', `落盘评论文本不对：${JSON.stringify(thread.text)}`)
      assert(
        thread.anchor !== undefined && thread.anchor.level === 'id' && thread.anchor.sel === '#main-title',
        `首评应带 id 级锚点（拾取载体 #main-title）：${JSON.stringify(thread.anchor)}`,
      )
      assert(
        thread.status === 'open' && thread.delivery === 'delivered',
        `落盘状态机组合态应为 open × delivered：${JSON.stringify({ status: thread.status, delivery: thread.delivery })}`,
      )
      assert(typeof thread.deliveredAt === 'string' && thread.deliveredAt !== '', 'delivered 线程应有 deliveredAt（不变量：deliveredAt 存在 ⇔ delivery === delivered）')
      assert(Array.isArray(thread.replies) && thread.replies.length === 0, '首评线程 replies 应为空数组')
    })

    await stepAsync(results, 'comment-anchor·V1 步骤⑤a：产物内编号徽章在位 + 侧栏条目锚点行（D8(a) anchors 下发渲染 / D1 呈现）', async () => {
      const badge = frame.locator('.od-pick-badge')
      await badge.waitFor({ state: 'visible', timeout: 10000 })
      assert((await badge.textContent())?.trim() === '1', `首线程徽章序号应为 1：${JSON.stringify(await badge.textContent())}`)
      const anchorLine = page.locator('.odp-thread .odp-thread-anchor')
      await anchorLine.waitFor({ state: 'visible', timeout: 10000 })
      const levelText = await anchorLine.locator('.odp-thread-anchor-level').textContent()
      const selText = await anchorLine.locator('.odp-thread-anchor-sel').textContent()
      assert(levelText?.trim() === 'Element id', `锚点行级别名应为 en 字典 'Element id'：${JSON.stringify(levelText)}`)
      assert(selText?.trim() === '#main-title', `锚点行 sel 应原样直呈：${JSON.stringify(selText)}`)
    })

    await stepAsync(results, 'comment-loop·V1 步骤③：聊天流回注消息 kind 可辨——独立 kind + 文本与 buildCommentMessage 逐字一致 + 围栏 JSON 含同一 anchor（AX2/D6/D7）', async () => {
      await waitForCommentFeedbackCount(home, 1)
      const messages = collectCommentFeedbackMessages(home)
      assert(messages.length === 1, `评论回注消息应恰 1 条：${messages.length}`)
      const thread = readCommentThreads(ws)[0]
      // assertCommentMessageText 以带 anchor 的 buildCommentMessage 构造逐字对账——围栏 JSON
      // 含同一 anchor（D7）由该逐字等价保证；此处再锚定保留锚点指令句在文（可读性标记）。
      assertCommentMessageText(messages[0], thread, thread.text)
      assert(messages[0].text.includes('保留既有元素的 id 与 data-od-id / data-screen-label 锚属性值'), '回注文本缺保留锚点指令句（D7）')
    })

    await stepAsync(results, 'comment-loop·V1 末条（通用在轨断言）：回合结束后回注消息仍在会话事件流（未被 discard）', async () => {
      await sleep(2500) // 回合结束（无凭据环境 MISSING_CREDENTIAL 失败收场）与日志 batch flush 余量
      const messages = collectCommentFeedbackMessages(home)
      assert(messages.length === 1, `回合结束后回注消息应仍在事件流（未被 discard）：${messages.length}`)
    })

    await stepAsync(results, 'comment-loop·V1：doctor 第⑫节在场形态——线程计数 1 / delivered 分布 / parse 健康度正常', async () => {
      const body = await runDoctor(page)
      const threads = readCommentThreads(ws)
      assert(body.includes('【12/12】评论环'), '缺第⑫节评论环')
      assert(body.includes('评论文件：存在'), '⑫ 在场形态应报评论文件存在')
      assert(body.includes(commentDistributionLine(threads)), `⑫ 计数/分布行不对：期望「${commentDistributionLine(threads)}」`)
      assert(body.includes('parse 健康度：正常'), '⑫ 应报 parse 健康（与读侧 GET 共用同一判定点）')
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 S11（comment-loop·V3）：无活 Agent 边界与重开会话后的正常投递（D3 实测形态）。
 *
 * 无活 Agent 的真机可达性（D3 演练实测）：宿主重启后未重开会话时 `sessions.get` 不可解析
 * → 写通道 404 session-unknown fail-closed（连落盘都拒绝，与 U2 的未知会话语义一致，绝不
 * 回退部署级目录）；重开会话后 session 可解析、agent 可用 → 正常 delivered。
 * 故 no-agent 投递态与「Retry delivery」徽标在本宿主实现上不可经 e2e 造出——由 L1 覆盖：
 * U2 serve 路由的 agents 缺席 mock（no-agent 落盘 + 409 重试语义）、U3 feedback 的
 * no-agent 分支与回写、U4 徽标四值与重试真值表单测。
 * 本场景保留可证伪的边界断言：重启未开 → 404 + 零落盘；重开后 → 200 + 状态如实 + 不重复。
 */
async function scenarioCommentNoAgent() {
  const results = []
  const workspace = makeWorkspaceDir('cl-v3')
  seedProbeArtifact(workspace)
  const home = path.join(RUN_ROOT, 'home-cl-v3')
  fs.cpSync(TEMPLATE_HOME, home, { recursive: true })
  fs.rmSync(path.join(home, 'sessions'), { recursive: true, force: true })
  fs.rmSync(path.join(home, 'storages'), { recursive: true, force: true })
  fs.mkdirSync(path.join(home, 'storages'), { recursive: true })
  const workspaceId = crypto.randomUUID()
  const workspaceReal = fs.realpathSync(workspace)
  const writeWorkspaceSeed = () => {
    fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [], pinnedSessionIds: [], defaultWorkspaceId: workspaceId },
      tables: { workspaces: { [workspaceId]: { path: workspaceReal, title: path.basename(workspace), sessionIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } },
    }, null, 2))
  }
  writeWorkspaceSeed()
  const patchFile = writeSessionLogPatch(home)
  const launch = () => startInstance({ label: 'cl-v3', home, fixtureRoot: MINI_OD_ROOT, patchFile, cwd: workspace })

  let first = null
  let second = null
  try {
    first = await launch()
    await pickWorkspace(first.page, workspace)
    await pickDesignPreset(first.page)
    await sendUserMessage(first.page, 'design a page whose agent will be gone')
    const sessionId = findSessionIdBySystemMark(home, DESIGN_INJECTION_MARK)
    await first.close()
    first = null

    // 重启宿主（同 home），停在 hero 不进入会话：sessions.get 对该会话不可解析。
    writeWorkspaceSeed()
    second = await launch()

    await stepAsync(results, 'comment-loop·V3 边界①：重启未重开会话——写通道 404 session-unknown fail-closed 且零落盘', async () => {
      const outcome = await pageFetch(second.page, COMMENTS_API_BASE_PATH + '.create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, artifactPath: 'index.html', text: '无活 Agent 探针评论' }),
      })
      assert(outcome.status === 404, `未重开会话的写通道应 404 fail-closed：${JSON.stringify({ status: outcome.status, body: outcome.body })}`)
      assert(outcome.body?.code === 'session-unknown', `404 错误码应为 session-unknown：${JSON.stringify(outcome.body)}`)
      assert(
        !fs.existsSync(path.join(workspaceReal, COMMENTS_DIR_NAME, COMMENTS_FILE_NAME)),
        '未解析会话的写通道不得产生落盘副作用（评论文件不应出现）',
      )
    })

    await stepAsync(results, 'comment-loop·V3 边界②：重开会话后评论——200 + 落盘 + 投递态如实（delivered 或 no-agent 实测登记）', async () => {
      const row = second.page.locator(`.taiji-pb-row[data-session-id="${sessionId}"]`)
      assert(await row.count() > 0, `侧栏缺目标会话行（${sessionId}）`)
      await row.click()
      await second.page.waitForTimeout(2500)
      await clearModalGates(second.page)
      const outcome = await pageFetch(second.page, COMMENTS_API_BASE_PATH + '.create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, artifactPath: 'index.html', text: '无活 Agent 探针评论' }),
      })
      assert(outcome.status === 200, `重开会话后 POST .create 应 200：${JSON.stringify({ status: outcome.status, body: outcome.body })}`)
      console.log(`    [S11 实测] 重开会话后的投递态 = ${JSON.stringify(outcome.body?.delivery)}（宿主实现实态，写 runlog 登记）`)
      assert(
        ['delivered', 'no-agent'].includes(outcome.body?.delivery),
        `投递态应为 delivered 或 no-agent（如实落状态）：${JSON.stringify(outcome.body)}`,
      )
      const threads = await waitForCommentThreads(workspace, (list) => list.length >= 1)
      assert(threads.length === 1, `应恰 1 条线程（不重复）：${JSON.stringify(threads.map((t) => t.id))}`)
      assert(threads[0].status === 'open', `线程 lifecycle 应 open：${threads[0].status}`)
      assert(threads[0].text === '无活 Agent 探针评论', `落盘文本不应重复写：${JSON.stringify(threads[0].text)}`)
    })

    await stepAsync(results, 'comment-loop·V3 边界③：面板如实显示投递态徽标（delivered=Sent / no-agent 带重试钮），none 不静默', async () => {
      await openDesignPanel(second.page)
      await second.page.waitForFunction(
        () => Array.from(document.querySelectorAll('.odp-row .odp-row-name')).some((el) => el.textContent?.trim() === 'index.html'),
        undefined,
        { timeout: 15000 },
      )
      await second.page.locator('.odp-row', { hasText: 'index.html' }).first().click()
      await second.page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
      await openCommentsSidebar(second.page)
      const threads = readCommentThreads(workspace)
      const expectedBadge = threads[0].delivery === 'no-agent' ? 'Not delivered - no active agent' : 'Sent'
      await second.page.waitForFunction(
        (badge) => Array.from(document.querySelectorAll('.odp-thread .odp-badge')).some((el) => el.textContent?.trim() === badge),
        expectedBadge,
        { timeout: 15000 },
      )
      if (threads[0].delivery === 'no-agent') {
        assert(await second.page.locator('.odp-thread button.odp-button', { hasText: 'Retry delivery' }).isVisible(), 'no-agent 线程应显示重试投递按钮')
      }
    })
  } finally {
    if (first !== null) await first.close()
    if (second !== null) await second.close()
  }
  return results
}

/**
 * 场景 S12（comment-loop·V5）：普通（非 OpenDesign）会话的面板行为。
 *
 * 判据（设计 §4.1 V5 criteria）：普通会话产物仍按现状预览（FF6 现状——产物行点击经弹回
 * 通道交回通用文件预览，设计面板认领退出）；无 .od-frames 标记文件的会话评论侧栏不出现
 * （UI 出现条件 = 设计会话判定，与面板现状同源）；路由层不判定会话类型（普通会话调用
 * 仅受鉴权与落点约束——写通道往返照常）。preset 声明清单与 standard 基线零变化归根包
 * check-manifest 既有断言（§4.3 独立需跑项，不在本套件）。
 */
async function scenarioStandardSessionNoComments() {
  const results = []
  const workspace = makeWorkspaceDir('cl-v5')
  const instance = await withInstance({ label: 'cl-v5', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  const workspaceReal = fs.realpathSync(workspace)
  try {
    const { page, home } = instance
    await pickWorkspace(page, workspace)
    await sendUserMessage(page, 'plain session with one html artifact')
    const entry = await waitForSessionLog(home, (_e, l) => l.systemMessages.length > 0)
    const sessionId = path.basename(path.dirname(entry.file))
    fs.writeFileSync(path.join(workspaceReal, 'legacy.html'), '<!doctype html><html lang="en"><body><h1>plain session page</h1></body></html>')

    await stepAsync(results, 'comment-loop·V5：普通会话产物行点击——评论侧栏全页零出现（列表/iframe 两形态均零，FF6 现状不变）', async () => {
      await openDesignPanel(page)
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('.odp-row')).some((el) => el.textContent?.trim() === 'legacy.html'),
        undefined,
        { timeout: 15000 },
      )
      await page.locator('.odp-row').first().click()
      // 行点击进入面板 iframe（guide 列表兜底模式的既有行为，V1 现状不变）；非设计会话
      // designSession 探测为 false → 评论元素挂载条件不成立。地址模式的弹回通道
      // （present 卡片点击 → probeDesignSession false → replaceTab）需聊天流卡片承载，
      // 无凭据环境不可造，由 L1 present-card-link.test.ts 断言覆盖（U4 交付登记）。
      await page.waitForTimeout(1200)
      const counts = await page.evaluate(() => ({
        tab: document.querySelectorAll('.odp-comments-tab').length,
        panel: document.querySelectorAll('.odp-comments-panel').length,
      }))
      assert(counts.tab === 0 && counts.panel === 0, `非设计会话不应出现评论侧栏（折叠条/展开面板均零）：${JSON.stringify(counts)}`)
    })

    await stepAsync(results, 'comment-loop·V5：路由层不判定会话类型——普通会话写通道往返照常（POST .create 200 + 落盘 + GET 基路径可读）', async () => {
      const outcome = await pageFetch(page, COMMENTS_API_BASE_PATH + '.create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, artifactPath: 'legacy.html', text: '普通会话路由不判型探针' }),
      })
      assert(outcome.status === 200, `普通会话 POST .create 应照常受理（仅受鉴权与落点约束）：${JSON.stringify({ status: outcome.status, body: outcome.body })}`)
      assert(outcome.body?.delivery === 'delivered', `普通会话评论投递应照常 delivered（空闲 agent → followup）：${JSON.stringify(outcome.body)}`)
      const threads = await waitForCommentThreads(workspaceReal, (list) => list.length >= 1)
      assert(threads.length === 1 && threads[0].artifactPath === 'legacy.html', `落盘线程挂靠不对：${JSON.stringify(threads.map((t) => t.artifactPath))}`)
      const list = await pageFetch(page, `${COMMENTS_API_BASE_PATH}?sessionId=${encodeURIComponent(sessionId)}`)
      assert(
        list.status === 200 && Array.isArray(list.body?.threads) && list.body.threads.length === 1,
        `GET 基路径应返回线程清单：${JSON.stringify({ status: list.status, threads: list.body?.threads?.length })}`,
      )
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 S13（comment-loop·V6）：resolve → reply 重开循环 + 产物重写/删除边界（首评经拾取入口）。
 *
 * 判据（设计 §4.1 V6 criteria）：首线程经 resolved → open 重开、追加评论在 replies 数组、
 * 旧内容未重投（回注消息恰 2 条且第二条载荷 text = 末条追加且带线程首评 anchor——D7 追加
 * 回注载荷恒带首评锚点）；旧评论不因产物重写消失或错挂（artifactPath 关联，重写同路径
 * 不失效——「agent 改写产物」以同路径文件重写站在关联不变量的断言位，模型改稿段归 D3
 * 真机）；产物被删除的边界：线程保留列出（历史不删），预览行为与面板现状一致（伺服路由
 * 404）。
 */
async function scenarioCommentResolveReply() {
  const results = []
  const workspace = makeWorkspaceDir('cl-v6')
  const { instance, page, home, workspace: ws, sessionId } = await bootDesignSessionWithArtifact({ label: 'cl-v6', workspace, artifact: PICK_ARTIFACT_NAME })
  const workspaceReal = fs.realpathSync(ws)
  try {
    // 前置：拾取入口首评 delivered（与 S10 同形态；判据已在 S10 全量断言，此处只置态）
    await sendCommentViaPick(page, '#main-title', '首条评论：主视觉配色压暗一档')
    const seeded = await waitForCommentThreads(ws, (list) => list.length >= 1 && list[0].delivery === 'delivered')
    const threadId = seeded[0].id

    await stepAsync(results, 'comment-loop·V6 步骤①：标记已解决——resolved × delivered 保留（resolve 不触发投递，Resolved 标记在位）', async () => {
      await page.locator('.odp-thread button.odp-button', { hasText: 'Mark resolved' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.odp-resolved-mark').length > 0, undefined, { timeout: 15000 })
      const current = readCommentThreads(ws)[0]
      assert(current.id === threadId && current.status === 'resolved', `resolve 后 lifecycle 应为 resolved：${JSON.stringify(current.status)}`)
      assert(current.delivery === 'delivered', `resolve 不触发投递、delivery 原样保留（D5 转移③）：${current.delivery}`)
    })

    await stepAsync(results, 'comment-loop·V6 步骤②：对已解决线程追加评论——自动回 open 且新投递周期 delivered（replies 追加、旧内容不重投、载荷 text = 末条追加 + 首评 anchor）', async () => {
      await page.locator('.odp-reply-composer input.odp-reply-input').fill('标题字号太大')
      await page.locator('.odp-reply-composer button.odp-button').click()
      // 等待追加评论回显（.odp-reply 列表元素）——resolved 线程 resolve 后保留 delivered 徽标
      // 「Sent」，以徽标为等待条件会被既有状态即时满足，读到写入前的旧状态（实测假红）。
      await page.waitForFunction(
        () => document.querySelectorAll('.odp-reply').length > 0,
        undefined,
        { timeout: 20000 },
      )
      const current = readCommentThreads(ws)[0]
      assert(current.status === 'open', `追加后线程应自动回 open（D5 转移④）：${current.status}`)
      assert(current.replies.length === 1 && current.replies[0].text === '标题字号太大', `追加评论应在 replies 数组：${JSON.stringify(current.replies)}`)
      assert(current.delivery === 'delivered' && typeof current.deliveredAt === 'string', '追加后的新投递周期应 delivered（徽标 Sent 同证）')
      await waitForCommentFeedbackCount(home, 2)
      const messages = collectCommentFeedbackMessages(home)
      assert(messages.length === 2, `追加投递应恰第二条回注消息（旧内容未重投）：${messages.length}`)
      assertCommentMessageText(messages[0], current, current.text)
      assertCommentMessageText(messages[1], current, '标题字号太大')
    })

    await stepAsync(results, 'comment-loop·V6 步骤③：产物同路径重写——旧评论不消失不错挂（artifactPath 文件级关联，D8）', async () => {
      // 「agent 改写该产物写盘」的文件级站立：同路径重写当前预览产物（模型改稿行为段归 D3 真机）
      fs.writeFileSync(path.join(workspaceReal, PICK_ARTIFACT_NAME), '<!doctype html><html lang="en"><body><h1>rewritten artifact stand-in</h1></body></html>')
      const list = await pageFetch(page, `${COMMENTS_API_BASE_PATH}?sessionId=${encodeURIComponent(sessionId)}`)
      assert(list.status === 200 && list.body?.threads?.length === 1, `产物重写后线程应保留：${JSON.stringify(list.body)}`)
      assert(
        list.body.threads[0].artifactPath === PICK_ARTIFACT_NAME && list.body.threads[0].replies.length === 1,
        '重写同路径不失效、不错挂（文件级关联）',
      )
      const artifact = await pageFetch(page, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/${sessionId}/${PICK_ARTIFACT_NAME}`)
      assert(artifact.status === 200 && artifact.text.includes('rewritten artifact stand-in'), `重写后产物应按新内容伺服（200）：${artifact.status}`)
    })

    await stepAsync(results, 'comment-loop·V6 步骤④（删除边界）：产物删除后线程保留列出（历史不删），伺服路由 404（预览行为与面板现状一致）', async () => {
      fs.rmSync(path.join(workspaceReal, PICK_ARTIFACT_NAME))
      const list = await pageFetch(page, `${COMMENTS_API_BASE_PATH}?sessionId=${encodeURIComponent(sessionId)}`)
      assert(list.status === 200 && list.body?.threads?.length === 1, `产物删除后线程应保留列出（D1 无删除路由，历史不删）：${JSON.stringify(list.body)}`)
      const gone = await pageFetch(page, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/${sessionId}/${PICK_ARTIFACT_NAME}`)
      assert(gone.status === 404, `产物删除后伺服路由应 404（预览行为与面板现状一致）：${gone.status}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 S14（comment-loop·V10，AS9 探针载体）：steer 前置下评论投递。
 *
 * 步骤（设计 §4.1 V10）：① 长任务消息先置运行态 → ② 运行中经侧栏发评论 → ③ delivery
 * 回写 delivered + 徽标 Sent → ⑤ 检查会话事件流。通道判据 = 评论投递后 turn/start 事件
 * 计数是否 +1（宿主 turnBoundary 投影事件，dsh-agent-loop lib/index.js 亲读核实：followup
 * = send(input, 'next-turn') 开新轮、steer = send(input, 'next-step') 注入当前轮）。
 * steer 形态全量断言（无新轮 + 回合结束后消息仍在事件流——AS9 未被 discard）；followup
 * 形态按设计 §4.1 V10 criteria 协议登记探针不适用（防通道分流致断言假红、或弱化为对
 * followup 恒真的永绿断言），凭据环境长任务重造后补跑。
 */
async function scenarioCommentSteer() {
  const results = []
  const workspace = makeWorkspaceDir('cl-v10')
  const { instance, page, home, workspace: ws } = await bootDesignSessionWithArtifact({ label: 'cl-v10', workspace, artifact: PICK_ARTIFACT_NAME })
  try {
    // 步骤①：长任务消息 Send 即发（不等回合失败——给 steer 留运行窗口），等该轮 turn/start 提交
    const composer = page.locator('[contenteditable="true"]').first()
    await composer.click()
    await page.keyboard.type('把三个页面都按新规范重做')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Send message' }).click()
    const baselineDeadline = Date.now() + 30000
    while (totalTurnStartCount(home) < 2 && Date.now() < baselineDeadline) await sleep(500)
    assert(totalTurnStartCount(home) >= 2, `长任务轮应已开启（turn/start 计数 ≥ 2）：${totalTurnStartCount(home)}`)
    const baselineTurnStarts = totalTurnStartCount(home)

    await stepAsync(results, 'comment-loop·V10 步骤②③：agent 运行中经拾取入口发评论——thread.delivery 回写 delivered + 徽标「Sent」', async () => {
      await sendCommentViaPick(page, '#main-title', '主视觉配色太艳，压暗一档')
      const threads = await waitForCommentThreads(ws, (list) => list.length >= 1 && list[0].delivery === 'delivered')
      assert(threads[0].artifactPath === PICK_ARTIFACT_NAME, `评论挂靠不对：${threads[0].artifactPath}`)
    })

    await stepAsync(results, 'comment-loop·V10 步骤⑤：回注消息 kind 可辨 + 载荷正确（AX2 独立 kind / D6 围栏 JSON）', async () => {
      await waitForCommentFeedbackCount(home, 1)
      const messages = collectCommentFeedbackMessages(home)
      assert(messages.length === 1, `评论回注消息应恰 1 条：${messages.length}`)
      assertCommentMessageText(messages[0], readCommentThreads(ws)[0], '主视觉配色太艳，压暗一档')
    })

    // 通道判定：等 followup 形态显形（新轮 turn/start）或 15s 预算耗尽（steer 形态——
    // 评论注入当前轮不开新轮；凭据环境长任务仍在运行时亦落此分支）
    let followupForm = false
    const channelDeadline = Date.now() + 15000
    while (Date.now() < channelDeadline) {
      if (totalTurnStartCount(home) > baselineTurnStarts) { followupForm = true; break }
      await sleep(500)
    }

    if (followupForm) {
      await stepAsync(results, 'comment-loop·V10 探针登记（设计 §4.1 V10 协议）：本轮 followup 通道（评论投递开新轮，turn/start +1）——steer 形态断言不在本轮计数，凭据环境长任务重造后补跑', async () => {
        await sleep(2500) // 回合结束与日志 flush 余量
        const messages = collectCommentFeedbackMessages(home)
        const current = readCommentThreads(ws)[0]
        assert(totalTurnStartCount(home) === baselineTurnStarts + 1, `followup 形态应恰开一个新轮（turn/start ${baselineTurnStarts} → +1）：${totalTurnStartCount(home)}`)
        assert(messages.length === 1, `followup 通道回注消息应仍在事件流（未被 discard）：${messages.length}`)
        assert(current.delivery === 'delivered', `followup 通道 delivery 应回写 delivered：${current.delivery}`)
        console.log('    [环境分界] comment-loop·V10：本轮评论走 followup 通道（agent 轮次先于评论结束——无凭据环境回合秒败的确定性形态）。设计 §4.1 V10 判据：该轮不适用 steer 探针、需重造 steer 场景后再断言（防通道分流致断言假红、或断言被弱化为对 followup 恒真的永绿断言）；steer 形态需凭据环境长任务，D3 真机验收承接')
      })
    } else {
      await stepAsync(results, 'comment-loop·V10 步骤③⑤ steer 形态全量断言：评论注入当前轮（无新轮 turn/start）+ 回合结束后消息仍在事件流（AS9 未被 discard）', async () => {
        assert(totalTurnStartCount(home) === baselineTurnStarts, `steer 形态不应开启新轮（turn/start 计数应保持 ${baselineTurnStarts}）：${totalTurnStartCount(home)}`)
        const messages = collectCommentFeedbackMessages(home)
        assert(messages.length === 1, `steered 消息在回合结束后应仍在事件流（AS9）：${messages.length}`)
      })
    }
  } finally {
    await instance.close()
  }
  return results
}

// ── shell 包共存回归（V1·A9/A10/A11；设计 §4.3 e2e 影响面第一行）───────────────

/** verify runner 子进程（--json：stdout 尾部 JSON 行 = 聚合 verdict；日志走 stderr）。 */
function runVerifyRunner(args) {
  const proc = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts', 'verify', 'run.mjs'),
    ...args, '--json',
  ], {
    encoding: 'utf8',
    timeout: 420000,
    maxBuffer: 32 * 1024 * 1024,
    // opendesign preset 探测 fixture 化：runner 起的实例同样落在 mini-od 资产根上（共存态确定性，不依赖真机 OD）。
    env: { ...process.env, OD_RESOURCE_ROOT: MINI_OD_ROOT },
  })
  let verdict = null
  for (const line of (proc.stdout ?? '').split('\n').reverse()) {
    const trimmed = line.trim()
    if (trimmed.startsWith('{')) {
      try { verdict = JSON.parse(trimmed); break } catch { /* 尾行非 JSON（日志混入）时继续向前找 */ }
    }
  }
  return { status: proc.status, verdict, output: `${proc.stdout ?? ''}\n${proc.stderr ?? ''}` }
}

/**
 * 场景 S9（主编排注册名「S9 V1·A9/A10/A11 shell 包共存回归（runner 串接）」；A9/A10/A11 = V1 设计包 impl-plan 验收项：shell 包 brand/projects/
 * lifecycle 三场景）：shell 包既有断言场景在两包共存 profile 上的回归。
 *
 * 共存前提即命题：brand/projects/lifecycle 三场景的验收目的 =「新插件安装进同一 profile 后
 * preset 注册与 UI 注入不干扰 shell 包」——只在 opendesign 在场时才可证明（verify runner
 * 自启形态只装 shell 单包，单装态结果不能登记为通过）。登记锚 = 本轮 impl-plan U7 验收④
 * 与设计 §4.3 web 行（承 V1 设计包 impl-plan U8「shell 包 reuse 三场景不回归」）。串接形态：
 *  - brand+projects：runner --url 连本套件的两包共存实例（runner 不装包不启实例）；
 *  - lifecycle：runner 自启形态对克隆的共存 home（runner 幂等重 add shell——实测幂等；
 *    opendesign 保持在场）。lifecycle 的固有 degrade（禁用回落无 CLI 通道）按 runner 登记
 *    接受，断言 failed=0 硬性。
 */
async function scenarioShellCoexistRegression() {
  const results = []
  const workspace = makeWorkspaceDir('shell-coexist')
  const artifactsDir = path.join(RUN_ROOT, 'verify-shell-regression')
  fs.mkdirSync(artifactsDir, { recursive: true })

  await stepAsync(results, 'V1·A9/A10：runner --url 连共存实例，brand+projects 回归', async () => {
    const instance = await withInstance({ label: 'shell-coexist', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
    try {
      const { page, home } = instance
      // projects 场景的「当前会话行标记」前置 = 已有会话（缺前置显式 degrade，不假 pass）——先建 standard 会话。
      await pickWorkspace(page, workspace)
      await sendUserMessage(page, 'plain session for shell coexistence regression')
      await waitForSessionLog(home, (_entry, l) => l.systemMessages.length > 0)
      const outcome = runVerifyRunner([
        '--url', instance.url, '--scenarios', 'brand,projects',
        '--artifacts-dir', artifactsDir, '--run-id', `shell-web-${Date.now()}`,
      ])
      assert(outcome.status === 0, `runner 退出码 ${outcome.status}（预期 0）。输出尾部：${outcome.output.slice(-1500)}`)
      assert(outcome.verdict !== null, 'runner verdict JSON 解析失败')
      for (const id of ['brand', 'projects']) {
        const entry = outcome.verdict.scenarios.find((s) => s.id === id)
        assert(entry !== undefined, `runner 结果缺 ${id} 场景：${JSON.stringify(outcome.verdict.scenarios)}`)
        assert(entry.verdict === 'pass', `${id} 场景 verdict=${entry.verdict}（预期 pass）。输出尾部：${outcome.output.slice(-1500)}`)
      }
    } finally {
      await instance.close()
    }
  })

  await stepAsync(results, 'V1·A11：runner 自启共存 home 跑 lifecycle 回归（卸载 shell，opendesign 在场）', async () => {
    const home = path.join(RUN_ROOT, 'home-shell-lifecycle')
    fs.cpSync(TEMPLATE_HOME, home, { recursive: true })
    const runId = `shell-lifecycle-${Date.now()}`
    const outcome = runVerifyRunner([
      '--dsh-bin', DSH_BIN, '--dsh-home', home, '--scenarios', 'lifecycle',
      '--artifacts-dir', artifactsDir, '--run-id', runId,
    ])
    assert(outcome.status === 0, `runner 退出码 ${outcome.status}（预期 0；1=fail 2=doctor/参数错）。输出尾部：${outcome.output.slice(-1500)}`)
    assert(outcome.verdict !== null && outcome.verdict.verdict !== 'fail', `lifecycle 聚合 verdict=${outcome.verdict?.verdict}`)
    // 断言级结果在场景级 verdict.json（runner stdout 聚合 JSON 只带场景 verdict，不带 meta）。
    const scenarioVerdict = JSON.parse(fs.readFileSync(path.join(artifactsDir, runId, 'lifecycle', 'verdict.json'), 'utf8'))
    assert(scenarioVerdict.verdict !== 'fail', `lifecycle 场景 verdict=${scenarioVerdict.verdict}`)
    const failed = scenarioVerdict.meta?.assertions?.failed
    assert(failed === 0, `lifecycle 断言失败 ${JSON.stringify(failed)} 条（degraded 的固有 disable 通道登记不算失败，断言失败算）。输出尾部：${outcome.output.slice(-1500)}`)
  })

  return results
}

// ── A7 / V4 写通道安全探针（原始 HTTP 形态，不经面板）────────────────────────

/** 页面上下文里的宿主认证 cookie（dsh-auth-* 前缀；页面已由 token URL 建立会话）。 */
async function authCookieHeader(page) {
  const cookies = await page.context().cookies()
  const auth = cookies.find((cookie) => cookie.name.startsWith('dsh-auth-'))
  assert(auth !== undefined, `页面上下文缺宿主认证 cookie（dsh-auth-*）：${JSON.stringify(cookies.map((c) => c.name))}`)
  return `${auth.name}=${auth.value}`
}

/**
 * 原始 HTTP 探针：返回状态码。经 curl 复现浏览器寻址形态（Node fetch 不允许覆写 Host 头，
 * V4 的不可信 Host 半场只能 curl 承载）；连接目标恒为 loopback origin，Host 头按用例覆写。
 */
function rawCurlStatus({ origin, pathname, method = 'POST', headers = [], body }) {
  const args = ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '15', '-X', method, `${origin}${pathname}`]
  for (const [name, value] of headers) args.push('-H', `${name}: ${value}`)
  if (body !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(body))
  const result = spawnSync('curl', args, { encoding: 'utf8' })
  if (result.error) throw new AssertionError(`curl 启动失败：${result.error.message}`)
  if (result.status !== 0) throw new AssertionError(`curl 退出码 ${result.status}：${(result.stderr ?? '').slice(0, 200)}`)
  return Number.parseInt(result.stdout.trim(), 10)
}

/**
 * 场景 S15（comment-loop·V4，验收计划表 A7）：写通道安全验证（原始 HTTP，不经面板）。
 *
 * 判据（设计 §4.1 V4 + 宿主实现核实）：宿主连接层对 /api 请求先过 Host/Origin 围栏
 * （isTrustedApiRequest → requestRejection：不可信 Host/Origin/cross-site 一律 403，未认证
 * 401）；通过后再由插件路由做载荷校验。正向对照 = 带凭据 GET 基路径 200（证明拒绝不是路由
 * 缺失或寻址错误）。越界载荷全部拒绝且零落盘（.od-comments 目录不因拒绝路径出现）。
 * 落点约束「sessionId 指向其他存在会话」半场需第二会话，L1 已锁（isInsideSessionRoot），
 * 本场景以单会话载荷拒绝与零落盘覆盖可脚本化半区。
 */
async function scenarioCommentSecurity() {
  const results = []
  const workspace = makeWorkspaceDir('cl-v4')
  const { instance, page, workspace: ws, sessionId } = await bootDesignSessionWithArtifact({ label: 'cl-v4', workspace })
  const origin = new URL(instance.url).origin
  const createPath = `${COMMENTS_API_BASE_PATH}.create`
  const commentsDir = path.join(fs.realpathSync(ws), COMMENTS_DIR_NAME)
  try {
    const cookie = await authCookieHeader(page)
    const validBody = { sessionId, artifactPath: 'index.html', text: '安全探针评论' }

    await stepAsync(results, 'comment-loop·V4 正向对照：带凭据 GET 基路径 200（路由在场 + 鉴权通过）', async () => {
      const status = rawCurlStatus({
        origin,
        pathname: `${COMMENTS_API_BASE_PATH}?sessionId=${encodeURIComponent(sessionId)}`,
        method: 'GET',
        headers: [['Cookie', cookie]],
      })
      assert(status === 200, `带凭据 GET 基路径应 200：${status}`)
    })

    await stepAsync(results, 'comment-loop·V4 ①无凭据 POST .create 被宿主鉴权层拒绝（401）', async () => {
      const status = rawCurlStatus({ origin, pathname: createPath, body: validBody })
      assert(status === 401, `无凭据 POST .create 应 401：${status}`)
    })

    await stepAsync(results, 'comment-loop·V4 ②不可信 Host 头被拒（403）', async () => {
      const status = rawCurlStatus({
        origin, pathname: createPath, headers: [['Cookie', cookie], ['Host', 'evil.example']], body: validBody,
      })
      assert(status === 403, `不可信 Host 应 403：${status}`)
    })

    await stepAsync(results, 'comment-loop·V4 ②不可信 Origin 头被拒（403）', async () => {
      const status = rawCurlStatus({
        origin, pathname: createPath, headers: [['Cookie', cookie], ['Origin', 'http://evil.example']], body: validBody,
      })
      assert(status === 403, `不可信 Origin 应 403：${status}`)
    })

    await stepAsync(results, 'comment-loop·V4 ②cross-site 浏览器标记被拒（403）', async () => {
      const status = rawCurlStatus({
        origin, pathname: createPath, headers: [['Cookie', cookie], ['Sec-Fetch-Site', 'cross-site']], body: validBody,
      })
      assert(status === 403, `Sec-Fetch-Site: cross-site 应 403：${status}`)
    })

    await stepAsync(results, 'comment-loop·V4 ③sessionId 指向不存在会话被拒（404 fail-closed）', async () => {
      const status = rawCurlStatus({
        origin, pathname: createPath, headers: [['Cookie', cookie]], body: { ...validBody, sessionId: 'no-such-session' },
      })
      assert(status === 404, `不存在会话应 404：${status}`)
    })

    await stepAsync(results, 'comment-loop·V4 ③artifactPath 含 .. 段被拒（403）', async () => {
      const status = rawCurlStatus({
        origin, pathname: createPath, headers: [['Cookie', cookie]], body: { ...validBody, artifactPath: '../index.html' },
      })
      assert(status === 403, `含 .. 段路径应 403：${status}`)
    })

    await stepAsync(results, 'comment-loop·V4 ③artifactPath 绝对路径被拒（403）', async () => {
      const status = rawCurlStatus({
        origin, pathname: createPath, headers: [['Cookie', cookie]], body: { ...validBody, artifactPath: '/etc/passwd' },
      })
      assert(status === 403, `绝对路径应 403：${status}`)
    })

    await stepAsync(results, 'comment-loop·V4 ③空文本被拒（400）', async () => {
      const status = rawCurlStatus({
        origin, pathname: createPath, headers: [['Cookie', cookie]], body: { ...validBody, text: '' },
      })
      assert(status === 400, `空文本应 400：${status}`)
    })

    await stepAsync(results, 'comment-loop·V4 ③超 10000 字符被拒（400）', async () => {
      const status = rawCurlStatus({
        origin, pathname: createPath, headers: [['Cookie', cookie]], body: { ...validBody, text: 'x'.repeat(COMMENT_TEXT_MAX_LENGTH + 1) },
      })
      assert(status === 400, `超长文本应 400：${status}`)
    })

    await stepAsync(results, 'comment-anchor·D1 ③anchor 负路径三形态被拒（400）——level 词表外 / sel 超限 / 显式 null（写入侧校验的 HTTP 半场）', async () => {
      for (const [label, anchor] of [
        ['level 词表外', { level: 'css', sel: '#main-title' }],
        ['sel 超限', { level: 'id', sel: 'x'.repeat(501) }],
        ['显式 null', null],
      ]) {
        const status = rawCurlStatus({
          origin, pathname: createPath, headers: [['Cookie', cookie]], body: { ...validBody, anchor },
        })
        assert(status === 400, `anchor ${label}应 400：${status}`)
      }
    })

    await stepAsync(results, 'comment-loop·V4 ③全部拒绝零落盘副作用（.od-comments 目录未因拒绝路径出现）', async () => {
      assert(!fs.existsSync(commentsDir), `拒绝路径不应创建评论目录：${commentsDir}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

// ── 元素锚点场景（opendesign-comment-anchor 设计 §4.1；P 组 = pick-bridge 组）──────

/**
 * 场景 P2（comment-anchor·V2）：三级降级三载体各拾取一评。
 *
 * 判据（设计 §4.1 V2）：同一产物上 ① 点击带 id 元素 → anchor {level:'id', sel:'#main-title'}；
 * ② 点击带锚属性祖先 section 的内部无 id 段落 → data 级 {level:'data', sel:'[data-od-id="hero-sec"]'}
 * （最近祖先命中）；③ 点击页脚无 id 无锚属性裸链接 → path 级（tag:nth-of-type 链从产物根
 * 可达）。三线程载荷校验通过（落盘成功）且徽章三枚钉在命中元素上。deck 形态
 * （data-screen-label、值带空格）的降级生成不设独立场景：由 serve.test.ts「锚点生成层锁值」
 * 用例承载（从 PICK_SCRIPT_SOURCE 切片求值直驱 buildAnchor——空格值不降级 / 引号反斜杠落
 * path / 锚属性序与降级序逐项锁值；V2 判据登记，落位 U3 领土 tests/serve.test.ts）。
 */
async function scenarioAnchorLevels() {
  const results = []
  const workspace = makeWorkspaceDir('p2-levels')
  const { instance, page, home, workspace: ws } = await bootDesignSessionWithArtifact({ label: 'p2-levels', workspace, artifact: PICK_ARTIFACT_NAME })
  const frame = page.frameLocator('iframe.odp-frame')
  try {
    await stepAsync(results, 'comment-anchor·V2①：拾取带 id 元素——落盘 anchor {id, #main-title}', async () => {
      await sendCommentViaPick(page, '#main-title', 'id 级探针评论')
      const threads = await waitForCommentThreads(ws, (list) => list.length >= 1)
      assert(
        threads[0].anchor?.level === 'id' && threads[0].anchor?.sel === '#main-title',
        `id 级锚点不对：${JSON.stringify(threads[0].anchor)}`,
      )
    })

    await stepAsync(results, 'comment-anchor·V2②：拾取锚属性祖先 section 内部元素——落盘 anchor {data, [data-od-id="hero-sec"]}（最近祖先命中）', async () => {
      await sendCommentViaPick(page, '#hero p', 'data 级探针评论')
      const threads = await waitForCommentThreads(ws, (list) => list.length >= 2)
      assert(
        threads[1].anchor?.level === 'data' && threads[1].anchor?.sel === '[data-od-id="hero-sec"]',
        `data 级锚点应为最近祖先的 data-od-id 属性选择器：${JSON.stringify(threads[1].anchor)}`,
      )
    })

    await stepAsync(results, 'comment-anchor·V2③：拾取无 id 无锚属性裸链接——落盘 path 级 tag:nth-of-type 链（从产物根可达）', async () => {
      await sendCommentViaPick(page, 'footer a', 'path 级探针评论')
      const threads = await waitForCommentThreads(ws, (list) => list.length >= 3)
      assert(
        threads[2].anchor?.level === 'path' && threads[2].anchor?.sel === PICK_ARTIFACT_PATH_SEL,
        `path 级锚点应为 nth-of-type 链：${JSON.stringify(threads[2].anchor)}（期望 ${PICK_ARTIFACT_PATH_SEL}）`,
      )
    })

    await stepAsync(results, 'comment-anchor·V2④：徽章三枚按 anchors 下发集重建（序号 = 侧栏条目序 1/2/3）+ 侧栏三级别名各在其位', async () => {
      const badgeTexts = await frame.locator('.od-pick-badge').allTextContents()
      assert(
        JSON.stringify(badgeTexts.map((t) => t?.trim())) === JSON.stringify(['1', '2', '3']),
        `徽章序号应为 1/2/3：${JSON.stringify(badgeTexts)}`,
      )
      const levels = await page.evaluate(() => Array.from(document.querySelectorAll('.odp-thread .odp-thread-anchor-level')).map((el) => el.textContent?.trim()))
      assert(
        JSON.stringify(levels) === JSON.stringify(['Element id', 'Anchor attribute', 'Structural path']),
        `侧栏三级别名不对（en 字典）：${JSON.stringify(levels)}`,
      )
      const selTexts = await page.evaluate(() => Array.from(document.querySelectorAll('.odp-thread .odp-thread-anchor-sel')).map((el) => el.textContent?.trim()))
      assert(
        JSON.stringify(selTexts) === JSON.stringify(['#main-title', '[data-od-id="hero-sec"]', PICK_ARTIFACT_PATH_SEL]),
        `侧栏三 sel 直呈不对：${JSON.stringify(selTexts)}`,
      )
      assert(await waitForCommentFeedbackCountSafe(home, 3), '三线程应各有一条回注消息')
    })
  } finally {
    await instance.close()
  }
  return results
}

/** 评论回注消息计数达标轮询的布尔包装（场景内断言用；不满足返回 false 不抛）。 */
async function waitForCommentFeedbackCountSafe(home, expected, timeoutMs = 30000) {
  try {
    await waitForCommentFeedbackCount(home, expected, timeoutMs)
    return true
  } catch {
    return false
  }
}

/**
 * 场景 P3（comment-anchor·V3）：联动定位与锚点失效标注。
 *
 * 判据（设计 §4.1 V3 步①②⑤⑥）：点侧栏条目「Locate」→ 产物内滚动定位 + 高亮闪框约
 * 1.4 秒（D8(b) locate 指令）；重写产物删除目标 id 后重载 → 对应侧栏条目显示「锚点失效」
 * 态且定位按钮禁用、不发起 locate（D1 失效条目恢复路径条款）；其余条目不受影响。
 */
async function scenarioAnchorLocateAndMiss() {
  const results = []
  const workspace = makeWorkspaceDir('p3-locate')
  const { instance, page, home, workspace: ws } = await bootDesignSessionWithArtifact({ label: 'p3-locate', workspace, artifact: PICK_ARTIFACT_NAME })
  const frame = page.frameLocator('iframe.odp-frame')
  const workspaceReal = fs.realpathSync(ws)
  try {
    // 置态：id 级 + path 级两线程（path 级载体在删 id 改写后仍命中——对照条目）
    await sendCommentViaPick(page, '#main-title', '定位探针：id 级线程')
    await sendCommentViaPick(page, 'footer a', '定位探针：path 级线程')
    await waitForCommentThreads(ws, (list) => list.length >= 2)

    await stepAsync(results, 'comment-anchor·V3①②：点侧栏定位钮——产物内高亮闪框出现（locate 指令经桥下达，D8(b)）', async () => {
      const locateButtons = page.locator('.odp-thread button.odp-button', { hasText: 'Locate' })
      // 侧栏 GET 重拉与渲染晚于落盘轮询（sendCommentViaPick 的 Sent 条件会被既有徽标即时
      // 满足）——定位钮数量轮询到位再断言，不吃即时 count 的时序竞争
      const locateDeadline = Date.now() + 10000
      let locateCount = 0
      while (Date.now() < locateDeadline && (locateCount = await locateButtons.count()) < 2) await sleep(300)
      assert(locateCount === 2, `两线程应各有一个定位钮：${locateCount}`)
      await locateButtons.first().click()
      await frame.locator('.od-pick-flash').waitFor({ state: 'visible', timeout: 3000 })
    })

    await stepAsync(results, 'comment-anchor·V3⑤：重写产物删除目标 id（其余结构原样）——伺服内容版本变化', async () => {
      fs.writeFileSync(path.join(workspaceReal, PICK_ARTIFACT_NAME), pickArtifactHtml({ title: 'Rewritten Without Id' })
        .replace('<h1 id="main-title">Rewritten Without Id</h1>', '<h1>Rewritten Without Id</h1>'))
      // 版本探针（HEAD ETag）就绪需要文件 stat 变化；等待重挂与 anchors 重探（脚本侧
      // querySelector('#main-title') 未中 → anchors-status 回报 → 侧栏失效态）
      await waitForCommentThreads(ws, (list) => list.length >= 2)
    })

    await stepAsync(results, 'comment-anchor·V3⑥：失效条目呈现「Anchor missing」态且定位钮禁用；path 级对照条目不受影响（D8(b) 失效态自动呈现）', async () => {
      await page.waitForFunction(
        () => document.querySelectorAll('.odp-thread--missed').length === 1,
        undefined,
        { timeout: 30000 },
      )
      const missedFlag = await page.evaluate(() => document.querySelector('.odp-thread--missed .odp-anchor-missed')?.textContent?.trim())
      assert(missedFlag === 'Anchor missing', `失效标注文案应为 en 字典 'Anchor missing'：${JSON.stringify(missedFlag)}`)
      const missedLocate = await page.evaluate(() => {
        const missed = document.querySelector('.odp-thread--missed')
        const button = missed?.querySelector('.odp-thread-actions button')
        return { disabled: button?.disabled ?? null, text: button?.textContent?.trim() ?? null }
      })
      assert(missedLocate.disabled === true && missedLocate.text === 'Locate', `失效条目定位钮应禁用：${JSON.stringify(missedLocate)}`)
      const healthy = await page.evaluate(() => {
        const thread = document.querySelectorAll('.odp-thread')[1]
        const button = thread?.querySelector('.odp-thread-actions button')
        return { missed: thread?.classList.contains('odp-thread--missed') ?? null, disabled: button?.disabled ?? null }
      })
      assert(healthy.missed === false && healthy.disabled === false, `path 级对照条目应不受影响：${JSON.stringify(healthy)}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 P4（comment-anchor·V3③ + V8①③ + RL7）：改稿可见性——ETag 变化驱动重挂与徽章重建。
 *
 * 判据：模拟模型改稿（改目标元素内容、保留 id 与 data-od-id 锚属性、在 footer 内插入同型
 * 兄弟使 path 级序数漂移）→ 伺服 ETag 变化 → 面板版本探针在 ≤6 秒内感知并重挂 iframe，
 * 新文档拾取脚本 ready 二次握手（RL7）→ anchors 重发 → 徽章重建且 id/data 级命中；path 级
 * 失效如实标注、不判失败（D1 已接受代价。AS10 观测已触发 D1 重审线：真实写盘产物样本
 * 9 文件 3274 元素 path 级 97.6%、锚属性 0 命中——probe/anchor-distribution.md；按方案 B
 * 口径收尾 = path 级失效为常态、失效如实标注即达标，材质化回写锚属性增强（方案 A）为立项
 * 候选待用户裁决——评估材料 opendesign-comment-anchor.as10-review.md）。
 */
async function scenarioAnchorRewriteVisibility() {
  const results = []
  const workspace = makeWorkspaceDir('p4-rewrite')
  const { instance, page, home, workspace: ws } = await bootDesignSessionWithArtifact({ label: 'p4-rewrite', workspace, artifact: PICK_ARTIFACT_NAME })
  const frame = page.frameLocator('iframe.odp-frame')
  const workspaceReal = fs.realpathSync(ws)
  try {
    // ready 观察哨：进产物后立即注册（首载 ready 在拾取脚本随文档加载即发——观察哨必须
    // 先于它就位，晚注册会漏掉首载握手只看到二次握手，基线恒 0）。父页 window 收集桥上行
    // ready 报文（ready 二次握手 = RL7 判据）。
    await page.evaluate(() => {
      window.__p4Inbound = []
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'odp-pick:ready') window.__p4Inbound.push({ type: event.data.type, at: Date.now() })
      })
    })
    // 置态：三级各一线程
    await sendCommentViaPick(page, '#main-title', '改稿可见性：id 级')
    await sendCommentViaPick(page, '#hero p', '改稿可见性：data 级')
    await sendCommentViaPick(page, 'footer a', '改稿可见性：path 级')
    await waitForCommentThreads(ws, (list) => list.length >= 3)
    const baselineReady = await page.evaluate(() => window.__p4Inbound.length)
    // 基线语义：观察哨晚于首载 ready 时基线可为 0（历史报文不重放）——RL7 判据只看
    // 「改稿后新增 ready ≥ 1」（二次握手），与首载是否漏记无关。

    await stepAsync(results, 'comment-anchor·V8②：脚本模拟改稿——改 #main-title 内容、保留 id 与 data-od-id、footer 前插入无链接新 footer 使 path 级序数漂移失效', async () => {
      // path 级 sel = 'html > body:nth-of-type(1) > footer:nth-of-type(1) > a:nth-of-type(1)'：
      // 新 footer 无 a → sel 的 footer:nth-of-type(1) 落在新 footer 上、a:nth-of-type(1) 不命中
      // ——「插入无关同型块致序数漂移」的正宗失效形态（nth-of-type 按类型序数，非全兄弟序数）。
      const rewritten = [
        '<!doctype html>',
        '<html lang="en">',
        '<head><meta charset="utf-8" /><title>pick target</title></head>',
        '<body>',
        '  <section id="hero" data-od-id="hero-sec">',
        '    <h1 id="main-title">Rewritten Title Keeps Anchors</h1>',
        '    <p>intro copy for data anchor</p>',
        '  </section>',
        '  <footer>',
        '    <p>new footer block inserted by rewrite</p>',
        '  </footer>',
        '  <footer>',
        '    <a href="#top">bare footer link</a>',
        '  </footer>',
        '</body>',
        '</html>',
      ].join('\n')
      fs.writeFileSync(path.join(workspaceReal, PICK_ARTIFACT_NAME), rewritten)
    })

    await stepAsync(results, 'comment-anchor·V3③+RL7：≤6 秒内 iframe 重挂——拾取脚本 ready 二次握手到达（版本探针 5s 定时窗口）', async () => {
      const rewriteAt = Date.now()
      const deadline = rewriteAt + 6000
      let secondReadyAt = null
      while (Date.now() < deadline) {
        const count = await page.evaluate(() => window.__p4Inbound.length)
        if (count >= baselineReady + 1) { secondReadyAt = await page.evaluate(() => window.__p4Inbound.at(-1).at); break }
        await sleep(300)
      }
      assert(secondReadyAt !== null, `改稿后 ≤6s 内应出现 ready 二次握手（基线 ${baselineReady}）——探针缺失或间隔失控即红`)
      assert(secondReadyAt - rewriteAt <= 6000, `ready 二次握手距改稿 ${secondReadyAt - rewriteAt}ms，应 ≤6000ms`)
    })

    await stepAsync(results, 'comment-anchor·V8③：徽章重建且 id/data 级命中（2 枚）+ path 级失效如实标注不判失败', async () => {
      await page.waitForFunction(
        () => document.querySelectorAll('.odp-thread--missed').length === 1,
        undefined,
        { timeout: 15000 },
      )
      const badges = await frame.locator('.od-pick-badge').allTextContents()
      assert(
        JSON.stringify(badges.map((t) => t?.trim())) === JSON.stringify(['1', '2']),
        `重建后徽章应恰 id/data 两枚（序号 1/2）：${JSON.stringify(badges)}`,
      )
      const missed = await page.evaluate(() => ({
        count: document.querySelectorAll('.odp-thread--missed').length,
        flag: document.querySelector('.odp-thread--missed .odp-anchor-missed')?.textContent?.trim(),
        badge: document.querySelectorAll('.odp-thread .odp-badge')[2]?.textContent?.trim(),
      }))
      assert(missed.count === 1 && missed.flag === 'Anchor missing', `path 级条目应如实标注失效：${JSON.stringify(missed)}`)
      assert(missed.badge === 'Sent', `失效条目投递徽标不受影响（Sent 在位）：${JSON.stringify(missed.badge)}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 关闭当前 design tab（dockkit chrome 关闭钮，en-US aria=Close；tab 头 hover 后可见——
 * playwright click 自带 hover）。u-probe 探针实测该钮作用于焦点 tab，单 tab 态即关本 tab。
 */
async function closeDesignTab(page) {
  const closeBtn = page.locator('button[aria-label="Close"]').last()
  await closeBtn.waitFor({ state: 'visible', timeout: 8000 })
  await closeBtn.click()
  await page.waitForTimeout(900)
}

/**
 * 场景 P5（comment-anchor·V4 + V5 + V11①②③④ + RL6）：布局联动生命周期。
 *
 * 判据：V4 宽屏默认展开态打开预览 → 进 iframe 自动收起（ctx.layout.toggleSidebar 语义）
 * 且预览正常呈现 → 关 tab 还原恰一次（RL6：还原缺失或双重执行任一发生即红）；V11② 同一
 * 挂载生命周期内列表↔iframe 往返不重放（重复 toggle 会把已收起的侧栏反向展开——D2 触发
 * 点定义）；V11③ 切走 tab 再切回不重放（keepMounted 保活语义）、关闭 tab 才还原；V5 硬
 * 边界矩阵行（手动收过侧栏再打开预览被误展开——宿主 face 无侧栏状态读取的已接受边界；
 * 面板「Sidebar」按钮一键再收；手动接管后关闭面板不再触碰侧栏）；V11④ 多实例分屏（宿主
 * Split 动作，u-probe 探针已定 e2e 承载）各实例独立记账、全程无 pageerror。
 */
async function scenarioAnchorLayout() {
  const results = []
  const workspace = makeWorkspaceDir('p5-layout')
  seedProbeArtifact(workspace)
  fs.writeFileSync(path.join(workspace, PICK_ARTIFACT_NAME), pickArtifactHtml())
  const instance = await withInstance({ label: 'p5-layout', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  const pageErrors = []
  try {
    const { page } = instance
    page.on('pageerror', (error) => { pageErrors.push(error instanceof Error ? error.message : String(error)) })
    await pickWorkspace(page, workspace)
    await pickDesignPreset(page)
    await sendUserMessage(page, 'design a landing page for layout tie-in')

    await stepAsync(results, 'comment-anchor·V4①：宽屏默认态基准——左侧边栏展开（Collapse sidebar 按钮在场）', async () => {
      await waitForSidebarState(page, true)
    })

    await stepAsync(results, 'comment-anchor·V4②③：打开设计预览进 iframe——左侧边栏自动收起（toggleSidebar）且预览面板正常呈现', async () => {
      await openDesignPanel(page)
      // waitForFunction 回调在浏览器上下文执行，闭包变量不随函数序列化——产物名经参数传入
      await page.waitForFunction(
        (name) => Array.from(document.querySelectorAll('.odp-row')).some((el) => el.textContent?.trim() === name),
        PICK_ARTIFACT_NAME,
        { timeout: 15000 },
      )
      await page.locator('.odp-row', { hasText: PICK_ARTIFACT_NAME }).first().click()
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
      await waitForSidebarState(page, false)
    })

    await stepAsync(results, 'comment-anchor·V11②：同一挂载生命周期内列表↔iframe 往返——不重复触发自动切换（侧栏保持收起不反向展开）', async () => {
      await page.locator('.odp-body .odp-button', { hasText: 'Back to artifact list' }).click()
      await page.waitForTimeout(800)
      await page.locator('.odp-row', { hasText: PICK_ARTIFACT_NAME }).first().click()
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
      await sleep(1500) // 若闸失效此处会重放 toggle——余量窗口
      assert(await leftSidebarExpanded(page) === false, '列表↔iframe 往返不应重放自动切换（侧栏应保持收起）')
    })

    await stepAsync(results, 'comment-anchor·V11③：切走 tab 再切回（keepMounted 保活）——切走保持收起、切回不重放；关闭 design tab 才还原（还原恰一次）', async () => {
      // 切走：点会话流区域（左栏已收起，主对话区在场）——keepMounted 保活面板不卸载
      await page.locator('[contenteditable="true"]').first().click()
      await page.waitForTimeout(800)
      assert(await leftSidebarExpanded(page) === false, '切走期间侧栏应保持收起（keepMounted 不还原）')
      // 切回：点 dockkit tab 头（design tab）
      await page.locator('[data-dockkit-tab], [data-sidebar-right-tab]').first().click()
      await page.waitForTimeout(900)
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
      await sleep(1500) // 重放窗口余量
      assert(await leftSidebarExpanded(page) === false, '切回不应重放布局动作（闸随实例存活）')
      // 关闭 design tab → 卸载 → 还原义务执行恰好一次（RL6）
      await closeDesignTab(page)
      await waitForSidebarState(page, true)
    })

    await stepAsync(results, 'comment-anchor·V5①②③：宿主按钮手动收起后打开预览——被误展开（宿主 face 无侧栏状态读取的已接受硬边界，D2 矩阵行 2）', async () => {
      await page.locator('button[aria-label="Collapse sidebar"]').first().click()
      await waitForSidebarState(page, false)
      await openDesignPanel(page)
      await page.locator('.odp-row', { hasText: PICK_ARTIFACT_NAME }).first().click()
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
      await waitForSidebarState(page, true) // 盲切换把已收起的侧栏误展开——行为如实发生
    })

    await stepAsync(results, 'comment-anchor·V5④：面板头部「Sidebar」按钮一键再收（手动接管，还原义务清除）', async () => {
      const sidebarBtn = page.locator('.odp-note button', { hasText: 'Sidebar' }).first()
      await sidebarBtn.waitFor({ state: 'visible', timeout: 8000 })
      await sidebarBtn.click()
      await waitForSidebarState(page, false)
    })

    await stepAsync(results, 'comment-anchor·V5⑥：手动接管后关闭面板——侧栏不再被触碰（还原义务已清除，保持收起）', async () => {
      await closeDesignTab(page)
      await sleep(1500) // 若义务未清除此处会被反向切换展开——余量窗口
      assert(await leftSidebarExpanded(page) === false, '手动接管后关闭面板不应触碰侧栏（保持收起）')
    })

    await stepAsync(results, 'comment-anchor·V11④：宿主 Split 分屏放置第二个 design tab——pane 1→2，两实例并存全程无 pageerror（AS11 已接受代价登记形态）', async () => {
      // 重新打开面板（前一实例已关闭）
      await openDesignPanel(page)
      await page.locator('.odp-row', { hasText: PICK_ARTIFACT_NAME }).first().click()
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
      const before = await page.evaluate(() => document.querySelectorAll('[data-dockkit-pane]').length)
      const splitBtn = page.locator('button[aria-label="Split"]').first()
      await splitBtn.waitFor({ state: 'visible', timeout: 8000 })
      await splitBtn.click()
      await page.waitForFunction(
        (count) => document.querySelectorAll('[data-dockkit-pane]').length > count,
        before,
        { timeout: 8000 },
      )
      const after = await page.evaluate(() => document.querySelectorAll('[data-dockkit-pane]').length)
      console.log(`    [P5 实测] Split 分屏：pane ${before} → ${after}`)
      // 两实例并存的侧栏动作按 AS11 已接受代价登记（独立记账可能互踩）——判据收在
      // 「全程无报错 + 面板头部按钮一键纠正」：两实例各有头部按钮可手动纠正。
      const sidebarButtons = await page.locator('.odp-note button', { hasText: 'Sidebar' }).count()
      assert(sidebarButtons >= 1, `分屏后应有面板头部侧栏按钮可纠正（实测 ${sidebarButtons} 个）`)
      // 还原：关掉第二 pane 的 tab（Close 作用于焦点/末位 tab）
      await closeDesignTab(page)
      const restored = await page.evaluate(() => document.querySelectorAll('[data-dockkit-pane]').length)
      assert(restored === before, `关闭后应还原 pane ${before}：${restored}`)
      assert(pageErrors.length === 0, `全程不应有 pageerror：${JSON.stringify(pageErrors)}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 P6（comment-anchor·V7 + RL2/RL3）：沙箱红线与注入完整性（反向验证）。
 *
 * 判据（设计 §4.1 V7 全步骤）：① 面板 iframe sandbox 属性逐字 allow-scripts 不含
 * allow-same-origin（注入上线后 RL2 复核）；② GET HTML 响应 = 磁盘字节 + 注入脚本标签
 * （期望值用生产 injectPickScript 现算，差异恰为注入内容——RL3 磁盘字节不变）；③ HEAD
 * 响应无 body 且 HTML 附 ETag、非 HTML 资源响应无注入且与磁盘逐字一致；④ 顶层直接打开
 * 伺服 URL（无面板父窗口）脚本静默：零拾取 UI、零徽章、零 overlay（V7 步④）；⑤ 设备壳
 * HTML（.od-frames/）响应无注入标签、产物 index.html 有注入标签（D4 谓词路径排除的对照，
 * GL1 设备壳不可拾取边界的机器断言）。
 */
async function scenarioAnchorInjection() {
  const results = []
  const workspace = makeWorkspaceDir('p6-inject')
  const { instance, page, workspace: ws, sessionId } = await bootDesignSessionWithArtifact({ label: 'p6-inject', workspace })
  const workspaceReal = fs.realpathSync(ws)
  const routeBase = `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/${sessionId}`
  try {
    await stepAsync(results, 'comment-anchor·V7①：面板 iframe sandbox 属性逐字 allow-scripts 且不含 allow-same-origin（RL2 注入形态复核）', async () => {
      const sandbox = await page.getAttribute('iframe.odp-frame', 'sandbox')
      assert(sandbox === 'allow-scripts', `sandbox 属性应逐字等于 allow-scripts：${JSON.stringify(sandbox)}`)
    })

    await stepAsync(results, 'comment-anchor·V7②：GET HTML 响应 = 磁盘字节 + 注入标签（与生产 injectPickScript 逐字对账，RL3）', async () => {
      const outcome = await pageFetch(page, `${routeBase}/index.html`)
      assert(outcome.status === 200, `GET 产物应 200：${outcome.status}`)
      const disk = fs.readFileSync(path.join(workspaceReal, 'index.html'), 'utf8')
      const expected = injectPickScript(disk)
      assert(outcome.text === expected, `HTML 响应应逐字等于磁盘字节 + 注入段（长度 ${outcome.text.length} vs 期望 ${expected.length}）`)
      assert(outcome.text.includes('<script data-od-pick="1">'), '响应应含注入标签开口（data-od-pick 识别属性）')
      assert(outcome.text.includes('probe-artifact'), '响应应含产物本体内容（磁盘字节未变）')
    })

    await stepAsync(results, 'comment-anchor·V7③a：HEAD 请求——无 body 且 HTML 附 ETag（D8(c) 版本凭据）', async () => {
      const outcome = await page.evaluate(async (pathname) => {
        const response = await fetch(pathname, { method: 'HEAD' })
        const text = await response.text()
        return { status: response.status, bodyLength: text.length, etag: response.headers.get('etag') }
      }, `${routeBase}/index.html`)
      assert(outcome.status === 200 && outcome.bodyLength === 0, `HEAD 应 200 且无 body：${JSON.stringify(outcome)}`)
      assert(typeof outcome.etag === 'string' && outcome.etag.startsWith('W/"'), `HTML HEAD 应附弱校验 ETag：${JSON.stringify(outcome.etag)}`)
    })

    await stepAsync(results, 'comment-anchor·V7③b：非 HTML 资源——响应与磁盘逐字一致且无注入标签', async () => {
      const outcome = await pageFetch(page, `${routeBase}/secret-note.txt`)
      assert(outcome.status === 200, `GET 非 HTML 资源应 200：${outcome.status}`)
      const disk = fs.readFileSync(path.join(workspaceReal, 'secret-note.txt'), 'utf8')
      assert(outcome.text === disk, '非 HTML 响应应与磁盘逐字一致（不注入）')
      assert(!outcome.text.includes('data-od-pick'), '非 HTML 响应不应含注入标签')
    })

    await stepAsync(results, 'comment-anchor·V7⑤：设备壳 HTML（.od-frames/）无注入标签 + 产物 index.html 有（对照）——D4 路径排除的机器断言', async () => {
      const shellOutcome = await pageFetch(page, `${routeBase}/.od-frames/neutral.html`)
      assert(shellOutcome.status === 200, `设备壳应 200（材质化复制件在场）：${shellOutcome.status}`)
      assert(!shellOutcome.text.includes('data-od-pick'), '设备壳 HTML 响应不应注入拾取脚本（GL1 壳内不可拾取边界）')
      const shellDisk = fs.readFileSync(path.join(workspaceReal, '.od-frames', 'neutral.html'), 'utf8')
      assert(shellOutcome.text === shellDisk, '设备壳响应应与磁盘逐字一致')
      const artifactOutcome = await pageFetch(page, `${routeBase}/index.html`)
      assert(artifactOutcome.text.includes('data-od-pick'), '对照：产物 index.html 响应应有注入标签')
    })

    await stepAsync(results, 'comment-anchor·V7④：顶层直开伺服 URL（无面板父窗口）——脚本静默：零拾取 UI 零徽章零 overlay，产物内容不被改动', async () => {
      const topPage = await page.context().newPage()
      try {
        await topPage.goto(`${new URL(instance.url).origin}${routeBase}/index.html`, { waitUntil: 'load', timeout: 30000 })
        await topPage.waitForTimeout(1500) // 若脚本误渲染，窗口内必现 overlay/徽章
        const ui = await topPage.evaluate(() => ({
          layer: document.querySelectorAll('#od-pick-layer').length,
          panel: document.querySelectorAll('.od-pick-panel').length,
          badges: document.querySelectorAll('.od-pick-badge').length,
          styles: document.querySelectorAll('#od-pick-script-styles').length,
          injected: document.querySelectorAll('script[data-od-pick="1"]').length,
          h1Text: document.querySelector('h1')?.textContent?.trim() ?? null,
        }))
        assert(ui.injected === 1, `顶层直开的 GET HTML 响应仍应注入脚本标签（谓词与父窗口无关）：${JSON.stringify(ui)}`)
        assert(ui.layer === 0 && ui.panel === 0 && ui.badges === 0 && ui.styles === 0, `顶层直开不应渲染任何拾取 UI（G1/SI2 恒静默）：${JSON.stringify(ui)}`)
        assert(ui.h1Text === 'probe-artifact', `产物内容不应被改动：${JSON.stringify(ui.h1Text)}`)
      } finally {
        await topPage.close()
      }
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 P7（comment-anchor·RL5）：桥契约负路径——v ≠ 1 与前缀不符两类可构造形态双向静默。
 *
 * 判据（设计 §4.2 RL5 e2e 半场；来源伪造不可构造由 U4 单测 mock 承载——分工登记）：
 * 脚本→面板方向：错 v / 错前缀的 picked 报文被面板三重校验静默（零落盘）；合法 picked
 * 对照通道连通（落盘成功）。面板→脚本方向：错 v / 错前缀的 pick-mode 报文被脚本侧忽略
 * （不渲染 overlay）；合法 pick-mode 对照 overlay 出现。
 */
async function scenarioAnchorNegativePaths() {
  const results = []
  const workspace = makeWorkspaceDir('p7-negative')
  const { instance, page, workspace: ws } = await bootDesignSessionWithArtifact({ label: 'p7-negative', workspace, artifact: PICK_ARTIFACT_NAME })
  const frameHandle = () => page.frames().find((f) => f.url().includes(OPENDESIGN_ARTIFACTS_PREFIX_PATH))
  try {
    await stepAsync(results, 'comment-anchor·RL5a：脚本→面板错 v 报文静默——v=2 的 picked 零落盘', async () => {
      const posted = await frameHandle().evaluate(() => {
        window.parent.postMessage({ v: 2, type: 'odp-pick:picked', payload: { anchor: { level: 'id', sel: '#main-title' }, text: '错版本负路径' } }, '*')
        return true
      })
      assert(posted, 'postMessage 执行成功（发送通道本身可达）')
      await sleep(2500)
      assert(readCommentThreads(ws) === null, 'v≠1 的 picked 不应落盘（面板 G1 校验静默）')
    })

    await stepAsync(results, 'comment-anchor·RL5b：脚本→面板错前缀报文静默——非 odp-pick: 前缀的 v=1 picked 零落盘', async () => {
      await frameHandle().evaluate(() => {
        window.parent.postMessage({ v: 1, type: 'other:picked', payload: { anchor: { level: 'id', sel: '#main-title' }, text: '错前缀负路径' } }, '*')
      })
      await sleep(2500)
      assert(readCommentThreads(ws) === null, '前缀不符的 picked 不应落盘')
    })

    await stepAsync(results, 'comment-anchor·RL5 对照：合法 v1 picked 落盘成功（同一发送通道，证明负路径拒绝来自契约校验而非通道不通）', async () => {
      await frameHandle().evaluate(() => {
        window.parent.postMessage({ v: 1, type: 'odp-pick:picked', payload: { anchor: { level: 'id', sel: '#main-title' }, text: '合法 picked 对照' } }, '*')
      })
      const threads = await waitForCommentThreads(ws, (list) => list.length >= 1)
      assert(threads.length === 1 && threads[0].anchor?.level === 'id', `合法 picked 应落盘：${JSON.stringify(threads.map((t) => t.anchor))}`)
    })

    await stepAsync(results, 'comment-anchor·RL5c：面板→脚本错 v 报文静默——v=2 的 pick-mode 不激活拾取交互（hover 高亮框不出现）', async () => {
      // 拾取交互激活的机器判据 = hover 后高亮框（.od-pick-box）可见；#od-pick-layer 在
      // 对照步落盘后已因徽章渲染挂载（ensureLayer），layer 在场 ≠ 交互激活。
      await page.evaluate(() => {
        document.querySelector('iframe.odp-frame').contentWindow.postMessage({ v: 2, type: 'odp-pick:pick-mode', payload: { enabled: true } }, '*')
      })
      await sleep(1200)
      const frameL = page.frameLocator('iframe.odp-frame')
      await frameL.locator('#main-title').hover()
      await sleep(600)
      assert(await frameL.locator('.od-pick-box').isVisible() === false, 'v≠1 的 pick-mode 不应激活拾取交互（hover 高亮框不应出现）')
    })

    await stepAsync(results, 'comment-anchor·RL5d：面板→脚本错前缀报文静默 + 合法对照拾取交互激活', async () => {
      await page.evaluate(() => {
        document.querySelector('iframe.odp-frame').contentWindow.postMessage({ v: 1, type: 'wrong:pick-mode', payload: { enabled: true } }, '*')
      })
      await sleep(1200)
      const frameL = page.frameLocator('iframe.odp-frame')
      await frameL.locator('#main-title').hover()
      await sleep(600)
      assert(await frameL.locator('.od-pick-box').isVisible() === false, '前缀不符的 pick-mode 不应激活拾取交互')
      // 合法对照：v1 pick-mode enabled:true → hover（触发 mousemove）高亮框出现（同一发送通道）
      await page.evaluate(() => {
        document.querySelector('iframe.odp-frame').contentWindow.postMessage({ v: 1, type: 'odp-pick:pick-mode', payload: { enabled: true } }, '*')
      })
      await frameL.locator('#main-title').hover()
      await frameL.locator('.od-pick-box').waitFor({ state: 'visible', timeout: 5000 })
      // 收尾：关掉评论模式（合法报文），不留激活态
      await page.evaluate(() => {
        document.querySelector('iframe.odp-frame').contentWindow.postMessage({ v: 1, type: 'odp-pick:pick-mode', payload: { enabled: false } }, '*')
      })
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 P8（comment-anchor·V6 + D3）：评论输入入口唯一化后的面板形态。
 *
 * 判据（设计 §4.1 V6）：① 面板无首评直发输入框（D3 移除）；② 对既有 open 线程追加文本
 * 落盘（replies 增长）；③ resolve 后标记在位；④⑤ 拾取提交构造 .create 失败（路由拦截
 * 500）→ iframe 输入框保持文本 + 行内错误提示 + 发送钮恢复可用（D6 submit-result
 * ok:false 回执语义），恢复通道后重发成功；⑥ 产物不可拾取（列表渲染后删产物 → 点击行 →
 * 伺服 404）：失败行与重试钮呈现、既有线程列表照常可追加（侧栏与伺服解耦）、评论模式
 * 开关禁用（tooltip 产物加载中）——产物恢复 Reload 后拾取可用可发首评；面板全程不出现
 * 首评直发输入组件。
 */
async function scenarioAnchorEntryUniqueness() {
  const results = []
  const workspace = makeWorkspaceDir('p8-entry')
  const { instance, page, workspace: ws } = await bootDesignSessionWithArtifact({ label: 'p8-entry', workspace, artifact: PICK_ARTIFACT_NAME })
  const frame = page.frameLocator('iframe.odp-frame')
  const workspaceReal = fs.realpathSync(ws)
  try {
    // 置态：拾取一线程（供追加/resolve/不可拾取形态的既有线程面）
    await sendCommentViaPick(page, '#main-title', '入口唯一化置态线程')

    await stepAsync(results, 'comment-anchor·V6①：面板无首评直发输入框（textarea.odp-comment-input / .odp-comments-composer 全零，D3）', async () => {
      const counts = await page.evaluate(() => ({
        textarea: document.querySelectorAll('.odp-comments-panel textarea.odp-comment-input').length,
        composer: document.querySelectorAll('.odp-comments-composer').length,
      }))
      assert(counts.textarea === 0 && counts.composer === 0, `面板不应存在直发输入组件：${JSON.stringify(counts)}`)
    })

    await stepAsync(results, 'comment-anchor·V6②：对既有 open 线程追加文本——replies 增长落盘（追加通道保留）', async () => {
      await page.locator('.odp-reply-composer input.odp-reply-input').fill('追加探针评论')
      await page.locator('.odp-reply-composer button.odp-button').click()
      await page.waitForFunction(() => document.querySelectorAll('.odp-reply').length > 0, undefined, { timeout: 20000 })
      const current = readCommentThreads(ws)[0]
      assert(current.replies.length === 1 && current.replies[0].text === '追加探针评论', `追加应落盘：${JSON.stringify(current.replies)}`)
    })

    await stepAsync(results, 'comment-anchor·V6③：resolve 通道保留——标记已解决在位', async () => {
      await page.locator('.odp-thread button.odp-button', { hasText: 'Mark resolved' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.odp-resolved-mark').length > 0, undefined, { timeout: 15000 })
      assert(readCommentThreads(ws)[0].status === 'resolved', 'resolve 后 lifecycle 应 resolved')
    })

    await stepAsync(results, 'comment-anchor·V6④⑤：拾取提交构造 .create 失败（路由拦截 500）——输入框保持文本 + 行内错误提示 + 发送钮恢复（D6 失败回执）', async () => {
      const sidebarToggle = page.locator('.odp-comments-panel button[aria-label="Comment mode"]')
      // 置态拾取后评论模式仍开启（持续开关语义）——仅在关闭态点击开启
      if ((await sidebarToggle.getAttribute('aria-pressed')) !== 'true') {
        await sidebarToggle.click()
      }
      await frame.locator('footer a').click()
      const panel = frame.locator('.od-pick-panel')
      await panel.waitFor({ state: 'visible', timeout: 5000 })
      await panel.locator('textarea').fill('失败回执探针评论')
      // 拦截写通道 500（恢复动作可重发的构造形态；断网会连带探针噪声，路由点更精确）
      await page.route(`**${COMMENTS_API_BASE_PATH}.create*`, (route) => route.fulfill({ status: 500, body: '{"code":"intercepted"}', contentType: 'application/json' }))
      await panel.locator('button.od-pick-primary').click()
      await frame.locator('.od-pick-error').waitFor({ state: 'visible', timeout: 10000 })
      const errorText = await frame.locator('.od-pick-error').textContent()
      assert(errorText?.trim() === 'Failed to send; please try again.', `行内错误提示应为 en 字典 sendError 文案：${JSON.stringify(errorText)}`)
      const draftKept = await panel.locator('textarea').inputValue()
      assert(draftKept === '失败回执探针评论', `失败后输入框应保留文本（可修改重发）：${JSON.stringify(draftKept)}`)
      // 恢复通道 → 重发成功
      await page.unroute(`**${COMMENTS_API_BASE_PATH}.create*`)
      await panel.locator('button.od-pick-primary').click()
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('.odp-thread .odp-badge')).some((el) => el.textContent?.trim() === 'Sent'),
        undefined,
        { timeout: 20000 },
      )
      await panel.waitFor({ state: 'detached', timeout: 5000 })
      const threads = readCommentThreads(ws)
      assert(threads.length === 2 && threads[1].anchor?.sel === PICK_ARTIFACT_PATH_SEL, `重发应落盘第二线程：${JSON.stringify(threads.map((t) => t.anchor))}`)
    })

    await stepAsync(results, 'comment-anchor·V6⑥：产物不可拾取（列表渲染后删产物 → 点击行 → 伺服 404）——失败行呈现 + 评论模式开关禁用 + 既有线程追加照常', async () => {
      await page.locator('.odp-body .odp-button', { hasText: 'Back to artifact list' }).click()
      await page.waitForTimeout(1200) // 列表挂载拉取（仅挂载时拉一次——删除后行仍呈现，点击即探针 404）
      fs.rmSync(path.join(workspaceReal, PICK_ARTIFACT_NAME))
      await page.locator('.odp-row', { hasText: PICK_ARTIFACT_NAME }).first().click()
      // iframe 探针 404 → 失败行 + Reload 钮（iframe-view failed 分支）
      await page.getByText('The artifact file does not exist or has moved').waitFor({ state: 'visible', timeout: 15000 })
      assert(await page.getByRole('button', { name: 'Reload' }).isVisible(), '失败行应带 Reload 重试钮')
      // 失败行形态下侧栏重新挂载（expanded 复位折叠态）——先展开再查开关禁用态
      await ensureCommentsSidebarExpanded(page)
      // 评论模式开关禁用（未 ready——tooltip 产物加载中）
      const disabledInfo = await page.evaluate(() => {
        const button = document.querySelector('.odp-comments-panel button[aria-label="Comment mode"]')
        return button === null ? null : { disabled: button.disabled, title: button.title }
      })
      assert(disabledInfo !== null && disabledInfo.disabled === true, `拾取不可达时评论模式开关应禁用：${JSON.stringify(disabledInfo)}`)
      assert(disabledInfo.title === 'Artifact loading; picking is not available yet', `禁用 tooltip 应为「产物加载中」文案：${JSON.stringify(disabledInfo.title)}`)
      // 侧栏与伺服解耦：既有线程照常可追加（D3 已接受代价登记）——追加写入最后一条线程的
      // composer（侧栏条目序），断言按文本在任一线程 replies 中寻址
      await page.locator('.odp-reply-composer input.odp-reply-input').last().fill('不可拾取态追加探针')
      await page.locator('.odp-reply-composer button.odp-button').last().click()
      const appendedDeadline = Date.now() + 20000
      let appended = false
      while (Date.now() < appendedDeadline && !appended) {
        appended = readCommentThreads(ws).some((t) => t.replies.some((r) => r.text === '不可拾取态追加探针'))
        if (!appended) await sleep(400)
      }
      assert(appended, `不可拾取态追加应照常落盘：${JSON.stringify(readCommentThreads(ws).map((t) => t.replies.map((r) => r.text)))}`)
    })

    await stepAsync(results, 'comment-anchor·V6⑥b：产物恢复 → Reload 后 iframe 挂载、拾取可用可发首评', async () => {
      fs.writeFileSync(path.join(workspaceReal, PICK_ARTIFACT_NAME), pickArtifactHtml({ title: 'Restored Title' }))
      await page.getByRole('button', { name: 'Reload' }).click()
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
      // iframe 恢复挂载使侧栏 expanded 复位折叠态——展开后再等就绪（拾取脚本 ready 二次握手）
      await ensureCommentsSidebarExpanded(page)
      await page.waitForFunction(
        () => {
          const button = document.querySelector('.odp-comments-panel button[aria-label="Comment mode"]')
          return button !== null && !button.disabled
        },
        undefined,
        { timeout: 20000 },
      )
      await sendCommentViaPick(page, '#main-title', '恢复后首评探针')
      const threads = readCommentThreads(ws)
      assert(threads.length === 3 && threads[2].anchor?.level === 'id', `恢复后拾取首评应落盘：${JSON.stringify(threads.map((t) => t.anchor))}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 u-probe（探针段，wave 0 · opendesign-comment-anchor 设计包；随套件全量运行，承担
 * 驱动形态回归断言——11 步中 8 步硬断言，仅 tab 右键菜单 / 分栏按钮 / 全局句柄三步登记性质）：
 * AS7(b) 宿主形态层 + V11 步④ 驱动性，一场景承载两探针（编号域 = 本设计包，裸用 AS/V 编号）。
 *
 * AS7(b) 判据（AS7 假设的宿主形态半场；(a) 本地语义层已由 probe/as7-local 独立验证）：
 *   伺服产物 iframe（sandbox="allow-scripts"，opaque origin）上 frameLocator 能读元素文本
 *   （id 锚与 data-od-id 锚选择器两形态）、能驱动产物内点击（同文档 DOM 变化为证）；产物
 *   内联脚本 window.parent.postMessage 出站后宿主父页可收（生产面板桥 U4 的通道前提），
 *   且 event.source === iframe.contentWindow 对象同一性成立（D5 来源校验可用的机制前提）。
 *
 * V11 步④ 判据（多实例分支的 e2e 驱动性；结论决定该步由 e2e 承载或降级真机人工验收）：
 *   宿主 dockkit tab 动作（duplicateTab / 分屏）能否程序化触发——三条路径逐次尝试并记录：
 *   ① tab 右键菜单（dockkit DockLayout 菜单，menuitem 由 slot sidebar.right.tab.menu.item
 *   渲染，宿主默认空清单）；② 快捷键 pane.split（dsh-client-shortcuts：web:macos = primary+
 *   Backslash = Meta+\，resolve 需焦点落在 sidebar 内）；③ page.evaluate 全局句柄（宿主
 *   store 是否可达 window）。分屏成功的机器判据 = [data-dockkit-pane] 计数增加。
 *
 * 探针产物不在 fixture 内预置：场景运行时写盘（S12 legacy.html 同款先例），fixture 既有
 * 契约不受探针影响。结论落盘 .tmp/dev-flow/opendesign-comment-anchor/probe/（由 u-probe
 * 单元消费本场景输出登记）。
 */
async function scenarioProbeU() {
  const results = []
  const workspace = makeWorkspaceDir('probe-u')
  seedProbeArtifact(workspace)
  const instance = await withInstance({ label: 'probe-u', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  const { page, home } = instance
  try {
    // ── boot 链（并入套件共享 en 驱动——本文件 openVerifyPageEn 固定 en-US context 后
    // 宿主 chrome 恒英文，u-probe 段此前的 zh 实态抓取选择器（aria=选择工作区 等）随之
    // 退役；zh 形态登记见 probe/as7-frameLocator.md 附带发现与 runlog）────────────

    await stepAsync(results, 'u-probe boot①：en 驱动选工作区 + 选设计 preset + 发消息（共享驱动形态）', async () => {
      await pickWorkspace(page, workspace)
      await pickDesignPreset(page)
      const composer = page.locator('[contenteditable="true"]').first()
      await composer.click()
      await page.keyboard.type('design a landing page for the probe')
      await page.waitForTimeout(300)
      await page.getByRole('button', { name: 'Send message' }).click()
      // 「回合已跑」信号走会话日志通道（system 先 commit 后 request——dsh-agent-loop step()
      // 语义，套件头注）。不用页面 MISSING_CREDENTIAL 文本：其 UI 呈现窗口不稳（引擎核验
      // 轮 45s 超时而回合实际已失败落盘），日志信号与 UI 呈现无关。
      await waitForSessionLog(
        home,
        (_entry, log) => log.systemMessages.some((t) => t.includes(DESIGN_INJECTION_MARK)),
        45000,
      )
      await page.waitForTimeout(1500) // 日志 batch flush 余量
    })

    await stepAsync(results, 'u-probe boot②：材质化标记在盘（评论侧栏挂载前提）+ 右栏设计预览入口进列表 + 点 index.html 行进 iframe', async () => {
      findSessionIdBySystemMark(home, DESIGN_INJECTION_MARK) // 调用即断言：注入会话在盘（缺失抛错）
      const framesReady = path.join(fs.realpathSync(workspace), '.od-frames', DECK_FRAMEWORK_FILE_NAME)
      const deadline = Date.now() + 20000
      while (!fs.existsSync(framesReady) && Date.now() < deadline) await sleep(500)
      assert(fs.existsSync(framesReady), `材质化标记缺席：${framesReady}`)
      await openDesignPanel(page)
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('.odp-row')).some((el) => el.textContent?.trim() === 'index.html'),
        undefined,
        { timeout: 15000 },
      )
      await page.locator('.odp-row').first().click()
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
    })

    // ── 探针本体 ─────────────────────────────────────────────────────────────
    // 探针产物：带 id 锚与 data-od-id 锚属性的交互元素 + 点击后同文档 DOM 变化 + postMessage 出站。
    fs.writeFileSync(path.join(fs.realpathSync(workspace), 'pick-probe.html'), [
      '<!doctype html>',
      '<html lang="en">',
      '<head><meta charset="utf-8" /><title>pick probe</title></head>',
      '<body>',
      '  <section id="hero" data-od-id="hero">',
      '    <h1 id="pick-target">pick me</h1>',
      '    <button id="pick-emit" type="button">emit pick</button>',
      '  </section>',
      '  <script>',
      '    function emitPick() {',
      "      window.parent.postMessage({ v: 1, type: 'odp-pick:picked', payload: { level: 'id', sel: '#pick-target' } }, '*')",
      '    }',
      "    document.getElementById('pick-emit').addEventListener('click', () => {",
      "      document.getElementById('pick-emit').textContent = 'picked!'",
      '      emitPick()',
      '    })',
      "    window.addEventListener('load', () => emitPick())", // ready 握手同通道：载入即出站一次
      '  </script>',
      '</body>',
      '</html>',
    ].join('\n'))

    await stepAsync(results, 'u-probe 步①：返回列表 → 点击 pick-probe.html 行进入 iframe（伺服产物形态就位）', async () => {
      await page.locator('.odp-body .odp-button', { hasText: 'Back to artifact list' }).click()
      const row = page.locator('.odp-row', { hasText: 'pick-probe.html' })
      await row.waitFor({ state: 'visible', timeout: 15000 })
      await row.click()
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
    })

    await stepAsync(results, 'u-probe AS7(b)②：frameLocator 读伺服产物元素文本（id 锚 + data-od-id 锚选择器两形态）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      const byId = await frame.locator('#pick-target').textContent()
      assert(byId === 'pick me', `frameLocator 按 id 锚读文本失败：${JSON.stringify(byId)}`)
      const byData = await frame.locator('[data-od-id="hero"] h1').textContent()
      assert(byData === 'pick me', `frameLocator 按 data-od-id 锚选择器读文本失败：${JSON.stringify(byData)}`)
    })

    await stepAsync(results, 'u-probe AS7(b)③：frameLocator 驱动产物内点击——同文档 DOM 变化为证（emit → picked!）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      await frame.locator('#pick-emit').click()
      await frame.locator('#pick-emit').filter({ hasText: 'picked!' }).waitFor({ timeout: 5000 })
    })

    await stepAsync(results, 'u-probe AS7(b)④：产物 postMessage 出站 → 宿主父页收到 + event.source 对象同一性（D5 校验前提）', async () => {
      await page.evaluate(() => {
        window.__probeInbox = []
        window.addEventListener('message', (event) => {
          window.__probeInbox.push({
            data: event.data,
            originIsNull: event.origin === 'null',
            sourceIsFrame: event.source === document.querySelector('iframe.odp-frame').contentWindow,
          })
        })
      })
      const frame = page.frameLocator('iframe.odp-frame')
      await frame.locator('#pick-emit').click()
      await page.waitForFunction(
        () => Array.isArray(window.__probeInbox) && window.__probeInbox.length >= 2,
        undefined,
        { timeout: 5000 }, // load 时已发一次 ready 同通道报文 + 本次点击 picked = ≥2
      )
      const inbox = await page.evaluate(() => window.__probeInbox)
      const picked = inbox.filter((entry) => entry.data?.type === 'odp-pick:picked')
      assert(picked.length >= 1, `宿主父页未收到 picked 报文：${JSON.stringify(inbox)}`)
      assert(
        picked.every((entry) => entry.originIsNull && entry.sourceIsFrame),
        `出站报文来源判定不对（应 origin 'null' + source 同一性成立）：${JSON.stringify(picked)}`,
      )
      console.log(`    [u-probe 实测] 桥上行 ${inbox.length} 条，形态样例：${JSON.stringify(inbox.at(-1))}`)
    })

    await stepAsync(results, 'u-probe V11④⑤：tab/pane DOM 基准记录（data-dockkit-tab / data-dockkit-pane / data-sidebar-right-*）', async () => {
      const dom = await page.evaluate(() => ({
        tabs: Array.from(document.querySelectorAll('[data-dockkit-tab], [data-sidebar-right-tab]')).map((el) => ({
          text: (el.textContent ?? '').trim().slice(0, 40),
          dockTab: el.dataset.dockkitTab ?? null,
          srTab: el.dataset.sidebarRightTab ?? null,
        })),
        panes: document.querySelectorAll('[data-dockkit-pane]').length,
        floats: document.querySelectorAll('[data-dockkit-float]').length,
        session: document.querySelector('[data-sidebar-right-session]')?.dataset.sidebarRightSession ?? null,
      }))
      assert(dom.tabs.length >= 1, `未找到 dockkit tab 元素（data-dockkit-tab / data-sidebar-right-tab 均空）：${JSON.stringify(dom)}`)
      assert(dom.panes >= 1, `未找到 dockkit pane 元素：${JSON.stringify(dom)}`)
      console.log(`    [u-probe 实测] DOM 基准：${JSON.stringify(dom)}`)
    })

    await stepAsync(results, 'u-probe V11④⑥：tab 右键菜单可开性与菜单项清单（duplicateTab 的 UI 入口探测）', async () => {
      const tab = page.locator('[data-dockkit-tab], [data-sidebar-right-tab]').first()
      await tab.click({ button: 'right' })
      await page.waitForTimeout(600)
      const menu = await page.evaluate(() => {
        const menus = Array.from(document.querySelectorAll('[role="menu"]')).filter((el) => el.offsetWidth > 0)
        return menus.map((el) => ({
          items: Array.from(el.querySelectorAll('[role="menuitem"]')).map((item) => ({
            text: (item.textContent ?? '').trim(),
            disabled: item.disabled === true,
          })),
        }))
      })
      console.log(`    [u-probe 实测] tab 右键菜单：${JSON.stringify(menu)}`)
      await page.keyboard.press('Escape')
      results.push({ name: '（登记）菜单探测输出见运行日志——有 Duplicate/Split 项即可点击驱动，空清单则该入口不可驱动', ok: true })
    })

    await stepAsync(results, 'u-probe V11④⑥b：面板 chrome「Split/分栏」按钮路径实测（登记形态：结论不改裁决，快捷键为机器判据；en-US 宿主 aria=Split）', async () => {
      try {
        const splitBtn = page.locator('button[aria-label="Split"], button[aria-label="分栏"]')
        const visible = await splitBtn.first().isVisible().catch(() => false)
        const disabled = visible ? await splitBtn.first().isDisabled() : null
        if (visible && disabled === false) {
          const before = await page.evaluate(() => document.querySelectorAll('[data-dockkit-pane]').length)
          await splitBtn.first().click()
          await page.waitForTimeout(900)
          const after = await page.evaluate(() => document.querySelectorAll('[data-dockkit-pane]').length)
          console.log(`    [u-probe 实测] 「分栏」按钮：pane ${before} → ${after}${after > before ? '（按钮路径可驱动）' : '（点击未分屏）'}`)
          if (after > before) {
            // 还原（关掉第二 pane）给快捷键路径一个干净前提：dockkit 关闭按钮（aria=关闭）作用于分屏后的 tab。
            const closeBtn = page.locator('button[aria-label="Close"], button[aria-label="关闭"]').last()
            if (await closeBtn.isVisible().catch(() => false)) {
              await closeBtn.click()
              await page.waitForTimeout(700)
              const restored = await page.evaluate(() => document.querySelectorAll('[data-dockkit-pane]').length)
              console.log(`    [u-probe 实测] 关闭按钮还原：pane → ${restored}`)
            }
          }
        } else {
          console.log(`    [u-probe 实测] 「分栏」按钮不可用（visible=${visible} disabled=${disabled}）——按钮路径不可驱动`)
        }
      } catch (error) {
        console.log(`    [u-probe 实测] 「分栏」按钮路径异常（登记不改裁决）：${error instanceof Error ? error.message : String(error)}`)
      }
      results.push({ name: '（登记）分栏按钮路径输出见运行日志', ok: true })
    })

    await stepAsync(results, 'u-probe V11④⑦：快捷键分屏驱动（焦点落 tab → Meta+\\ → pane 计数增加）', async () => {
      const before = await page.evaluate(() => document.querySelectorAll('[data-dockkit-pane]').length)
      await page.locator('[data-dockkit-tab], [data-sidebar-right-tab]').first().click() // 焦点落 sidebar（resolve 的 focusedTarget 前提）
      await page.keyboard.press('Meta+\\') // dsh-client-shortcuts normalizeBinding：web:macos primary = meta
      await page.waitForTimeout(900)
      const after = await page.evaluate(() => document.querySelectorAll('[data-dockkit-pane]').length)
      console.log(`    [u-probe 实测] Meta+\\ 分屏：pane ${before} → ${after}`)
      assert(after > before, `Meta+\\ 未触发分屏（pane ${before} → ${after}）——快捷键路径不可驱动或焦点前提不成立`)
    })

    await stepAsync(results, 'u-probe V11④⑧：page.evaluate 全局句柄探测（宿主 store/dockkit 是否可达 window）', async () => {
      const globals = await page.evaluate(() => Object.keys(window).filter((key) => /dsh|dock|store|sidebar/i.test(key)))
      console.log(`    [u-probe 实测] window 上 dsh/dock/store/sidebar 相关键：${JSON.stringify(globals)}`)
      results.push({ name: '（登记）全局句柄清单见运行日志——空清单 = page.evaluate 无 API 注入路径', ok: true })
    })
  } finally {
    await instance.close()
  }
  return results
}

// ── 主编排 ───────────────────────────────────────────────────────────────────

/** 全局看门狗：卡死（等待永不返回）时按 PID 清场并以失败退出，不留孤儿 dsh（预算随锚点场景七组扩容至 24 场景）。 */
const WATCHDOG_MS = 75 * 60 * 1000
const watchdog = setTimeout(() => {
  console.error(`\n[e2e watchdog] ${WATCHDOG_MS}ms 全局预算耗尽，按 PID 清场退出`)
  for (const pid of [...livePids]) void killProcessTree(pid)
  process.exit(1)
}, WATCHDOG_MS)
watchdog.unref()

try {
  console.log(`[e2e] 仓根：${REPO_ROOT}`)
  console.log(`[e2e] 运行根：${RUN_ROOT}（KEEP_E2E_STATE=1 时保留）`)
  console.log('[e2e] 准备模板 home（安装两包，一次性 pnpm 成本）…')
  await ensureTemplateHome()
  console.log('[e2e] 模板就绪\n')

  const scenarios = [
    ['S1 V1+V3+V4注入 roster+注入四新段+默认会话+材质化5文件', scenarioV1],
    ['S2+S3 V5前八节+⑨降级+⑩未登记+⑪监听 面板+探针+doctor', scenarioPanelAndDoctor],
    ['S2b V5⑨非降级 rich-assets 丰富度清点', scenarioDoctorRich],
    ['S3 V2+V10 质量环回注+指纹去重+陌生既有文件', scenarioQualityLoop],
    ['S4 V7 非设计会话零侵入', scenarioStandardZeroIntrusion],
    ['S5 V6无资产+SI3', scenarioNoAssets],
    ['S6 V1·V6 漂移', scenarioDrift],
    ['S7 V9+V1·RL7 resume 代际重组+检查环不变量', scenarioResume],
    ['S8 V1·V11 项目目录写入形态（5 管理名）', scenarioProjectWrites],
    ['S9 V1·A9/A10/A11 shell 包共存回归（runner 串接）', scenarioShellCoexistRegression],
    ['S10 comment-loop·V1+anchor·V1 拾取桥全路径首评 悬停/锚点行/落盘anchor/回注含anchor/徽章+doctor⑫两形态+在轨', scenarioCommentLoopV1],
    ['S11 comment-loop·V3 无活Agent边界（重启未开404零落盘/重开200如实投递）', scenarioCommentNoAgent],
    ['S12 comment-loop·V5 普通会话侧栏零出现+路由不判型', scenarioStandardSessionNoComments],
    ['S13 comment-loop·V6 resolve→reply重开（拾取首评置态）+产物重写/删除边界', scenarioCommentResolveReply],
    ['S14 comment-loop·V10 steer前置评论投递（AS9探针载体，拾取入口）', scenarioCommentSteer],
    ['S15 comment-loop·V4 写通道安全（无凭据/不可信Host-Origin/越界载荷+anchor负路径三形态）', scenarioCommentSecurity],
    ['P2 anchor·V2 三级降级三载体（id/data-od-id/path链）+徽章三枚+侧栏三级别名', scenarioAnchorLevels],
    ['P3 anchor·V3 联动定位高亮+删id改稿后失效标注（Locate禁用）+对照条目不受影响', scenarioAnchorLocateAndMiss],
    ['P4 anchor·V3③+V8①③+RL7 改稿可见性（≤6s ready二次握手+徽章重建id/data命中+path级失效如实标注）', scenarioAnchorRewriteVisibility],
    ['P5 anchor·V4+V5+V11 布局联动（自动收起/还原恰一次/列表往返不重放/保活切走切回/硬边界矩阵/分屏双实例）', scenarioAnchorLayout],
    ['P6 anchor·V7+RL2/RL3 注入完整性（sandbox逐字/响应=磁盘+注入/HEAD无body+ETag/非HTML与设备壳不注/顶层直开零UI）', scenarioAnchorInjection],
    ['P7 anchor·RL5 桥契约负路径（错v/错前缀双向静默+合法对照连通）', scenarioAnchorNegativePaths],
    ['P8 anchor·V6+D3 入口唯一化（无直发框/追加resolve可用/失败回执可见可重发/产物不可拾取降级与恢复）', scenarioAnchorEntryUniqueness],
    ['u-probe AS7frameLocator伺服桥+V11④dockkit驱动性（opendesign-comment-anchor 探针段）', scenarioProbeU],
  ]

  // 场景子集筛选（排障/单场景复跑）：E2E_ONLY=S10,S13（按标题首段 id 匹配，缺省全跑）。
  const only = (process.env.E2E_ONLY ?? '').split(',').map((token) => token.trim()).filter((token) => token !== '')
  const outcome = []
  for (const [title, runner] of scenarios) {
    if (only.length > 0) {
      const ids = title.split(' ')[0].split('+')
      if (!ids.some((id) => only.includes(id))) continue
    }
    console.log(`\n=== ${title} ===`)
    try {
      const results = await runner()
      const failed = results.filter((r) => !r.ok)
      outcome.push({ title, ok: failed.length === 0, total: results.length, failed })
    } catch (error) {
      outcome.push({ title, ok: false, total: 0, failed: [{ name: '(场景级异常)', error }] })
      console.log(`    ✗ 场景级异常：${error instanceof Error ? error.stack : String(error)}`)
    }
  }

  console.log('\n════════ e2e 汇总 ════════')
  let green = 0
  for (const entry of outcome) {
    const mark = entry.ok ? 'PASS' : 'FAIL'
    if (entry.ok) green += 1
    console.log(`${mark}  ${entry.title}（断言 ${entry.total - entry.failed.length}/${entry.total}）`)
    for (const failure of entry.failed) {
      console.log(`      失败步骤：${failure.name}`)
      console.log(`        ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`)
    }
  }
  console.log(`\n合计：${green}/${outcome.length} 场景绿；运行根：${RUN_ROOT}${KEEP_STATE ? '（保留）' : ''}`)

  if (green === outcome.length && KEEP_STATE !== '1') {
    fs.rmSync(RUN_ROOT, { recursive: true, force: true })
  }
  process.exit(green === outcome.length ? 0 : 1)
} catch (error) {
  console.error(`\n[e2e] 套件级失败：${error instanceof Error ? error.stack : String(error)}`)
  for (const pid of [...livePids]) await killProcessTree(pid)
  process.exit(1)
}
