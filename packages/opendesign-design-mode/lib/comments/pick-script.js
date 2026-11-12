const PICK_SCRIPT_SOURCE = String.raw`(function () {
  'use strict'
  // 重复注入防护：同一 HTML 文档只初始化一次（iframe 重载 = 新文档新 window，标记天然
  // 复位、重新走 ready 握手——D8(a) 的重载协议依赖这一点）。
  if (window.__odPickBridgeLoaded) return
  window.__odPickBridgeLoaded = true
  // 顶层直开（无面板父窗口，V7 步④）：恒静默——不发 ready、不注册监听、不渲染任何 UI。
  if (window.parent === window) return

  var PROTOCOL_VERSION = 1
  var MSG_PREFIX = 'odp-pick:'
  var ANCHOR_ATTRIBUTES = ['data-od-id', 'data-screen-label']
  var HIGHLIGHT_FLASH_MS = 1400
  // 同元素多线程徽章的水平错位步长（D8(b)）。
  var BADGE_STAGGER_PX = 24
  // 评论文本上限（contract.ts COMMENT_TEXT_MAX_LENGTH 同值；脚本单文件无依赖，字面量
  // 对齐由该处词表测试锁定，漂移时两侧对不上即面板 400，此处不静默放行）。
  var TEXT_MAX_LENGTH = 10000

  // ── 桥收发（G1）────────────────────────────────────────────────────────────
  function send(action, payload) {
    window.parent.postMessage({ v: PROTOCOL_VERSION, type: MSG_PREFIX + action, payload: payload }, '*')
  }

  function isFromPanel(event) {
    return event.source === window.parent && window.parent !== window
  }

  // 入站解析：对象形态、v 值、前缀三重过滤，任一不满足返回 null（调用方静默忽略）。
  function parseInbound(event) {
    var data = event.data
    if (!data || typeof data !== 'object') return null
    if (data.v !== PROTOCOL_VERSION) return null
    if (typeof data.type !== 'string' || data.type.indexOf(MSG_PREFIX) !== 0) return null
    return { action: data.type.slice(MSG_PREFIX.length), payload: data.payload }
  }

  // ── 锚点生成（三级降级，D1）────────────────────────────────────────────────
  function idSelectorFor(element) {
    var id = element.getAttribute('id')
    if (typeof id === 'string' && id !== '') return '#' + id
    return null
  }

  // data 级：自身或最近祖先带锚属性即命中；值含引号或反斜杠无法构成合法属性选择器，
  // 该级不可用（返回 null 落 path 级），值含空格合法（'[data-screen-label="01 Title"]'）。
  function dataSelectorFor(element) {
    var node = element
    while (node !== null && node.nodeType === 1) {
      for (var i = 0; i < ANCHOR_ATTRIBUTES.length; i++) {
        var attr = ANCHOR_ATTRIBUTES[i]
        var value = node.getAttribute(attr)
        if (typeof value === 'string' && value !== '') {
          if (value.indexOf('"') !== -1 || value.indexOf('\\') !== -1) return null
          return '[' + attr + '="' + value + '"]'
        }
      }
      node = node.parentNode
    }
    return null
  }

  // 同类型兄弟中的序数（CSS :nth-of-type 语义，不是全兄弟序数）。
  function nthOfType(node) {
    var tag = node.tagName
    var index = 1
    var sibling = node.previousElementSibling
    while (sibling !== null) {
      if (sibling.tagName === tag) index += 1
      sibling = sibling.previousElementSibling
    }
    return index
  }

  // path 级 sel 的契约上限（contract.ts ANCHOR_SEL_MAX_LENGTH 同值；对齐口径同上）。
  var SEL_MAX_LENGTH = 500
  function pathSelectorFor(element) {
    var segments = []
    var node = element
    while (node !== null && node.nodeType === 1) {
      if (node === document.documentElement) {
        segments.unshift('html')
        break
      }
      segments.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + nthOfType(node) + ')')
      node = node.parentNode
    }
    var sel = segments.join(' > ')
    // 深嵌套超契约上限时从根侧截段保尾：截断后的祖先链起点前移会损失唯一性，属 path 级
    // 「序数敏感、改稿漂移」既有已接受代价的延伸（D1）；不截断则写入侧 400，评论必失败，
    // 截断后至少给出可定位的最近似指称。
    while (sel.length > SEL_MAX_LENGTH && segments.length > 1) {
      segments.shift()
      sel = segments.join(' > ')
    }
    return sel
  }

  function buildAnchor(element) {
    var idSel = idSelectorFor(element)
    if (idSel !== null) return { level: 'id', sel: idSel }
    var dataSel = dataSelectorFor(element)
    if (dataSel !== null) return { level: 'data', sel: dataSel }
    return { level: 'path', sel: pathSelectorFor(element) }
  }

  // ── overlay 层（D6：全部 UI 在 iframe 文档内渲染，坐标相对产物文档）──────────
  var STYLE_ID = 'od-pick-script-styles'
  var LAYER_ID = 'od-pick-layer'
  var STYLE_TEXT = '#od-pick-layer{position:absolute;top:0;left:0;width:0;height:0;}' +
    '.od-pick-box{position:absolute;pointer-events:none;border:2px solid #2563eb;background:rgba(37,99,235,.12);border-radius:2px;box-sizing:border-box;}' +
    '.od-pick-flash{position:absolute;pointer-events:none;border:2px solid #f59e0b;background:rgba(245,158,11,.18);border-radius:2px;box-sizing:border-box;}' +
    '.od-pick-label{position:absolute;pointer-events:none;font:12px/1.4 system-ui,sans-serif;background:#2563eb;color:#fff;padding:2px 6px;border-radius:3px;white-space:nowrap;}' +
    '.od-pick-panel{position:fixed;pointer-events:auto;z-index:2147483647;background:#fff;border:1px solid #d4d4d8;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:10px;width:280px;font:13px/1.5 system-ui,sans-serif;color:#18181b;}' +
    '.od-pick-panel textarea{display:block;width:100%;min-height:64px;box-sizing:border-box;border:1px solid #d4d4d8;border-radius:6px;padding:6px;font:13px/1.5 system-ui,sans-serif;resize:vertical;}' +
    '.od-pick-anchor{color:#52525b;font-size:12px;margin:6px 0;word-break:break-all;}' +
    '.od-pick-error{color:#dc2626;font-size:12px;margin:6px 0;display:none;white-space:pre-wrap;}' +
    '.od-pick-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px;}' +
    '.od-pick-actions button{border:1px solid #d4d4d8;background:#fff;border-radius:6px;padding:4px 12px;font:13px system-ui,sans-serif;cursor:pointer;}' +
    '.od-pick-actions button.od-pick-primary{background:#2563eb;border-color:#2563eb;color:#fff;}' +
    '.od-pick-actions button:disabled{opacity:.5;cursor:default;}' +
    '.od-pick-badge{position:absolute;pointer-events:auto;z-index:2147483645;min-width:20px;height:20px;line-height:20px;text-align:center;padding:0 4px;border-radius:10px;background:#2563eb;color:#fff;font:bold 12px/20px system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25);}' +
    '.od-pick-badge:hover{background:#1d4ed8;}'

  var layer = null
  var hoverBox = null
  var hoverLabel = null
  var panel = null
  var panelTextarea = null
  var panelError = null
  var panelSendButton = null
  var badgeHost = null
  var badges = []

  function ensureStyle() {
    var existing = document.getElementById(STYLE_ID)
    if (existing !== null) {
      existing.textContent = STYLE_TEXT
      return
    }
    var style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLE_TEXT
    document.head.appendChild(style)
  }

  function ensureLayer() {
    if (layer !== null && layer.isConnected) return layer
    ensureStyle()
    layer = document.createElement('div')
    layer.id = LAYER_ID
    document.body.appendChild(layer)
    hoverBox = document.createElement('div')
    hoverBox.className = 'od-pick-box'
    hoverBox.style.display = 'none'
    hoverLabel = document.createElement('div')
    hoverLabel.className = 'od-pick-label'
    hoverLabel.style.display = 'none'
    badgeHost = document.createElement('div')
    layer.appendChild(hoverBox)
    layer.appendChild(hoverLabel)
    layer.appendChild(badgeHost)
    return layer
  }

  function removeLayer() {
    if (layer !== null) {
      layer.parentNode.removeChild(layer)
      layer = null
      hoverBox = null
      hoverLabel = null
      badgeHost = null
      badges = []
    }
    if (panel !== null) {
      panel.parentNode.removeChild(panel)
      panel = null
    }
  }

  // 文档坐标 = 视口坐标 + 滚动偏移（overlay absolute 定位随文档滚动天然对齐，D6）。
  function rectInDocument(element) {
    var rect = element.getBoundingClientRect()
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    }
  }

  // ── 评论模式交互（D3/D6：入口唯一化，交互全在产物内）─────────────────────────
  var pickModeOn = false
  var selected = null // { element, anchor }
  var sending = false
  var pendingSubmit = false

  function describeElement(element) {
    var tag = element.tagName.toLowerCase()
    var id = element.getAttribute('id')
    if (typeof id === 'string' && id !== '') return tag + '#' + id
    for (var i = 0; i < ANCHOR_ATTRIBUTES.length; i++) {
      var value = element.getAttribute(ANCHOR_ATTRIBUTES[i])
      if (typeof value === 'string' && value !== '') return tag + '[' + ANCHOR_ATTRIBUTES[i] + '=' + value + ']'
    }
    return tag
  }

  function moveHighlight(element) {
    ensureLayer()
    var rect = rectInDocument(element)
    var box = hoverBox
    var label = hoverLabel
    if (box === null || label === null) return
    box.style.display = 'block'
    box.style.left = String(rect.left) + 'px'
    box.style.top = String(rect.top) + 'px'
    box.style.width = String(rect.width) + 'px'
    box.style.height = String(rect.height) + 'px'
    label.style.display = 'block'
    label.style.left = String(rect.left) + 'px'
    label.style.top = String(Math.max(rect.top - 20, 0)) + 'px'
    label.textContent = describeElement(element)
  }

  function hideHighlight() {
    if (hoverBox !== null) hoverBox.style.display = 'none'
    if (hoverLabel !== null) hoverLabel.style.display = 'none'
  }

  // 事件目标落在脚本自渲染 UI 内时不当作产物元素拾取（避免脚本把自己的输入框当靶子）。
  function isOwnUi(node) {
    var cursor = node
    while (cursor !== null && cursor.nodeType === 1) {
      if (cursor === layer || (panel !== null && cursor === panel)) return true
      cursor = cursor.parentNode
    }
    return false
  }

  function onMouseMove(event) {
    var target = event.target
    if (!pickModeOn || !target || target.nodeType !== 1 || isOwnUi(target)) return
    moveHighlight(target)
  }

  function onMouseLeave() {
    hideHighlight()
  }

  function openPanel(element, anchor) {
    ensureLayer()
    var rect = element.getBoundingClientRect()
    var host = document.createElement('div')
    host.className = 'od-pick-panel'
    var preview = document.createElement('div')
    preview.className = 'od-pick-anchor'
    preview.textContent = anchor.level + ' · ' + anchor.sel
    var textarea = document.createElement('textarea')
    textarea.maxLength = TEXT_MAX_LENGTH
    textarea.placeholder = 'Write your comment… 输入评论'
    var errorLine = document.createElement('div')
    errorLine.className = 'od-pick-error'
    var actions = document.createElement('div')
    actions.className = 'od-pick-actions'
    var cancelButton = document.createElement('button')
    cancelButton.textContent = 'Cancel 取消'
    var sendButton = document.createElement('button')
    sendButton.className = 'od-pick-primary'
    sendButton.textContent = 'Send 发送'
    sendButton.disabled = true
    actions.appendChild(cancelButton)
    actions.appendChild(sendButton)
    host.appendChild(textarea)
    host.appendChild(preview)
    host.appendChild(errorLine)
    host.appendChild(actions)
    document.body.appendChild(host)
    // 面板用视口 fixed 定位（输入期间滚动不漂走），放在选中元素下方并夹回视口内。
    var left = Math.min(Math.max(rect.left, 8), Math.max(window.innerWidth - 300, 8))
    var top = rect.bottom + 8
    if (top + 220 > window.innerHeight) top = Math.max(rect.top - 228, 8)
    host.style.left = String(left) + 'px'
    host.style.top = String(top) + 'px'
    panel = host
    panelTextarea = textarea
    panelError = errorLine
    panelSendButton = sendButton
    textarea.addEventListener('input', function () {
      sendButton.disabled = sending || textarea.value.length === 0
    })
    cancelButton.addEventListener('click', function () {
      if (!sending) cancelSelection()
    })
    sendButton.addEventListener('click', function () {
      submitSelection()
    })
    textarea.focus()
  }

  function cancelSelection() {
    if (panel !== null) {
      panel.parentNode.removeChild(panel)
      panel = null
      panelTextarea = null
      panelError = null
      panelSendButton = null
    }
    selected = null
    sending = false
    pendingSubmit = false
    hideHighlight()
  }

  function submitSelection() {
    if (selected === null || sending || panelTextarea === null) return
    var text = panelTextarea.value
    if (text.length === 0 || text.length > TEXT_MAX_LENGTH) return
    // 发送中态（D6 回执协议）：输入框保留、按钮禁用，等待面板 submit-result 回执；
    // 挂起不限时（D6 明文不加超时——与直发路径 sending 挂起同语义）。
    sending = true
    pendingSubmit = true
    if (panelSendButton !== null) {
      panelSendButton.disabled = true
      panelSendButton.textContent = 'Sending… 发送中'
    }
    send('picked', { anchor: selected.anchor, text: text })
  }

  function showPanelError(reason) {
    if (panelError === null) return
    panelError.textContent = typeof reason === 'string' && reason !== '' ? reason : 'Submit failed, please retry. 发送失败，请重试'
    panelError.style.display = 'block'
  }

  function onClick(event) {
    if (!pickModeOn) return
    var target = event.target
    if (!target || target.nodeType !== 1 || isOwnUi(target)) return
    // 评论模式拦截产物默认行为（链接跳转、按钮动作等）——普通模式零触碰（D6）。
    event.preventDefault()
    event.stopPropagation()
    if (sending) return
    cancelSelection()
    var element = target
    selected = { element: element, anchor: buildAnchor(element) }
    openPanel(element, selected.anchor)
    hideHighlight()
  }

  function onKeyDown(event) {
    if (!pickModeOn) return
    if (event.key !== 'Escape') return
    // 发送挂起期间 Esc 不取消（回执在途，取消会让 submit-result 落空）。
    if (sending) return
    cancelSelection()
  }

  // 点击框外取消：mousedown 落在输入框与脚本 UI 之外且已有选中时取消（发送挂起期间忽略）。
  function onMouseDown(event) {
    if (!pickModeOn || panel === null || sending) return
    if (isOwnUi(event.target)) return
    cancelSelection()
  }

  var interactionListeners = [
    { type: 'mousemove', handler: onMouseMove },
    { type: 'mouseleave', handler: onMouseLeave },
    { type: 'click', handler: onClick, capture: true },
    { type: 'keydown', handler: onKeyDown, capture: true },
    { type: 'mousedown', handler: onMouseDown, capture: true },
  ]

  function attachInteraction() {
    for (var i = 0; i < interactionListeners.length; i++) {
      var item = interactionListeners[i]
      document.addEventListener(item.type, item.handler, item.capture === true)
    }
    // 进入评论模式必须已挂 overlay（悬停高亮的宿主）。
    ensureLayer()
  }

  function detachInteraction() {
    for (var i = 0; i < interactionListeners.length; i++) {
      var item = interactionListeners[i]
      document.removeEventListener(item.type, item.handler, item.capture === true)
    }
    hideHighlight()
  }

  // ── 徽章与定位（GL3 / D8(b)）────────────────────────────────────────────────
  // 脚本内存的锚点集副本（SC2 派生视图：权威 = 面板下发的 anchors 清单，随文档生灭）；
  // locate 无命中回报需要按 sel 对账 threadId/ordinal，正是这份副本的消费点。
  var lastAnchors = []

  function positionBadge(badge, element, slotIndex) {
    var rect = rectInDocument(element)
    badge.style.left = String(rect.left + slotIndex * BADGE_STAGGER_PX) + 'px'
    badge.style.top = String(rect.top - 10) + 'px'
    badge.style.display = 'block'
  }

  function clearBadges() {
    if (badgeHost !== null) {
      while (badgeHost.firstChild !== null) badgeHost.removeChild(badgeHost.firstChild)
    }
    badges = []
  }

  function flashHighlight(element) {
    var host = ensureLayer()
    var flash = document.createElement('div')
    flash.className = 'od-pick-flash'
    var rect = rectInDocument(element)
    flash.style.left = String(rect.left) + 'px'
    flash.style.top = String(rect.top) + 'px'
    flash.style.width = String(rect.width) + 'px'
    flash.style.height = String(rect.height) + 'px'
    host.appendChild(flash)
    window.setTimeout(function () {
      if (flash.parentNode !== null) flash.parentNode.removeChild(flash)
    }, HIGHLIGHT_FLASH_MS)
  }

  function locateElement(sel) {
    var element = document.querySelector(sel)
    if (element === null) return null
    element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    flashHighlight(element)
    return element
  }

  function renderAnchors(list) {
    ensureLayer()
    clearBadges()
    var host = badgeHost
    if (host === null) return
    var slotByElement = new window.Map()
    var misses = []
    for (var i = 0; i < list.length; i++) {
      var item = list[i]
      var element = null
      try {
        element = document.querySelector(item.sel)
      } catch (error) {
        element = null
      }
      if (element === null) {
        misses.push({ threadId: item.threadId, ordinal: item.ordinal, sel: item.sel, hit: false })
        continue
      }
      var slot = slotByElement.get(element)
      if (slot === undefined) {
        slot = 0
        slotByElement.set(element, 1)
      } else {
        slotByElement.set(element, slot + 1)
      }
      var badge = document.createElement('div')
      badge.className = 'od-pick-badge'
      badge.textContent = String(item.ordinal)
      badge.title = '#' + String(item.ordinal) + ' · ' + item.sel
      // 点击徽章脚本内直接定位（滚动 + 高亮），不经面板往返（D8(b)）；按 sel 值捕获——
      // for 循环的 var 计数变量在闭包里共享，延迟回调必须经参数固化当轮值。
      ;(function (sel) {
        badge.addEventListener('click', function () {
          locateElement(sel)
        })
      })(item.sel)
      positionBadge(badge, element, slot)
      host.appendChild(badge)
      badges.push(badge)
    }
    // 锚点失效态数据源（D8(b)）：只在存在未命中时回报未命中清单；全命中无需回报，
    // 面板侧默认全命中。
    if (misses.length > 0) send('anchors-status', misses)
  }

  // 窗口尺寸变化后徽章文档坐标漂移，整批重算；评论模式悬停框直接隐藏（下次移动重算）。
  function onWindowResize() {
    if (pickModeOn) hideHighlight()
    var elements = []
    for (var i = 0; i < lastAnchors.length; i++) {
      var element = null
      try {
        element = document.querySelector(lastAnchors[i].sel)
      } catch (error) {
        element = null
      }
      elements.push(element)
    }
    var slotByElement = new window.Map()
    for (var j = 0; j < elements.length; j++) {
      var badge = badges[j]
      var target = elements[j]
      if (badge === undefined || target === null) continue
      var slot = slotByElement.get(target)
      if (slot === undefined) {
        slot = 0
        slotByElement.set(target, 1)
      } else {
        slotByElement.set(target, slot + 1)
      }
      positionBadge(badge, target, slot)
    }
  }
  window.addEventListener('resize', onWindowResize)

  // ── 入站动作处理（词表恰四个，词表外静默忽略，G1）────────────────────────────
  function handlePickMode(payload) {
    pickModeOn = !!(payload && payload.enabled === true)
    if (pickModeOn) {
      attachInteraction()
    } else {
      detachInteraction()
      cancelSelection()
      // 徽章保留：已评论标记与拾取交互无关（D6 常驻呈现），关闭模式不清除。
    }
  }

  function handleAnchors(payload) {
    var list = Array.isArray(payload) ? payload : []
    lastAnchors = list
    renderAnchors(list)
  }

  function handleLocate(payload) {
    var sel = payload && typeof payload.sel === 'string' ? payload.sel : null
    if (sel === null) return
    var element = locateElement(sel)
    if (element !== null) return
    // 无命中回报：G1 动作词表恰七项、无独立 locate-miss——按 SC2 内存锚点集对账出
    // 完整四字段项后经 anchors-status 承载（面板按 sel 对账线程标失效）。sel 不在
    // 最近锚点集内（面板自造寻址）无处对账，静默。
    for (var i = 0; i < lastAnchors.length; i++) {
      if (lastAnchors[i].sel === sel) {
        send('anchors-status', [{ threadId: lastAnchors[i].threadId, ordinal: lastAnchors[i].ordinal, sel: sel, hit: false }])
        return
      }
    }
  }

  function handleSubmitResult(payload) {
    if (!pendingSubmit) return
    pendingSubmit = false
    if (payload && payload.ok === true) {
      cancelSelection()
      return
    }
    // 失败回执（D6）：输入框保留文本与选中态，行内错误提示，可修改后重发。
    sending = false
    if (panelSendButton !== null) {
      panelSendButton.disabled = panelTextarea === null || panelTextarea.value.length === 0
      panelSendButton.textContent = 'Send 发送'
    }
    showPanelError(payload ? payload.reason : undefined)
  }

  window.addEventListener('message', function (event) {
    if (!isFromPanel(event)) return
    var message = parseInbound(event)
    if (message === null) return
    if (message.action === 'pick-mode') handlePickMode(message.payload)
    else if (message.action === 'anchors') handleAnchors(message.payload)
    else if (message.action === 'locate') handleLocate(message.payload)
    else if (message.action === 'submit-result') handleSubmitResult(message.payload)
    // 词表外动作静默忽略（G1：不满足即静默忽略）。
  })

  // 就绪握手（D8(a)）：加载即发；iframe 重载 = 新文档新脚本实例重新发。
  send('ready', {})
})()
`;
export {
  PICK_SCRIPT_SOURCE
};
