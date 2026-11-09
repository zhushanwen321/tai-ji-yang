/**
 * lifecycle 场景：卸载回落（V5 的真实宿主验收）。
 *
 * 前置：只能对隔离 profile 跑（需要 --dsh-bin + --dsh-home 自启模式）——场景要执行
 * `dsh plugin remove`，对用户真实 profile 执行是事故；--url 模式整场景 degrade 并给
 * 恢复动作，绝不静默跳过。
 *
 * 断言范围（README 卸载契约：三处痕迹随卸载全部消失）：
 *  1. 基线：品牌栈在场（卸载前装配正常）
 *  2. `dsh plugin --profile <p> remove tai-ji-yang-shell` 成功（web profile 有 HMR，
 *     运行中移除生效；宿主返回 restart-required 时按实际状态 degrade，不把「文件已写入」
 *     当「已生效」）
 *  3. reload 后品牌栈消失 + 页面无任何 taiji- 前缀元素残留（覆盖层/槽位/注入三处痕迹清零）
 *  4. reload 后页面不崩（root 有内容、无新增致命错误）
 *  5. --dump-config 不再含本包组合层
 *
 * 禁用（disable）回落：当前 DSH CLI 无 disable 子命令（bundles 启停只在宿主插件页），
 * 通道缺失 → 显式 notProvable + degrade + 恢复动作，不假 pass。
 * 卸载后 profile 上曾点选配色会留宿主侧悬空 patch 行（README 排障 8，宿主对任何声明
 * Config 插件的统一行为）——本场景不对隔离新 profile 的该宿主行为判成败。
 */
import { bootInto, collectBrand } from '../lib/browser.mjs'
import { runDshCommand } from '../lib/dsh-process.mjs'

export const meta = {
  id: 'lifecycle',
  title: '卸载回落',
  description: 'remove → reload → 品牌栈消失 / taiji 痕迹清零 / 页面不崩；禁用通道缺失显式登记',
}

const PLUGIN_ID = 'tai-ji-yang-shell'

export async function run(ctx) {
  const { page, recorder, ev, log, mode, dsh } = ctx

  // 前置：自启模式 + 隔离 home。--url 模式不执行任何卸载。
  if (mode !== 'dsh' || dsh === null) {
    // URL 模式不拥有实例生命周期，不能卸载；这是通道限制，登记降级而非制造失败断言。
    ev.notProvable('URL 模式无法执行卸载（runner 不拥有实例生命周期）')
    ev.degrade('lifecycle 前置缺失：--url 模式不持卸载权限',
      '用 --dsh-bin <dsh> --dsh-home <临时目录> 自启隔离实例重跑 lifecycle 场景')
    ev.attach('console.txt', recorder.text())
    return
  }

  // 1. 基线：装配正常
  const baseline = await collectBrand(page)
  ev.assert('卸载前品牌栈在场（基线）', baseline.stackText !== null, {
    expected: '.taiji-brand-stack 渲染',
    actual: baseline.stackText === null ? '缺席（卸载断言将无对照基线）' : '在场',
  })
  if (baseline.stackText === null) {
    ev.degrade('卸载基线缺失：品牌栈本就不在场（先修装配再验卸载）',
      '先跑 brand 场景定位装配失败原因（profile 类型 / lib 产物 / 槽位注册）')
    return
  }

  // 2. 卸载（只对隔离 home 执行）；崩溃断言只看卸载动作之后，不吃同会话早期噪音。
  const crashBaseline = recorder.entries.length
  const remove = runDshCommand({ dshBin: dsh.dshBin, dshHome: dsh.dshHome, args: ['plugin', '--profile', dsh.profile, 'remove', PLUGIN_ID] })
  ev.attach('dsh-remove-output.txt', [
    remove.stdout,
    remove.stderr,
    ...(remove.error !== undefined ? [`spawn/error: ${remove.error}`] : []),
  ].join('\n'))
  ev.step({ step: 'lifecycle.remove', exitCode: remove.status === 0 ? 0 : 1, stats: { status: remove.status } })
  if (remove.status !== 0) {
    const restartRequired = /restart-required|restartReason|no-hmr|stop-profile/i.test(`${remove.stdout}${remove.stderr}`)
    if (restartRequired) {
      ev.degrade('卸载返回 restart-required（宿主要求停机重启后才移除生效）',
        `停掉自启实例后重跑：runner 会重新 add + 启动；或停机后手工执行 dsh plugin --profile ${dsh.profile} remove ${PLUGIN_ID} 再启动`)
    } else {
      ev.assert('dsh plugin remove 成功', false, {
        expected: 'exit 0',
        actual: `exit ${remove.status}；详见附件 dsh-remove-output.txt`,
      })
    }
    return
  }
  ev.assert('dsh plugin remove 成功', true, { expected: 'exit 0', actual: 'exit 0' })

  // 3. reload 后回落（等待 HMR 生效后整页重载）
  await page.waitForTimeout(1500)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await bootInto(page, { waitForBrand: false })
  const after = await collectBrand(page)
  ev.step({ step: 'lifecycle.reload', stats: { stackText: after.stackText, taijiElementCount: after.taijiElementCount } })

  ev.assert('卸载后品牌栈消失（回落宿主原生品牌）', after.stackText === null, {
    expected: '.taiji-brand-stack 不在场',
    actual: after.stackText === null ? '已消失' : `仍在场（${String(after.stackText).slice(0, 40)}）——HMR 未生效或卸载未落地`,
  })
  ev.assert('页面无 taiji- 前缀元素残留（三处痕迹清零）', after.taijiElementCount === 0, {
    expected: '0',
    actual: String(after.taijiElementCount),
  })

  // 类名清零覆盖不到独立痕迹：样式节点与 Node 半场注入的 global 也要显式消失。
  const residue = await page.evaluate(() => ({
    styleTag: document.getElementById('tai-ji-yang-shell-styles'),
    heroStyleTag: document.querySelector('style[data-taiji-hero]'),
    shellInfo: globalThis.__TAIJI_SHELL_INFO__,
  }))
  ev.assert('卸载后样式注入节点消失', residue.styleTag === null, {
    expected: '#tai-ji-yang-shell-styles 不在场',
    actual: residue.styleTag === null ? '已消失' : '仍在 document 中',
  })
  ev.assert('卸载后 hero 宿主标题隐藏样式消失', residue.heroStyleTag === null, {
    expected: 'style[data-taiji-hero] 不在场',
    actual: residue.heroStyleTag === null ? '已消失' : '仍在 document 中',
  })
  ev.assert('卸载后壳信息 global 消失', residue.shellInfo === undefined, {
    expected: 'globalThis.__TAIJI_SHELL_INFO__ = undefined',
    actual: residue.shellInfo === undefined ? 'undefined' : JSON.stringify(residue.shellInfo).slice(0, 160),
  })

  // 4. 页面不崩（root 有内容；无新增致命错误）
  const rootContent = await page.evaluate(() => {
    const root = document.getElementById('root')
    return root === null ? 0 : root.querySelectorAll('*').length
  })
  ev.assert('卸载后页面未白屏（root 有内容）', rootContent > 0, {
    expected: '> 0',
    actual: String(rootContent),
  })
  const crashes = recorder.slotCrashesSince(crashBaseline)
  ev.assert('卸载过程无 Slot 崩溃', crashes.length === 0, {
    expected: '0 条',
    actual: crashes.length === 0 ? '0 条' : crashes.slice(-3).map((c) => c.text.slice(0, 160)).join(' | '),
  })

  // 5. 组合层消失（--dump-config 不再含本包层；desktop profile 拒绝 dump，按实际状态处理）
  const dump = runDshCommand({ dshBin: dsh.dshBin, dshHome: dsh.dshHome, args: ['--profile', dsh.profile, '--dump-config'] })
  ev.attach('dsh-dump-config.txt', [
    dump.stdout,
    dump.stderr,
    ...(dump.error !== undefined ? [`spawn/error: ${dump.error}`] : []),
  ].join('\n'))
  const dumpOutput = `${dump.stdout}\n${dump.stderr}`
  const knownDumpRefusal = dump.status !== 0 && dump.error === undefined
    && /unknown option|invalid option|not supported|does not support/i.test(dumpOutput)
  if (dump.status === 0) {
    ev.assert('--dump-config 不再含本包组合层', !dump.stdout.includes(`# == ${PLUGIN_ID}`), {
      expected: `不含 "# == ${PLUGIN_ID}"`,
      actual: dump.stdout.includes(`# == ${PLUGIN_ID}`) ? '本包层仍在组合输出中' : '已消失',
    })
  } else if (knownDumpRefusal) {
    ev.degrade('--dump-config 被该宿主/profile 明确拒绝，组合层消失未验证',
      '用 dsh --profile <p> --dump-config 手工核对；desktop profile 由应用独占管理，属预期拒绝')
  } else {
    ev.assert('--dump-config 执行成功', false, {
      expected: 'exit 0 或宿主明确拒绝 dump',
      actual: `exit ${dump.status ?? 'signal'}${dump.error !== undefined ? `；spawn/error: ${dump.error}` : '；详见附件 dsh-dump-config.txt'}`,
    })
  }

  // 禁用通道缺失：显式登记，不假 pass（通道事实记 notProvable；判定层据此 degraded）
  ev.notProvable('禁用（disable）回落：当前 DSH CLI 无 disable 子命令（bundles 启停只在宿主插件页手工通道）')
  ev.degrade('禁用回落未验证：无 CLI 通道',
    '在宿主插件页手工禁用本包后 reload 页面核对回落（包侧机制与卸载同构：全部贡献点挂 ctx.effect 随 fiber 卸载撤销）；DSH 未来提供 CLI 后扩展本场景')

  await ev.shot(page, 'lifecycle-after-remove')
  ev.attach('console.txt', recorder.text())
  log('lifecycle 场景完成')
}
