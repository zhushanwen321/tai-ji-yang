/**
 * 浏览器半场驱动：Playwright 连接测试实例、通用进页流程（boot）、控制台收集、
 * DOM 探针。选择器全部来自本仓 client/ 源码的类名（taiji- 前缀）与宿主结构属性，
 * 不含本机绝对路径、不含具体端口 / token。
 *
 * 「禁止读个人浏览器 profile」：这里始终用 chromium.launch() 全新临时上下文
 * （Playwright 默认即全新 profile），绝不传 userDataDir / channel 指向用户浏览器。
 */

/** 控制台与页面错误收集器：Slot 崩溃检测与证据附件共用同一份记录。 */
export function createConsoleRecorder(page) {
  const entries = []
  page.on('console', (message) => {
    entries.push({
      kind: 'console',
      level: message.type(),
      text: message.text(),
      at: new Date().toISOString(),
    })
  })
  page.on('pageerror', (error) => {
    entries.push({
      kind: 'pageerror',
      level: 'error',
      text: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      at: new Date().toISOString(),
    })
  })
  return {
    entries,
    /** 控制台文本行（证据附件形态）。 */
    text() {
      return entries.map((e) => `[${e.at}] [${e.kind}/${e.level}] ${e.text}`).join('\n')
    },
    /**
     * Slot 崩溃判定：宿主槽位渲染抛错会以 pageerror 或 error 级 console 出现，
     * 文本带 slot/cordis/render 特征词。白名单排除资源加载噪音（404 favicon 等）。
     */
    slotCrashes() {
      const NOISE_RE = /favicon|net::ERR_|Failed to load resource/
      return entries.filter(
        (e) => e.level === 'error' && !NOISE_RE.test(e.text),
      )
    },
    /** 从指定序号起判崩溃：lifecycle 用它把断言作用域切到卸载动作之后。 */
    slotCrashesSince(fromIndex) {
      return this.slotCrashes().filter((e) => entries.indexOf(e) >= fromIndex)
    },
  }
}

/**
 * 通用进页流程（从临时验证脚本 bootInto 转化的可维护形态）：
 * 首次进入有两道门（Internal Testing Notice 的 Continue、API key 的 Configure later），
 * 逐个点掉 → 等品牌栈（浏览器半场装配完成的可见信号）→ Escape 关登录墙（无墙时静默）。
 * 只点通用门类按钮，不发送任何输入（不触发模型请求）。
 * @param {import('playwright').Page} page
 * @param {{ timeoutMs?: number, waitForBrand?: boolean }} [options]
 */
export async function bootInto(page, { timeoutMs = 30000, waitForBrand = true } = {}) {
  for (let i = 0; i < 8; i += 1) {
    const gate = page.locator('button:visible', { hasText: /Continue|Configure later|稍后|继续/i }).first()
    if (await gate.isVisible().catch(() => false)) {
      await gate.click().catch(() => {})
      await page.waitForTimeout(400)
      continue
    }
    break
  }
  if (waitForBrand) {
    await page.waitForSelector('.taiji-brand-stack', { timeout: timeoutMs }).catch(() => {})
  }
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(400)
  }
}

/**
 * 打开验收页面：全新浏览器上下文（绝不读用户浏览器 profile）+ 控制台收集。
 * @param {typeof import('playwright')} playwright
 * @param {object} input
 * @param {string} input.url - 测试实例认证 URL（含 token；只在本函数与连接层流转）。
 * @param {{ width: number, height: number }} [input.viewport]
 * @param {boolean} [input.headless]
 */
export async function openVerifyPage(playwright, { url, viewport = { width: 1440, height: 900 }, headless = true }) {
  let browser = null
  let context = null
  try {
    browser = await playwright.chromium.launch({ headless })
    context = await browser.newContext({ viewport })
    const page = await context.newPage()
    const recorder = createConsoleRecorder(page)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(1500)
    return {
      browser,
      context,
      page,
      recorder,
      async close() {
        await context.close().catch(() => {})
        await browser.close().catch(() => {})
      },
    }
  } catch (error) {
    if (context !== null) await context.close().catch(() => {})
    if (browser !== null) await browser.close().catch(() => {})
    throw error
  }
}

/**
 * 会话头按钮采集（转自 verify-reorder 的 collect，期望值全部依据本仓
 * client/head/session-header.css 当前源码：header 单行 min-height 40px、分段控件高 30px、
 * 激活字重 600、tab ::after 隐藏）。在页面上下文里执行，返回 null = 宿主 header 缺失。
 */
const COLLECT_HEAD_FN = () => {
  // alias token 的解析取色探针：token 声明值是 light-dark(亮, 暗) 函数串，
  // 直接 getPropertyValue 拿不到当前支；挂一个临时元素让引擎按页面 color-scheme 解析。
  const resolveTokenColor = (tokenName) => {
    const probe = document.createElement('span')
    probe.style.position = 'fixed'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    probe.style.color = `var(${tokenName})`
    document.body.append(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  }
  // 与生产 CSS 同一命中口径：只取会话头常驻结构属性所在的 header，不吃 DOM 序里更早的 header。
  const header = document.querySelector('header:has([data-conversation-header-leading])')
  if (header === null) return null
  const buttons = Array.from(header.querySelectorAll('button')).map((b) => {
    const rect = b.getBoundingClientRect()
    return {
      label: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 32),
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      display: getComputedStyle(b).display,
      off: b.offsetWidth === 0 || b.offsetHeight === 0,
    }
  })
  const visible = buttons.filter((b) => !b.off)
  const headerRect = header.getBoundingClientRect()
  const tablist = header.querySelector('[role="tablist"]')
  const tablistStyle = tablist === null ? null : getComputedStyle(tablist)
  const active = tablist === null ? null : tablist.querySelector('button[aria-selected="true"]')
  const tabAfter = tablist === null ? [] : Array.from(tablist.querySelectorAll('button')).map((b) => getComputedStyle(b, '::after').content)
  const corner = header.querySelector('[class*="headerCorner"]')
  const cornerButton = corner === null ? null : Array.from(corner.querySelectorAll('button')).find((b) => b.offsetWidth > 0) ?? null
  return {
    headerH: Math.round(headerRect.height),
    headerRight: headerRect.right,
    all: buttons,
    visible,
    cornerRight: cornerButton === null ? null : cornerButton.getBoundingClientRect().right,
    segH: tablistStyle === null ? null : tablistStyle.height,
    segBg: tablistStyle === null ? null : tablistStyle.backgroundColor,
    // 分段控件底色的对照值：css 用 --bg-input（→ bg-layer-1 alias），解析值逐支可比
    bgLayer1Resolved: resolveTokenColor('--dsw-alias-bg-layer-1'),
    activeWeight: active === null ? null : getComputedStyle(active).fontWeight,
    tabAfter,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }
}

/** 在页面上执行按钮采集。 */
export async function collectHead(page) {
  return page.evaluate(COLLECT_HEAD_FN)
}

/**
 * 品牌区探针：品牌栈 / 产品名 / 版本行 / 壳信息 global / hero 品牌区。
 * 选择器来自 client/brand/{name,hero-area}.tsx。
 */
export async function collectBrand(page) {
  return page.evaluate(() => {
    const stack = document.querySelector('.taiji-brand-stack')
    const version = document.querySelector('.taiji-brand-version')
    const name = document.querySelector('.taiji-brand-name')
    const hero = document.querySelector('.taiji-hero-area')
    const info = globalThis.__TAIJI_SHELL_INFO__
    return {
      stackText: stack === null ? null : stack.textContent,
      nameText: name === null ? null : name.textContent,
      versionText: version === null ? null : version.textContent,
      versionClipped: version === null ? null : version.scrollHeight > version.clientHeight,
      heroPresent: hero !== null,
      heroNameText: hero === null ? null : hero.querySelector('.taiji-hero-area-name')?.textContent ?? null,
      shellInfo: info !== null && typeof info === 'object' ? info : null,
      taijiElementCount: document.querySelectorAll('[class*="taiji-"]').length,
    }
  })
}

/**
 * 项目分组浏览器探针：整槽替换占位 / 默认组头 / 当前会话行 / 数据就绪态。
 * 选择器来自 client/projects/browser.tsx（滚动容器 taiji-pb-list 是该槽的常驻根，
 * 数据未就绪占位 = taiji-pb-unavailable）。
 */
export async function collectProjects(page) {
  return page.evaluate(() => {
    const list = document.querySelector('.taiji-pb-list')
    const groups = Array.from(document.querySelectorAll('.taiji-pb-group'))
    const rows = Array.from(document.querySelectorAll('.taiji-pb-row'))
    const defaultHead = document.querySelector('.taiji-pb-ghead-default')
    const currentRow = document.querySelector('.taiji-pb-row-current')
    const currentGroup = document.querySelector('.taiji-pb-group[data-current]')
    const unavailable = document.querySelector('.taiji-pb-unavailable')
    const chip = document.querySelector('.taiji-pb-chip')
    let chipCenterDelta = null
    if (chip !== null) {
      const range = document.createRange()
      range.selectNodeContents(chip)
      const textRect = range.getBoundingClientRect()
      const chipRect = chip.getBoundingClientRect()
      chipCenterDelta = {
        x: Math.abs((textRect.left + textRect.right - chipRect.left - chipRect.right) / 2),
        y: Math.abs((textRect.top + textRect.bottom - chipRect.top - chipRect.bottom) / 2),
      }
    }
    return {
      listPresent: list !== null,
      groupCount: groups.length,
      groupLabels: groups.map((g) => g.getAttribute('aria-label')),
      rowCount: rows.length,
      defaultHeadPresent: defaultHead !== null,
      currentRowPresent: currentRow !== null,
      currentRowSessionId: currentRow === null ? null : currentRow.getAttribute('data-session-id'),
      currentGroupPresent: currentGroup !== null,
      currentChipPresent: chip !== null,
      chipCenterDelta,
      unavailablePresent: unavailable !== null,
    }
  })
}

/**
 * 外观控制探针：composer 快速配色 chip 与设置页外观行的可达性 + 当前生效的
 * brand-primary token 解析值（配色切换断言的对照值）。
 * 选择器来自 client/input/appearance-chip.tsx 与 client/settings/appearance-row.tsx。
 */
export async function collectAppearance(page) {
  return page.evaluate(() => {
    const resolveTokenColor = (tokenName) => {
      const probe = document.createElement('span')
      probe.style.position = 'fixed'
      probe.style.visibility = 'hidden'
      probe.style.pointerEvents = 'none'
      probe.style.color = `var(${tokenName})`
      document.body.append(probe)
      const value = getComputedStyle(probe).color
      probe.remove()
      return value
    }
    const chip = document.querySelector('.taiji-appearance-chip')
    const row = document.querySelector('.taiji-appearance-row')
    const palette = document.querySelector('.taiji-appearance-chip-palette')
    return {
      chipPresent: chip !== null,
      chipVisible: chip !== null && chip.offsetWidth > 0 && chip.offsetHeight > 0,
      rowPresent: row !== null,
      rowSwatchCount: document.querySelectorAll('.taiji-appearance-swatch').length,
      rowSwatchNames: Array.from(document.querySelectorAll('.taiji-appearance-swatch-name')).map((el) => el.textContent?.trim() ?? ''),
      palettePresent: palette !== null,
      chipSwatchCount: document.querySelectorAll('.taiji-appearance-chip-swatch').length,
      colorScheme: getComputedStyle(document.body).colorScheme,
      brandPrimaryResolved: resolveTokenColor('--dsw-alias-brand-primary'),
      sidebarFillResolved: resolveTokenColor('--dsw-specific-sidebar-fill'),
    }
  })
}
