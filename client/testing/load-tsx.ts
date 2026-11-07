/**
 * client/testing/load-tsx.ts —— 测试专用夹具：在无 React 安装的环境里装载 .tsx 模块。
 *
 * 为什么需要它：本包的浏览器半场源码（client/brand/*.tsx、client/settings/*.tsx）在运行时
 * 从**宿主模块表** require `react` / `react/jsx-runtime`（设计 D3：零 npm 依赖，宿主供给），
 * 而本仓 devDependencies 里没有 react——单测目录直接 import 这些模块会挂在模块解析上。
 * 本夹具用 esbuild（本仓 devDependency，构建脚本同款）把 .tsx 转成 CJS，配一个假
 * react/jsx-runtime 求值：jsx 调用被记录成可断言的元素树，hook 按「单次渲染」语义桩掉。
 * 于是品牌槽/外观行的**注册契约与组件输出**可以真行为断言（而不是正则扫源码）——
 * 组件函数在本夹具里从不被宿主渲染机调用，我们手动调用它。
 *
 * 宿主模块表基线里的 `react-dom` 同样没有本地安装：源码里 `createPortal` 一类的引入由
 * 下方的假 react-dom 供给——portal 不真挂 DOM，记录为 portal 元素（含挂载目标与子树），
 * 弹层「去了 body」与「内容长什么样」都能在元素树上断言。
 *
 * 边界（刻意不做什么）：不做真实 DOM、不做 React 协调、不跑 effect 清理的生命周期闭环；
 * 断言范围止于「注册进哪个槽、什么选项、组件树长什么样、点击调到哪」。真渲染归 V1/V12 的
 * 真实宿主场景（L3/L4），单测层不越界。
 *
 * 只被测试文件引用（无 *.test.* 命名，不会被 vitest 收集为用例）；源码装载链不碰它。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { transformSync } from 'esbuild'

/** 假 react 记录到的一个元素（jsx 调用的产物）。 */
export interface FakeElement {
  type: unknown
  props: Record<string, unknown>
}

/** 装载器：一次 load 调用树内共享模块缓存与元素记录。 */
export interface TsxLoader {
  /** 装载并求值一个 .ts/.tsx 模块，返回其 exports。 */
  load(absPath: string): Record<string, unknown>
  /** 假 jsx 记录到的全部元素（创建序；渲染后遍历用）。 */
  readonly elements: FakeElement[]
  /** 已执行的假 effect 的清理函数（useEffect 桩的记录）。 */
  readonly effectCleanups: (() => void)[]
}

/** 假 jsx-runtime：记录元素而非创建真实 fiber。 */
function createJsxRuntime(loader: { elements: FakeElement[] }) {
  const record = (type: unknown, props: Record<string, unknown> | undefined): FakeElement => {
    const element: FakeElement = { type, props: props ?? {} }
    loader.elements.push(element)
    return element
  }
  return {
    jsx: (type: unknown, props: Record<string, unknown> | undefined) => record(type, props),
    jsxs: (type: unknown, props: Record<string, unknown> | undefined) => record(type, props),
    Fragment: Symbol('Fragment'),
  }
}

/** portal 元素的类型标记（测试据 `element.type === PORTAL_TYPE` 识别弹层挂载去向）。 */
export const PORTAL_TYPE = Symbol('portal')

/** 假 react-dom：createPortal 记录为 portal 元素（props 含挂载目标与子树），不真挂 DOM——子树仍是普通元素树，collectElements 可继续遍历断言。 */
function createReactDOM(loader: { elements: FakeElement[] }) {
  return {
    createPortal: (children: unknown, container: unknown): FakeElement => {
      const element: FakeElement = { type: PORTAL_TYPE, props: { container, children } }
      loader.elements.push(element)
      return element
    },
  }
}

/** 假 react：hook 按单次渲染语义桩（订阅源直接取当前快照）。 */
function createReact(loader: { elements: FakeElement[]; effectCleanups: (() => void)[] }) {
  const jsxRuntime = createJsxRuntime(loader)
  return {
    ...jsxRuntime,
    createElement: (type: unknown, props: Record<string, unknown> | undefined) => jsxRuntime.jsx(type, props),
    useSyncExternalStore: (
      subscribe: (onStoreChange: () => void) => () => void,
      getSnapshot: () => unknown,
      getServerSnapshot?: () => unknown,
    ) => (getServerSnapshot ?? getSnapshot)(),
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect()
      if (typeof cleanup === 'function') loader.effectCleanups.push(cleanup)
    },
    useLayoutEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect()
      if (typeof cleanup === 'function') loader.effectCleanups.push(cleanup)
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (value: unknown) => value,
    useId: () => 'test-id',
  }
}

/** 解析相对引入：按 Node ESM 习惯补扩展名 / 目录索引。 */
function resolveRelative(fromFile: string, specifier: string): string {
  const base = resolvePath(dirname(fromFile), specifier)
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
  for (const candidate of candidates) {
    try {
      readFileSync(candidate)
      return candidate
    } catch {
      // 试下一个候选
    }
  }
  throw new Error(`测试夹具无法解析相对引入 ${specifier}（自 ${fromFile}）`)
}

/** 建一个独立装载器（模块缓存与元素记录互不污染）。 */
export function createTsxLoader(): TsxLoader {
  const state = { elements: [] as FakeElement[], effectCleanups: [] as (() => void)[] }
  const cache = new Map<string, Record<string, unknown>>()

  const load = (absPath: string): Record<string, unknown> => {
    const cached = cache.get(absPath)
    if (cached !== undefined) return cached

    const source = readFileSync(absPath, 'utf8')
    const transformed = transformSync(source, {
      loader: absPath.endsWith('.tsx') ? 'tsx' : 'ts',
      format: 'cjs',
      jsx: 'automatic',
      target: 'es2022',
      sourcemap: false,
      logLevel: 'silent',
    })

    const stubRequire = (specifier: string): unknown => {
      if (specifier === 'react') return createReact(state)
      if (specifier === 'react/jsx-runtime') return createJsxRuntime(state)
      if (specifier === 'react-dom') return createReactDOM(state)
      if (specifier.startsWith('.')) return load(resolveRelative(absPath, specifier))
      throw new Error(`测试夹具不提供宿主模块 ${specifier}（自 ${absPath}）——本包源码只许 require 基线内模块`)
    }

    const module = { exports: {} as Record<string, unknown> }
    const factory = new Function('require', 'module', 'exports', transformed.code)
    factory(stubRequire, module, module.exports)
    cache.set(absPath, module.exports)
    return module.exports
  }

  return {
    load,
    get elements() {
      return state.elements
    },
    get effectCleanups() {
      return state.effectCleanups
    },
  }
}

/** 深度遍历元素树（props.children 可能是单个、数组或嵌套数组）。 */
export function collectElements(root: FakeElement): FakeElement[] {
  const out: FakeElement[] = [root]
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node === null || node === undefined || typeof node !== 'object') return
    const element = node as FakeElement
    if (!('type' in element) || !('props' in element)) return
    out.push(element)
    visit(element.props.children)
  }
  visit(root.props.children)
  return out
}

/** 按类名找元素（className 含该类即命中；字符串或字符串数组成立）。 */
export function elementsWithClass(elements: readonly FakeElement[], className: string): FakeElement[] {
  return elements.filter((element) => {
    const value = element.props.className
    if (typeof value === 'string') return value.split(/\s+/).includes(className)
    return false
  })
}

/** 取元素的文本内容（children 里的字符串拼接；用于断言按钮文案）。 */
export function textOf(element: FakeElement): string {
  const parts: string[] = []
  const visit = (node: unknown): void => {
    if (typeof node === 'string' || typeof node === 'number') parts.push(String(node))
    else if (Array.isArray(node)) for (const child of node) visit(child)
    else if (node !== null && typeof node === 'object') visit((node as FakeElement).props?.children)
  }
  visit(element.props.children)
  return parts.join('')
}
