/**
 * 协议派生文本的版本锚登记与比对纯函数（AX3 例外的对账义务承载，D7；U3a）。
 *
 * AX3 范围化例外：安装盘无静态源、正源在 OD 源码仓的 daemon/contracts 侧协议文本
 * （panel 评审团协议、deck 协议）允许派生副本进 lib/protocols/，每份必须带版本锚
 * （正源仓 URL + commit + 提取日期 + 骨架 sha256），并在 doctor 协议对账节暴露漂移
 * ——登记-锚-对账三件套：本模块只承载「登记」与「比对」两个纯函数，对账的
 * 触达通道归 doctor ⑩（U6 消费）。
 *
 * 对账比对基准 = 协议骨架文本：正源渲染模板剔除插值后的静态部分（panel 以
 * {{token}} 标记承载插值点；deck 铺盘全文无 cfg 插值，全文即骨架）。骨架 sha256
 * 是唯一可稳定比对的形态——正源 renderPanelPrompt 是依赖输入的渲染函数而非纯常量
 * （走查缺口 edge#3 口径）。登记的 skeletonSha256 是提取时点的字面量（非运行时
 * 计算）：doctor 用它比对本机 clone 提取的正源骨架哈希给 ok/drift；运行时重算本地
 * 哈希没有对账价值（本地副本永远与自身一致）。本机 clone 探测（git rev-parse
 * --show-toplevel）与「无法比对」降级态归 doctor 侧（GPK1），本模块不碰文件系统。
 *
 * 消费方：doctor ⑩ 协议对账节（U6）；tests/protocols.test.ts 锚自洽断言
 * （本仓骨架被编辑而锚未重登记时红灯——防仓内副本静默漂移出登记锚）。
 */
import { createHash } from 'node:crypto'

import { renderDeckFrameworkFile } from './deck.js'
import { PANEL_PROTOCOL_SKELETON } from './panel.js'

/** 已登记版本锚的协议标识。 */
export type ProtocolId = 'panel' | 'deck'

/**
 * 版本锚四要素（D7 采用形态：正源仓 URL / commit hash / 提取日期 / 骨架 sha256）。
 * 全部为提取时点的登记字面量；改动任一协议文本须同步重登记（tests/protocols.test.ts
 * 的锚自洽断言兜底）。
 */
export interface ProtocolVersionAnchor {
  /** 协议标识。 */
  protocol: ProtocolId
  /** 正源仓 URL（Apache-2.0；出处标注义务随派生文本文件头一并登记）。 */
  sourceRepoUrl: string
  /** 提取时点的正源 commit hash（40 hex）。 */
  commit: string
  /** 提取日期（ISO 日历日）。 */
  extractedAt: string
  /** 骨架文本 sha256（UTF-8，64 hex；提取时点字面量）。 */
  skeletonSha256: string
}

/** 登记条目 = 版本锚 + 本仓骨架文本（比对的本地侧）+ 骨架口径说明（doctor 复述用）。 */
export interface RegisteredProtocolAnchor extends ProtocolVersionAnchor {
  /** 本仓登记的骨架文本（延迟取值——panel/deck 模块常量在此汇聚）。 */
  skeleton(): string
  /** 骨架口径的一句话说明（doctor ⑩ 报告复述；与提取脚本口径一致）。 */
  skeletonBasis: string
}

/** 正源仓 URL（panel 与 deck 同仓，D7 证据）。 */
export const PROTOCOL_SOURCE_REPO_URL = 'https://github.com/nexu-io/open-design'

/** 提取时点的正源 commit（两协议同批提取）。 */
export const PROTOCOL_SOURCE_COMMIT = '20c49e75c9164bb592cfc299d366884ed79f9914'

/** 提取日期。 */
export const PROTOCOL_EXTRACTED_AT = '2026-11-10'

/**
 * 版本锚登记处（唯一权威登记清单；新增协议副本在此追加条目）。
 * sha256 字面量来源 = 提取时点对骨架文本的计算记录（tests/protocols.test.ts 以
 * computeSkeletonSha256(本仓骨架) 复核——两处不一致即红灯）。
 */
export const PROTOCOL_VERSION_ANCHORS: readonly RegisteredProtocolAnchor[] = [
  {
    protocol: 'panel',
    sourceRepoUrl: PROTOCOL_SOURCE_REPO_URL,
    commit: PROTOCOL_SOURCE_COMMIT,
    extractedAt: PROTOCOL_EXTRACTED_AT,
    skeletonSha256: '03efc005cedb33d61194b80b73f37d28dc517d762deff9f94fb3e575765569d0',
    skeleton: () => PANEL_PROTOCOL_SKELETON,
    skeletonBasis:
      'renderPanelPrompt 渲染模板剔除插值后的静态部分（插值点以 {{token}} 标记承载；' +
      '正源 apps/daemon/src/prompts/panel.ts）',
  },
  {
    protocol: 'deck',
    sourceRepoUrl: PROTOCOL_SOURCE_REPO_URL,
    commit: PROTOCOL_SOURCE_COMMIT,
    extractedAt: PROTOCOL_EXTRACTED_AT,
    skeletonSha256: 'bfcbae696a6a0f45b10d67f7e34b0427ea1018a6922e1451311d04efbe6144f0',
    skeleton: () => renderDeckFrameworkFile(),
    skeletonBasis:
      '.od-frames/deck-framework.md 铺盘全文（组文结构与 daemon device-frames.ts 同构；' +
      'handoff 固定 filesystem，无其余插值；正源 packages/contracts/src/prompts/deck-framework.ts）',
  },
]

/** 骨架文本 sha256（UTF-8；与提取口径一致）。 */
export function computeSkeletonSha256(skeleton: string): string {
  return createHash('sha256').update(skeleton, 'utf8').digest('hex')
}

/** 单协议比对结局（ok = 与登记锚一致；drift = 漂移）。 */
export type SkeletonAnchorStatus = 'ok' | 'drift'

/** 比对产物：结局 + 双方哈希（drift 时 doctor 报告逐哈希呈现，便于定位漂移侧）。 */
export interface SkeletonAnchorComparison {
  status: SkeletonAnchorStatus
  /** 登记锚哈希（提取时点）。 */
  expectedSha256: string
  /** 被比对骨架的实际哈希。 */
  actualSha256: string
}

/**
 * 比对一份骨架文本对登记锚（纯函数，不碰文件系统）。
 *
 * @param protocol 协议标识（未登记抛错——调用方传错协议名是编程错误，fail-fast）。
 * @param skeleton 被比对骨架文本（通常 = doctor 从本机 clone 按同口径提取的正源骨架；
 *   传本仓登记骨架即自检，tests 消费）。
 * @returns ok / drift + 双方哈希。
 */
export function compareSkeletonAnchor(protocol: ProtocolId, skeleton: string): SkeletonAnchorComparison {
  const anchor = PROTOCOL_VERSION_ANCHORS.find((entry) => entry.protocol === protocol)
  if (anchor === undefined) {
    throw new Error(`compareSkeletonAnchor: 未登记的协议 ${protocol}（登记处 = PROTOCOL_VERSION_ANCHORS）`)
  }
  const actualSha256 = computeSkeletonSha256(skeleton)
  return {
    status: actualSha256 === anchor.skeletonSha256 ? 'ok' : 'drift',
    expectedSha256: anchor.skeletonSha256,
    actualSha256,
  }
}
