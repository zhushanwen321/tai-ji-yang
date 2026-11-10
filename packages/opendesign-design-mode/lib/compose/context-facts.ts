/**
 * 基本事实块生成（设计 §3.1 会话组装层「基本事实块」最小集合；权威依据 = 任务书 U3 职责 3）。
 *
 * 形态对齐 OD 的 stable context 注入块（composeOdNextStrategyStableRequestContextV2）：
 * `<od-next-context kind="fact" name="...">` 包 JSON 体，体内的结束标签转义。OD 注入块
 * 还有 platform/project/template/example 等大量宿主侧字段——V1 一律不复制（daemon 侧才有
 * 的运行时事实，DSH 会话没有对应来源，编造即污染），只保留两个最小字段：
 *
 *   - device-frames：设备壳可用性——三壳已在会话工作目录 .od-frames/ 就位（U5 材质化器
 *     会话创建时无条件重铺），壳的选择按 prototype 任务档的对照表由模型按用户 brief 判定
 *     （V1 无 daemon 平台解析，OD 的「选中壳 + 壳源文注入」形态不可达，可达形态 = 全量
 *     可用性 + 自查指引）；
 *   - layout-primitives：layout.css 指针——指向材质化副本路径，不引 CSS 原文进提示词
 *     （OD 把全文注入是 daemon 已持文本的顺带行为；DSH 模型有文件工具，指针 + 自读等价
 *     且省 50K 提示词）。
 *
 * deck-framework 槽（opendesign-assets-quality D9）：deck 协议的实际供给形态 = 材质化铺盘文件——材质化器把
 * lib/protocols/deck.ts 派生的协议登记文本铺进 `.od-frames/deck-framework.md`（材质化器
 * 写清单第 5 个文件，AX3 范围化例外：版本锚 + doctor 对账），协议文本含整页骨架 HTML、
 * 不进提示词注入，模型经任务档路由段 ppt 条目指针（task-routing.ts 的 opendesign-assets-quality D9 段）自读全文——
 * 体积分档裁决见 copy.ts 文件头 opendesign-assets-quality D9 段。本模块的注入块接口（可选入参
 * {@link ContextFactsInput.deckFrameworkDirective}）保留为不供给的备用槽：组装链路
 * （bundle.ts）不传该入参，deck 注入块不出现在提示词。
 *
 * craft 指路块（D1 指路自读形态，opendesign-assets-quality U2）：`kind="fact" name="craft"`
 * 事实块给 craft/ 根绝对路径 + 消费指引（读形状包 SKILL.md 的 craft.requires → 逐册自读
 * `craft/<slug>.md` 并遵循）——选择权在模型自读，与任务档路由 / 设计系统自读同构（D1 采用
 * 形态，插件零缓存零注入状态）。craft 目录缺失时指路块整体省略（显式降级，AX5）——由组装层
 * （bundle.ts）按探测结果决定是否传入 craftRoot，本模块对缺席入参不渲染该块。
 */
import { OD_FRAMES_DIR, MATERIALIZED_FILE_NAMES } from '../materialize/copy.js'

/** 设备壳三文件管理名（MATERIALIZED_FILE_NAMES 去掉 layout.css；顺序 = 材质化器同源清单序）。 */
const SHELL_FILE_NAMES = MATERIALIZED_FILE_NAMES.filter((name) => name !== 'layout.css')

/** 一个事实/指令注入块（OD stable context 的最小形态）。 */
interface OdContextBlock {
  kind: 'fact' | 'instruction'
  name: string
  body: string
}

/** 注入体内结束标签的转义（OD 同款：防止体内容提前闭合注入块）。 */
function escapeContextBody(body: string): string {
  return body.replace(/<\/od-next-context>/gi, '&lt;/od-next-context>')
}

/** 渲染一个注入块（OD 同构：标签 + 换行 + 体 + 换行 + 结束标签）。 */
function renderBlock(block: OdContextBlock): string {
  return [
    `<od-next-context kind="${block.kind}" name="${block.name}">`,
    escapeContextBody(block.body),
    '</od-next-context>',
  ].join('\n')
}

/** 键序确定的 JSON（fact 体形态对齐 OD 的 stableJson；键排序保证组装产物可对账）。 */
function stableJson(value: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) sorted[key] = value[key]
  return JSON.stringify(sorted)
}

/** 事实块组装入参。 */
export interface ContextFactsInput {
  /**
   * deck 协议指令文本（注指令块形态的内容槽；缺省 = 不出 deck 注入块）。
   * deck 协议供给已定档材质化铺文件形态（opendesign-assets-quality D9，见文件头注释）——组装链路不传该入参，
   * 本槽保留为不供给的备用槽。
   */
  deckFrameworkDirective?: string
  /**
   * craft/ 目录绝对路径（U2 craft 指路块，D1）。undefined / null / 空串 = 指路块整体
   * 省略（craft 目录缺失的显式降级形态，AX5）——组装层按探测结果传入。
   */
  craftRoot?: string | null
}

/**
 * 生成基本事实块段（多块换行连接；OD 的 stable context 多块同形态）。
 *
 * @returns 事实块段文本（至少含设备壳可用性与 layout-primitives 指针两块）。
 */
export function renderContextFacts(input: ContextFactsInput = {}): string {
  const blocks: OdContextBlock[] = [
    {
      kind: 'fact',
      name: 'device-frames',
      body: stableJson({
        note: 'All three handset shells are staged in the project directory. Pick the shell by the user brief following the prototype task profile shell table; web, responsive, and desktop targets use no shell.',
        root: OD_FRAMES_DIR,
        shells: SHELL_FILE_NAMES.map((name) => `${OD_FRAMES_DIR}/${name}`),
      }),
    },
    {
      kind: 'fact',
      name: 'layout-primitives',
      body: stableJson({
        note: 'Structure-only layout primitives (@layer od-layout) staged beside the shells. Read the file with your file tools and inline it as the first rule set of the document per the prototype task profile.',
        path: `${OD_FRAMES_DIR}/layout.css`,
      }),
    },
  ]
  if (input.craftRoot != null && input.craftRoot.trim() !== '') {
    // craft 指路块（D1）：根绝对路径 + 消费指引，自产措辞（AX3 不约束自产文本）。
    // 册清单不注入——craft.requires 的 slug 即文件名，手册单册缺失由模型自读报错自然跳过。
    blocks.push({
      kind: 'fact',
      name: 'craft',
      body: stableJson({
        note:
          'Shape templates may declare craft.requires in their SKILL.md frontmatter. '
          + 'After choosing a shape template, read each listed manual file from this '
          + 'directory with your file tools (root/<slug>.md) and follow it while '
          + 'producing the deliverable.',
        root: input.craftRoot,
      }),
    })
  }
  if (input.deckFrameworkDirective !== undefined && input.deckFrameworkDirective.trim() !== '') {
    // deck 备用槽（opendesign-assets-quality D9：实际供给走材质化铺文件，本注入块槽不供给，见文件头注释）：
    // OD 同构守卫句 + 指令文本。
    blocks.push({
      kind: 'instruction',
      name: 'deck-framework',
      body:
        "Apply this host protocol only when creating or editing an HTML deck. Its presence does not request a deck or override the user's requested deliverable.\n\n"
        + input.deckFrameworkDirective,
    })
  }
  return blocks.map(renderBlock).join('\n')
}
