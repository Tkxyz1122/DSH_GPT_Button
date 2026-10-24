/* dsh-gpt-button —— 前端半区（圆形图标版）
 * 悬浮圆形 GPT 图标：左键一键启动（Falemon → ChatGPT），右键菜单（设置 / 重启 Falemon / 重启 ChatGPT）。
 * 可拖动，位置存 localStorage；每 5 秒刷新运行状态。
 */
(function () {
  'use strict'
  if (window.__dshLauncherLoaded) return
  if (window.top !== window.self) return
  window.__dshLauncherLoaded = true

  var STATE_URL = '/dsh-launch/state.json'
  var CHAIN_URL = '/dsh-launch/chain'
  var RESTART_URL = '/dsh-launch/restart'
  var CONFIG_URL = '/dsh-launch/config'
  var DETECT_URL = '/dsh-launch/detect.json'
  var ICON_URL = '/dsh-launch/gpt-icon.png'

  var POS_KEY = 'dql:pos'

  var state = {
    config: null,
    status: {},
    busy: false,
    toastTimer: null,
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key)
      localStorage.setItem(key, val)
    } catch (err) {}
    return null
  }
  function loadPos() {
    try {
      var raw = store(POS_KEY)
      if (!raw) return null
      var p = JSON.parse(raw)
      return p && typeof p.left === 'number' && typeof p.top === 'number' ? p : null
    } catch (err) { return null }
  }
  function savePos(left, top) {
    store(POS_KEY, JSON.stringify({ left: Math.round(left), top: Math.round(top) }))
  }
  function fmtError(err) {
    var msg = String((err && err.message) || err)
    return msg.length > 90 ? msg.slice(0, 90) + '…' : msg
  }
  function api(url, options) {
    return fetch(url, options).then(function (res) {
      return res.text().then(function (text) {
        var data = null
        try { data = text ? JSON.parse(text) : null } catch (err) {}
        if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status))
        return data
      })
    })
  }

  // ---------- 样式 ----------
  var STYLE_ID = 'dql-style'
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return
    var css = [
      '#dql-wrap{position:fixed;z-index:2147483000;width:56px;height:56px;left:20px;bottom:20px;pointer-events:none;opacity:0;transform:scale(.86);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.9,.3,1.25);}',
      '#dql-wrap.dql-shown{pointer-events:auto;opacity:1;transform:scale(1);}',
      '@media (prefers-reduced-motion:reduce){#dql-wrap{transition:none;}}',
      '#dql-float{width:56px;height:56px;}',
      '#dql-btn{position:relative;z-index:1;width:56px;height:56px;border-radius:50%;box-sizing:border-box;overflow:hidden;cursor:pointer;border:0;padding:0;',
      'background:linear-gradient(135deg,rgba(77,107,254,.12),rgba(90,160,255,.08));border:1px solid rgba(77,107,254,.22);',
      'box-shadow:0 2px 8px rgba(77,107,254,.10);',
      'display:flex;align-items:center;justify-content:center;touch-action:none;user-select:none;',
      '-webkit-user-select:none;transition:transform .18s cubic-bezier(.2,.9,.3,1.35),box-shadow .25s ease,background .2s ease;}',
      '#dql-btn:hover{transform:scale(1.09) translateY(-2px);background:linear-gradient(135deg,rgba(77,107,254,.20),rgba(90,160,255,.14));',
      'animation:dqlGlow 1.6s ease-in-out infinite;}',
      '@keyframes dqlGlow{0%,100%{box-shadow:0 3px 10px rgba(77,107,254,.12),0 0 0 0 rgba(77,107,254,.10);}',
      '50%{box-shadow:0 5px 14px rgba(77,107,254,.18),0 0 0 6px rgba(77,107,254,.06);}}',
      '#dql-btn:active{transform:scale(.95);}',
      '#dql-btn.busy{cursor:wait;}',
      '#dql-btn.busy::after{content:"";position:absolute;inset:2px;border-radius:50%;',
      'border:3px solid rgba(76,111,255,.25);border-top-color:#4c6fff;animation:dqlspin .9s linear infinite;}',
      '@keyframes dqlspin{to{transform:rotate(360deg);}}',
      '#dql-btn img{width:84%;height:84%;object-fit:contain;pointer-events:none;display:block;',
      'transition:transform .2s ease;filter:invert(1) drop-shadow(0 1px 2px rgba(0,0,0,.22));opacity:.92;}',
      '#dql-btn:hover img{transform:scale(1.07) rotate(-5deg);}',
      '@keyframes dqlBounce{0%{transform:scale(1,1);}25%{transform:scale(1.12,.86);}55%{transform:scale(.94,1.08);}80%{transform:scale(1.03,.97);}100%{transform:scale(1,1);}}',
      '#dql-btn.dql-bounce{animation:dqlBounce .42s cubic-bezier(.3,1.6,.5,1);}',
      '@media (prefers-reduced-motion:reduce){#dql-btn.dql-bounce{animation:none;}}',
      '#dql-btn .dql-fallback{color:#3a56d6;font:600 15px/1 "Segoe UI",sans-serif;letter-spacing:.5px;}',
      '#dql-toast{position:fixed;z-index:2147483003;max-width:230px;padding:6px 10px;border-radius:8px;',
      'background:rgba(25,27,31,.96);color:#fff;font:11px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;',
      'opacity:0;transition:opacity .18s ease;pointer-events:none;white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis;box-shadow:0 6px 18px rgba(0,0,0,.25);}',
      '#dql-toast.show{opacity:1;}',
      '#dql-toast.err{background:rgba(150,20,20,.96);}',
      '#dql-menu{position:fixed;z-index:2147483002;min-width:184px;border-radius:12px;padding:6px;display:none;',
      'background:rgba(255,255,255,.985);color:#1f2329;border:1px solid rgba(0,0,0,.08);',
      'box-shadow:0 14px 40px rgba(0,0,0,.24);font:12px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;}',
      '#dql-menu.show{display:block;}',
      '#dql-menu .dql-mi{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;',
      'cursor:pointer;white-space:nowrap;}',
      '#dql-menu .dql-mi:hover{background:rgba(76,111,255,.10);}',
      '#dql-menu .dql-mhead{text-align:center;padding:6px 8px 2px;font-weight:600;font-size:12px;',
      'color:#4c6fff;letter-spacing:.5px;}',
      '#dql-menu .dql-mdot{flex:none;width:7px;height:7px;border-radius:50%;background:#c0c4cc;}',
      '#dql-menu .dql-mdot.on{background:#22c55e;}',
      '#dql-menu .dql-mlabel{flex:1;}',
      '#dql-menu .dql-mhint{opacity:.45;font-size:10.5px;}',
      '#dql-menu .dql-sep{height:1px;background:rgba(0,0,0,.08);margin:4px 8px;}',
      '@media (prefers-color-scheme:dark){',
      '#dql-btn{background:linear-gradient(135deg,rgba(77,107,254,.16),rgba(122,155,255,.10));border-color:rgba(77,107,254,.30);',
      'box-shadow:0 2px 10px rgba(0,0,0,.28);}',
      '#dql-btn:hover{background:linear-gradient(135deg,rgba(77,107,254,.24),rgba(122,155,255,.16));}',
      '#dql-btn img{filter:drop-shadow(0 1px 3px rgba(0,0,0,.45));opacity:.95;}',
      '#dql-btn .dql-fallback{color:#dfe4ff;}',
      '#dql-btn.busy::after{border-color:rgba(255,255,255,.22);border-top-color:#fff;}',
      '#dql-menu{background:rgba(36,38,42,.985);color:#e8eaed;border-color:rgba(255,255,255,.10);}',
      '#dql-menu .dql-mi:hover{background:rgba(122,145,255,.16);}',
      '#dql-menu .dql-mhead{color:#aab8ff;}',
      '#dql-menu .dql-sep{background:rgba(255,255,255,.10);}',
      '}',
      '#dql-modal{position:fixed;inset:0;z-index:2147483004;display:none;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,.38);font:12px/1.5 "Segoe UI","Microsoft YaHei",sans-serif;color:#1f2329;}',
      '#dql-modal.show{display:flex;}',
      '#dql-modal .dql-panel{width:400px;max-width:92vw;max-height:86vh;overflow:auto;border-radius:14px;',
      'background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.32);padding:16px 18px;}',
      '#dql-modal .dql-mhead{display:flex;align-items:center;margin-bottom:12px;}',
      '#dql-modal .dql-mtitle{flex:1;font-size:14px;font-weight:600;}',
      '#dql-modal .dql-x{border:0;background:transparent;font-size:14px;cursor:pointer;opacity:.6;color:inherit;}',
      '#dql-modal .dql-field{margin-bottom:12px;}',
      '#dql-modal .dql-label{display:block;margin-bottom:4px;font-weight:600;font-size:11.5px;opacity:.75;}',
      '#dql-modal .dql-input{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;',
      'border:1px solid rgba(0,0,0,.18);font-size:12px;font-family:inherit;background:transparent;color:inherit;}',
      '#dql-modal .dql-input:focus{outline:2px solid rgba(76,111,255,.35);border-color:#4c6fff;}',
      '#dql-modal select.dql-input{appearance:auto;background:transparent;color:inherit;}',
      '#dql-modal .dql-note{font-size:10.5px;opacity:.55;margin-top:4px;line-height:1.45;}',
      '#dql-modal .dql-check{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;}',
      '#dql-modal .dql-check input{width:14px;height:14px;accent-color:#4c6fff;}',
      '#dql-modal .dql-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:6px;}',
      '#dql-modal .dql-abtn{border:0;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;',
      'background:rgba(0,0,0,.06);color:inherit;}',
      '#dql-modal .dql-abtn.primary{background:#4c6fff;color:#fff;}',
      '#dql-modal .dql-abtn:hover{filter:brightness(.96);}',
      '#dql-modal .dql-msgerr{color:#b91c1c;font-size:11px;min-height:16px;margin-top:2px;}',
      '@media (prefers-color-scheme:dark){',
      '#dql-modal{color:#e8eaed;}',
      '#dql-modal .dql-panel{background:#24262b;}',
      '#dql-modal .dql-input{border-color:rgba(255,255,255,.18);}',
      '#dql-modal .dql-abtn{background:rgba(255,255,255,.1);}',
      '}',
    ].join('')
    var style = el('style')
    style.id = STYLE_ID
    style.textContent = css
    ;(document.head || document.documentElement).appendChild(style)
  }

  // ---------- DOM ----------
  var wrap = null
  var revealed = false
  var btn = null
  var menu = null
  var toast = null
  var modal = null

  function clampPos(left, top) {
    left = Math.max(4, Math.min(left, window.innerWidth - 60))
    top = Math.max(4, Math.min(top, window.innerHeight - 60))
    return { left: left, top: top }
  }
  function applyPos(left, top) {
    var p = clampPos(left, top)
    wrap.style.left = p.left + 'px'
    wrap.style.bottom = 'auto'
    wrap.style.top = p.top + 'px'
  }

  // ---------- 随机漂浮：窗口内缓慢移动，碰到边界 Q 弹回弹 ----------
  var floatState = { raf: null, last: 0, x: 20, y: 20, vx: 26, vy: 20, pausedUntil: 0 }

  function floatEnabled() {
    return !(state.config && state.config.float === false)
  }

  function stopFloat() {
    if (floatState.raf) {
      try { cancelAnimationFrame(floatState.raf) } catch (err) {}
      floatState.raf = null
    }
  }

  function floatBounds() {
    var w = wrap && wrap.offsetWidth ? wrap.offsetWidth : 56
    var h = wrap && wrap.offsetHeight ? wrap.offsetHeight : 56
    var margin = 8
    var full = !!(state.config && state.config.floatRange === 'full')
    var maxX
    if (full) {
      maxX = Math.max(margin, window.innerWidth - w - margin)
    } else {
      // 左侧栏范围：约窗口宽度的 1/4（限制在 220–360px 内），只在这一带内左右漂浮
      var sidebar = Math.min(360, Math.max(220, Math.round(window.innerWidth * 0.26)))
      maxX = Math.max(margin, sidebar - w)
    }
    return {
      minX: margin,
      minY: margin,
      maxX: maxX,
      maxY: Math.max(margin, window.innerHeight - h - margin),
    }
  }

  function startFloat() {
    if (!wrap || floatState.raf) return
    var b = floatBounds()
    var rect = wrap.getBoundingClientRect()
    floatState.x = Math.min(Math.max(rect.left, b.minX), b.maxX)
    floatState.y = Math.min(Math.max(rect.top, b.minY), b.maxY)
    if (!floatState.vx && !floatState.vy) {
      var ang = Math.random() * Math.PI * 2
      var sp = 20 + Math.random() * 16
      floatState.vx = Math.cos(ang) * sp
      floatState.vy = Math.sin(ang) * sp
    }
    floatState.last = 0
    floatState.raf = requestAnimationFrame(floatStep)
  }

  function floatStep(ts) {
    if (!wrap) { floatState.raf = null; return }
    if (!floatEnabled() || document.hidden) { floatState.raf = null; return }
    if (!floatState.last) floatState.last = ts
    var dt = Math.min(0.05, (ts - floatState.last) / 1000)
    floatState.last = ts
    if (Date.now() >= floatState.pausedUntil && dt > 0) {
      var b = floatBounds()
      floatState.x += floatState.vx * dt
      floatState.y += floatState.vy * dt
      var bounced = false
      if (floatState.x <= b.minX) { floatState.x = b.minX; floatState.vx = Math.abs(floatState.vx); bounced = true }
      else if (floatState.x >= b.maxX) { floatState.x = b.maxX; floatState.vx = -Math.abs(floatState.vx); bounced = true }
      if (floatState.y <= b.minY) { floatState.y = b.minY; floatState.vy = Math.abs(floatState.vy); bounced = true }
      else if (floatState.y >= b.maxY) { floatState.y = b.maxY; floatState.vy = -Math.abs(floatState.vy); bounced = true }
      if (bounced) {
        var ang2 = Math.atan2(floatState.vy, floatState.vx) + (Math.random() - 0.5) * 0.4
        var sp2 = Math.sqrt(floatState.vx * floatState.vx + floatState.vy * floatState.vy)
        floatState.vx = Math.cos(ang2) * sp2
        floatState.vy = Math.sin(ang2) * sp2
        triggerBounce()
      }
      wrap.style.left = floatState.x.toFixed(2) + 'px'
      wrap.style.top = floatState.y.toFixed(2) + 'px'
      wrap.style.bottom = 'auto'
    }
    floatState.raf = requestAnimationFrame(floatStep)
  }

  function syncFloat() {
    if (!wrap) return
    if (!revealed) { stopFloat(); return }
    if (floatEnabled()) startFloat()
    else stopFloat()
  }

  function triggerBounce() {
    if (!btn) return
    btn.classList.remove('dql-bounce')
    void btn.offsetWidth
    btn.classList.add('dql-bounce')
    setTimeout(function () { btn.classList.remove('dql-bounce') }, 460)
  }

  function build() {
    ensureStyle()

    wrap = el('div')
    wrap.id = 'dql-wrap'
    var floatBox = el('div')
    floatBox.id = 'dql-float'

    btn = el('button')
    btn.id = 'dql-btn'
    btn.title = '左键：一键启动 · 右键：路径配置 / 重启'
    var img = el('img')
    img.src = ICON_URL
    img.alt = 'GPT'
    img.draggable = false
    img.addEventListener('error', function () {
      try { btn.removeChild(img) } catch (err) {}
      if (!btn.querySelector('.dql-fallback')) btn.appendChild(el('span', 'dql-fallback', 'GPT'))
    })
    btn.appendChild(img)
    floatBox.appendChild(btn)
    wrap.appendChild(floatBox)
    document.body.appendChild(wrap)

    // 打开界面 3 秒后再淡入出现（之前不可见、不可点、也不漂浮）
    setTimeout(function () {
      if (!wrap) return
      wrap.classList.add('dql-shown')
      revealed = true
      if (floatEnabled()) startFloat()
    }, 3000)

    var pos = loadPos()
    if (pos) applyPos(pos.left, pos.top)

    // 拖动 + 左键启动
    var drag = null
    btn.addEventListener('pointerdown', function (ev) {
      if (ev.button === 2) return
      stopFloat()
      var rect = wrap.getBoundingClientRect()
      drag = { startX: ev.clientX, startY: ev.clientY, left: rect.left, top: rect.top, moved: false }
      try { btn.setPointerCapture(ev.pointerId) } catch (err) {}
    })
    btn.addEventListener('pointermove', function (ev) {
      if (!drag) return
      var dx = ev.clientX - drag.startX
      var dy = ev.clientY - drag.startY
      if (!drag.moved && Math.sqrt(dx * dx + dy * dy) > 5) drag.moved = true
      if (drag.moved) applyPos(drag.left + dx, drag.top + dy)
    })
    btn.addEventListener('pointerup', function () {
      if (!drag) return
      var moved = drag.moved
      drag = null
      var rect = wrap.getBoundingClientRect()
      floatState.x = rect.left
      floatState.y = rect.top
      // 拖动后 30 秒内不漂移；单击只短暂停顿
      floatState.pausedUntil = Date.now() + (moved ? 30000 : 800)
      if (moved) {
        savePos(rect.left, rect.top)
      } else if (!state.busy) {
        runChain()
      }
      if (floatEnabled()) startFloat()
    })
    btn.addEventListener('pointercancel', function () {
      drag = null
      if (floatEnabled()) startFloat()
    })
    btn.addEventListener('pointerenter', function () {
      floatState.pausedUntil = Date.now() + 2500
    })

    // 右键菜单
    btn.addEventListener('contextmenu', function (ev) {
      ev.preventDefault()
      floatState.pausedUntil = Date.now() + 4000
      openMenu(ev.clientX, ev.clientY)
    })

    toast = el('div')
    toast.id = 'dql-toast'
    document.body.appendChild(toast)

    buildMenu()
    buildModal()

    document.addEventListener('pointerdown', function (ev) {
      if (menu && menu.classList.contains('show') && !menu.contains(ev.target)) hideMenu()
    }, true)
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { hideMenu(); closeModal() }
    })

    window.addEventListener('resize', function () {
      var rect = wrap.getBoundingClientRect()
      applyPos(rect.left, rect.top)
      var b = floatBounds()
      floatState.x = Math.min(Math.max(rect.left, b.minX), b.maxX)
      floatState.y = Math.min(Math.max(rect.top, b.minY), b.maxY)
      hideMenu()
    })
  }

  // ---------- 右键菜单 ----------
  function buildMenu() {
    menu = el('div')
    menu.id = 'dql-menu'

    var head = el('div', 'dql-mhead', '快速启动')
    menu.appendChild(head)
    menu.appendChild(el('div', 'dql-sep'))

    var setItem = el('div', 'dql-mi')
    setItem.appendChild(el('span', 'dql-mdot'))
    setItem.appendChild(el('span', 'dql-mlabel', '路径配置'))
    setItem.appendChild(el('span', 'dql-mhint', '程序路径 / 延迟 / 漂浮'))
    setItem.addEventListener('click', function () { hideMenu(); openSettings() })
    menu.appendChild(setItem)

    menu.appendChild(el('div', 'dql-sep'))

    var accItem = el('div', 'dql-mi')
    accItem.appendChild(el('span', 'dql-mdot'))
    accItem.appendChild(el('span', 'dql-mlabel', '重启'))
    accItem.appendChild(el('span', 'dql-mhint', ''))
    accItem.addEventListener('click', function () {
      hideMenu()
      restart('accelerator')
    })
    menu.appendChild(accItem)

    var gptItem = el('div', 'dql-mi')
    gptItem.appendChild(el('span', 'dql-mdot'))
    gptItem.appendChild(el('span', 'dql-mlabel', '重启'))
    gptItem.appendChild(el('span', 'dql-mhint', ''))
    gptItem.addEventListener('click', function () {
      hideMenu()
      restart('chatgpt')
    })
    menu.appendChild(gptItem)

    menu.__items = { accelerator: accItem, chatgpt: gptItem }
    document.body.appendChild(menu)
  }

  function updateMenuStatus() {
    if (!menu || !menu.__items) return
    var st = state.status || {}
    for (var id in menu.__items) {
      var item = menu.__items[id]
      var dotEl = item.querySelector('.dql-mdot')
      var hint = item.querySelector('.dql-mhint')
      var s = st[id] || {}
      var cls = 'dql-mdot'
      if (s.running) cls += ' on'
      dotEl.className = cls
      hint.textContent = s.running ? '运行中' : (s.configured === false || s.exists === false ? '未就绪' : '未运行')
      var cfgApps = (state.config && state.config.apps) || {}
      var autoName = (cfgApps[id] && cfgApps[id].label) || (id === 'accelerator' ? '加速器' : 'ChatGPT')
      var labelEl = item.querySelector('.dql-mlabel')
      if (labelEl) labelEl.textContent = '重启 ' + autoName
    }
  }

  function openMenu(x, y) {
    if (!menu) return
    updateMenuStatus()
    menu.classList.add('show')
    var w = menu.offsetWidth
    var h = menu.offsetHeight
    menu.style.left = Math.max(6, Math.min(x, window.innerWidth - w - 8)) + 'px'
    menu.style.top = Math.max(6, Math.min(y, window.innerHeight - h - 8)) + 'px'
  }
  function hideMenu() {
    if (menu) menu.classList.remove('show')
  }

  // ---------- 状态 / 动作 ----------
  function toastMsg(msg, isErr) {
    if (!toast) return
    var rect = btn.getBoundingClientRect()
    var top = rect.top - 34
    if (top < 4) top = rect.bottom + 8
    toast.style.left = Math.max(6, rect.left - 20) + 'px'
    toast.style.top = top + 'px'
    toast.textContent = msg
    toast.classList.toggle('err', !!isErr)
    toast.classList.add('show')
    if (state.toastTimer) clearTimeout(state.toastTimer)
    state.toastTimer = setTimeout(function () { toast.classList.remove('show') }, isErr ? 4000 : 2000)
  }

  function refresh() {
    return api(STATE_URL, { cache: 'no-store' }).then(function (data) {
      if (!data || !data.ok) return
      state.config = data.config
      state.status = data.status || {}
      state.busy = !!data.chainRunning
      updateMenuStatus()
      if (btn) btn.classList.toggle('busy', state.busy)
      syncFloat()
    }).catch(function () {})
  }

  function runChain() {
    if (state.busy) return
    state.busy = true
    btn.classList.add('busy')
    api(CHAIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (data) {
        var failed = (data.results || []).filter(function (r) { return !r.ok })
        var cfgApps = (state.config && state.config.apps) || {}
        var accName = (cfgApps.accelerator && cfgApps.accelerator.label) || '加速器'
        if (failed.length) toastMsg('部分失败：' + (failed[0].error || failed[0].id), true)
        else toastMsg(accName + ' 与 ChatGPT 已启动')
        return refresh()
      })
      .catch(function (err) {
        toastMsg('启动失败：' + fmtError(err), true)
      })
      .finally(function () {
        state.busy = false
        btn.classList.remove('busy')
      })
  }

  function restart(id) {
    if (state.busy) return
    state.busy = true
    btn.classList.add('busy')
    toastMsg('正在重启…')
    api(RESTART_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id }),
    }).then(function (data) {
      var cfgApps = (state.config && state.config.apps) || {}
      var name = (cfgApps[id] && cfgApps[id].label) || (id === 'accelerator' ? '加速器' : 'ChatGPT')
      if (data && data.ok) toastMsg(name + (data.wasRunning ? ' 已重启' : ' 已启动'))
      else toastMsg('重启失败：' + ((data && data.error) || '未知错误'), true)
      return refresh()
    }).catch(function (err) {
      toastMsg('重启失败：' + fmtError(err), true)
    }).finally(function () {
      state.busy = false
      btn.classList.remove('busy')
    })
  }

  // ---------- 设置面板 ----------
  function buildModal() {
    if (modal) return
    modal = el('div')
    modal.id = 'dql-modal'
    var panel = el('div', 'dql-panel')
    var head = el('div', 'dql-mhead')
    var title = el('span', 'dql-mtitle', '路径配置')
    var close = el('button', 'dql-x', '✕')
    head.appendChild(title)
    head.appendChild(close)

    var f1 = el('div', 'dql-field')
    var l1 = el('label', 'dql-label', '加速器程序路径')
    var i1 = el('input', 'dql-input')
    i1.placeholder = '例如 D:\\_App\\FalemonVPN\\Falemon.exe'
    f1.appendChild(l1)
    f1.appendChild(i1)
    f1.appendChild(el('div', 'dql-note', '名称自动从程序信息读取（改路径后自动更新）；支持 .exe 或 .lnk，保存时会检查文件是否存在。'))

    var f2 = el('div', 'dql-field')
    var l2 = el('label', 'dql-label', 'ChatGPT 的 AUMID（商店应用）')
    var i2 = el('input', 'dql-input')
    i2.placeholder = 'OpenAI.Codex_2p2nqsd0c76g0!App'
    f2.appendChild(l2)
    f2.appendChild(i2)
    f2.appendChild(el('div', 'dql-note', '点「检测」可自动识别商店版 ChatGPT。'))

    var f3 = el('div', 'dql-field')
    var l3 = el('label', 'dql-label', '启动间隔（毫秒）')
    var i3 = el('input', 'dql-input')
    i3.type = 'number'
    i3.min = '0'
    i3.max = '10000'
    i3.step = '100'
    f3.appendChild(l3)
    f3.appendChild(i3)
    f3.appendChild(el('div', 'dql-note', '加速器打开后等待多久再启动 ChatGPT；0 = 同时启动。默认 500。'))

    var f4 = el('div', 'dql-field')
    var chkLabel = el('label', 'dql-check')
    var chkFloat = el('input')
    chkFloat.type = 'checkbox'
    chkLabel.appendChild(chkFloat)
    chkLabel.appendChild(document.createTextNode('随机漂浮（缓慢移动，碰边 Q 弹回弹）'))
    f4.appendChild(chkLabel)

    var f5 = el('div', 'dql-field')
    var l5 = el('label', 'dql-label', '漂浮范围')
    var sel5 = el('select', 'dql-input')
    var optLeft = el('option')
    optLeft.value = 'left'
    optLeft.textContent = '左侧栏'
    var optFull = el('option')
    optFull.value = 'full'
    optFull.textContent = '全窗口'
    sel5.appendChild(optLeft)
    sel5.appendChild(optFull)
    f5.appendChild(l5)
    f5.appendChild(sel5)
    f5.appendChild(el('div', 'dql-note', '左侧栏 = 只在界面左侧约四分之一宽度内漂浮；全窗口 = 整个界面。'))

    var err = el('div', 'dql-msgerr', '')
    var actions = el('div', 'dql-actions')
    var detect = el('button', 'dql-abtn', '检测')
    var restore = el('button', 'dql-abtn', '恢复默认')
    var cancel = el('button', 'dql-abtn', '取消')
    var save = el('button', 'dql-abtn primary', '保存')
    actions.appendChild(detect)
    actions.appendChild(restore)
    actions.appendChild(cancel)
    actions.appendChild(save)

    panel.appendChild(head)
    panel.appendChild(f1)
    panel.appendChild(f2)
    panel.appendChild(f3)
    panel.appendChild(f4)
    panel.appendChild(f5)
    panel.appendChild(err)
    panel.appendChild(actions)
    modal.appendChild(panel)
    document.body.appendChild(modal)

    function fill() {
      var cfg = state.config || { delayMs: 1500, apps: {} }
      i1.value = (cfg.apps.accelerator && cfg.apps.accelerator.path) || ''
      i2.value = (cfg.apps.chatgpt && cfg.apps.chatgpt.aumid) || ''
      i3.value = String(cfg.delayMs != null ? cfg.delayMs : 500)
      chkFloat.checked = !(cfg.float === false)
      sel5.value = cfg.floatRange === 'full' ? 'full' : 'left'
      err.textContent = ''
    }
    modal.__fill = fill

    close.addEventListener('click', closeModal)
    cancel.addEventListener('click', closeModal)
    modal.addEventListener('click', function (ev) { if (ev.target === modal) closeModal() })

    detect.addEventListener('click', function () {
      err.textContent = '检测中…'
      api(DETECT_URL, { cache: 'no-store' }).then(function (data) {
        if (!data || !data.ok) throw new Error('检测失败')
        if (data.accelerator && data.accelerator.path) i1.value = data.accelerator.path
        if (data.chatgpt && data.chatgpt.detected && data.chatgpt.aumid) i2.value = data.chatgpt.aumid
        err.textContent = data.chatgpt && data.chatgpt.detected
          ? '已检测到 ChatGPT 应用'
          : '已填入加速器路径（ChatGPT 未识别，可手动填 AUMID）'
      }).catch(function (e) { err.textContent = '检测失败：' + fmtError(e) })
    })

    restore.addEventListener('click', function () {
      i1.value = 'D:\\_App\\FalemonVPN\\Falemon.exe'
      i2.value = 'OpenAI.Codex_2p2nqsd0c76g0!App'
      i3.value = '500'
      err.textContent = '已填入默认值，点「保存」生效'
    })

    save.addEventListener('click', function () {
      err.textContent = ''
      var path = i1.value.trim()
      if (!path) { err.textContent = '加速器路径不能为空'; return }
      var body = {
        delayMs: Number(i3.value),
        float: chkFloat.checked,
        floatRange: sel5.value,
        apps: {
          accelerator: { path: path },
          chatgpt: { aumid: i2.value.trim() },
        },
      }
      api(CONFIG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function () {
        closeModal()
        toastMsg('设置已保存')
        return refresh()
      }).catch(function (e) { err.textContent = '保存失败：' + fmtError(e) })
    })
  }

  function openSettings() {
    if (!modal) buildModal()
    modal.__fill()
    modal.classList.add('show')
  }
  function closeModal() {
    if (modal) modal.classList.remove('show')
  }

  // ---------- 启动 ----------
  function boot() {
    if (!document.body) { setTimeout(boot, 150); return }
    build()
    refresh()
    setInterval(function () { if (!document.hidden) refresh() }, 5000)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
