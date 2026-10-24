// dsh-quick-launcher —— 宿主半区
// 在 DSH 宿主进程里注册 /dsh-launch/* 路由，用 spawn 真正拉起本机程序。
// 前端半区（assets/launcher-widget.js）负责界面，两者通过 HTTP 通信。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

// 配置落点：$DSH_HOME 优先（与鲸鱼插件同一策略），便于随宿主数据一起备份。
const CONFIG_CANDIDATES = [
  path.join(DSH_HOME, '.dsh-launch.json'),
  path.join(DSH_HOME, 'profiles', 'desktop', '.dsh-launch.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dsh-launch.json'),
]

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
}

const DEFAULT_CONFIG = {
  version: 1,
  delayMs: 500,
  float: true,
  floatRange: 'left',
  apps: {
    accelerator: {
      label: '',
      enabled: true,
      kind: 'exe',
      path: 'D:\\_App\\FalemonVPN\\Falemon.exe',
      processName: '',
    },
    chatgpt: {
      label: 'ChatGPT',
      enabled: true,
      kind: 'aumid',
      aumid: 'OpenAI.Codex_2p2nqsd0c76g0!App',
      processName: 'ChatGPT.exe',
    },
  },
}

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
}

// 配置合并：只认已知字段，缺失的沿用默认值（避免残缺配置把路径洗成空）。
function normalizeConfig(raw) {
  const out = cloneDefault()
  if (!raw || typeof raw !== 'object') return out
  if (typeof raw.delayMs === 'number' && raw.delayMs >= 0 && raw.delayMs <= 10000) {
    out.delayMs = Math.round(raw.delayMs)
  }
  if (typeof raw.float === 'boolean') out.float = raw.float
  if (raw.floatRange === 'left' || raw.floatRange === 'full') out.floatRange = raw.floatRange
  const apps = raw.apps && typeof raw.apps === 'object' ? raw.apps : {}
  for (const id of ['accelerator', 'chatgpt']) {
    const incoming = apps[id]
    if (!incoming || typeof incoming !== 'object') continue
    const target = out.apps[id] || (out.apps[id] = {})
    for (const key of ['label', 'enabled', 'kind', 'path', 'processName', 'aumid', 'url']) {
      if (incoming[key] !== undefined) target[key] = incoming[key]
    }
  }
  return out
}

function readConfig() {
  for (const p of CONFIG_CANDIDATES) {
    try {
      const text = fs.readFileSync(p, 'utf8')
      return normalizeConfig(JSON.parse(text))
    } catch (err) {
      // 文件不存在或坏 JSON：继续尝试下一个候选
    }
  }
  return cloneDefault()
}

function writeConfig(cfg) {
  const text = JSON.stringify(cfg, null, 2) + '\n'
  for (const p of CONFIG_CANDIDATES) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, text, 'utf8')
      return { ok: true, path: p }
    } catch (err) {
      // 不可写就换下一个
    }
  }
  return { ok: false, error: '没有可写的配置目录' }
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

// —— 名称 / 进程名自动推导（不写死）——
function psSingleQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'"
}

function runPowerShell(script, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(String(script), 'utf16le').toString('base64')
    let child
    try {
      child = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (err) {
      return resolve('')
    }
    let out = ''
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch (err) {}
      finish(out.trim())
    }, timeoutMs)
    child.stdout.on('data', (d) => { out += String(d) })
    child.on('error', () => { clearTimeout(timer); finish('') })
    child.on('close', () => { clearTimeout(timer); finish(out.trim()) })
  })
}

// 从 exe / lnk 的文件版本信息里读显示名；读不到再退回文件名。
async function queryExeLabel(filePath) {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$p = ' + psSingleQuote(filePath),
    'if (-not (Test-Path -LiteralPath $p)) { exit 0 }',
    '$target = $p',
    "if ([IO.Path]::GetExtension($p) -eq '.lnk') { try { $target = (New-Object -ComObject WScript.Shell).CreateShortcut($p).TargetPath } catch {} }",
    'if ([string]::IsNullOrWhiteSpace($target)) { $target = $p }',
    '$vi = (Get-Item -LiteralPath $target).VersionInfo',
    '$name = $vi.FileDescription',
    'if ([string]::IsNullOrWhiteSpace($name)) { $name = $vi.ProductName }',
    'if ([string]::IsNullOrWhiteSpace($name)) { $name = [IO.Path]::GetFileNameWithoutExtension($target) }',
    'Write-Output $name',
  ].join('; ')
  return runPowerShell(script)
}

function fallbackLabel(app) {
  if (!app) return '未配置'
  if (app.kind === 'aumid') return app.label || 'ChatGPT'
  if (!app.path) return app.label || '未配置'
  const base = path.basename(app.path).replace(/\.(exe|lnk)$/i, '')
  return base || app.label || '未配置'
}

// 文件描述常是全小写（例如 Falemon.exe 的描述就是 "falemon"），首字母大写更像个名字。
function prettifyName(raw) {
  let name = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!name) return ''
  if (/^[a-z]/.test(name)) name = name.charAt(0).toUpperCase() + name.slice(1)
  return name
}

const labelCache = new Map() // path -> 显示名
const labelInFlight = new Map() // path -> Promise<string>

async function resolveLabel(app) {
  if (!app) return '未配置'
  if (app.kind !== 'exe' && app.kind !== 'lnk') return app.label || fallbackLabel(app)
  if (!app.path || !fs.existsSync(app.path)) return fallbackLabel(app)
  if (labelCache.has(app.path)) return labelCache.get(app.path)
  if (labelInFlight.has(app.path)) return labelInFlight.get(app.path)
  const pending = queryExeLabel(app.path).then((raw) => {
    const name = prettifyName(raw) || fallbackLabel(app)
    labelCache.set(app.path, name)
    labelInFlight.delete(app.path)
    return name
  }).catch(() => {
    labelInFlight.delete(app.path)
    return fallbackLabel(app)
  })
  labelInFlight.set(app.path, pending)
  return pending
}

// 进程名也由路径推导（配置里留空即可），避免写死 exe 名字。
function effectiveProcessName(app) {
  if (!app) return ''
  if (app.processName) return app.processName
  if (app.kind === 'exe' && app.path) return path.basename(app.path)
  return ''
}

// —— 启动实现 ——
// 说明：全部用 detached + ignore stdio，避免把子进程挂到宿主进程的标准流上。
function launchApp(app) {
  if (!app || typeof app !== 'object') return { ok: false, error: '应用配置缺失' }
  const kind = app.kind
  const base = { detached: true, stdio: 'ignore', windowsHide: true }
  try {
    if (kind === 'exe') {
      if (!app.path) return { ok: false, error: '未配置程序路径' }
      if (!fs.existsSync(app.path)) return { ok: false, error: '文件不存在：' + app.path }
      const child = spawn(app.path, [], { ...base, cwd: path.dirname(app.path) })
      child.on('error', () => {})
      child.unref()
      return { ok: true }
    }
    if (kind === 'lnk') {
      if (!app.path) return { ok: false, error: '未配置快捷方式路径' }
      if (!fs.existsSync(app.path)) return { ok: false, error: '文件不存在：' + app.path }
      // .lnk 不能直接 CreateProcess：用 start 让外壳解析。
      const child = spawn('cmd.exe', ['/c', 'start', '', app.path], base)
      child.on('error', () => {})
      child.unref()
      return { ok: true }
    }
    if (kind === 'url') {
      const url = String(app.url || '').trim()
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: '网址必须以 http(s):// 开头' }
      const child = spawn('cmd.exe', ['/c', 'start', '', url], base)
      child.on('error', () => {})
      child.unref()
      return { ok: true }
    }
    if (kind === 'aumid') {
      const aumid = String(app.aumid || '').trim()
      if (!aumid) return { ok: false, error: '未配置 AUMID' }
      // 商店应用（WindowsApps 受保护）只能通过 shell:AppsFolder 启动。
      const child = spawn('explorer.exe', ['shell:AppsFolder\\' + aumid], base)
      child.on('error', () => {})
      child.unref()
      return { ok: true }
    }
    return { ok: false, error: '不支持的类型：' + kind }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
}

// —— 运行状态查询 ——（tasklist 结果短缓存，避免前端轮询把宿主压满）
const statusCache = new Map() // id -> { ts, running }
const STATUS_TTL_MS = 4000

function queryRunning(processName) {
  return new Promise((resolve) => {
    if (!processName) return resolve(null)
    let child
    try {
      child = spawn('tasklist.exe', ['/FI', 'IMAGENAME eq ' + processName, '/NH', '/FO', 'CSV'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch (err) {
      return resolve(false)
    }
    let out = ''
    child.stdout.on('data', (d) => { out += String(d) })
    child.on('error', () => resolve(false))
    child.on('close', () => {
      try {
        resolve(new RegExp(escapeRegExp(processName), 'i').test(out))
      } catch (err) {
        resolve(false)
      }
    })
  })
}

async function appStatus(id, app) {
  const cached = statusCache.get(id)
  const now = Date.now()
  if (cached && now - cached.ts < STATUS_TTL_MS) return cached.running
  const running = await queryRunning(effectiveProcessName(app))
  statusCache.set(id, { ts: now, running })
  return running
}

// 结束进程（用于「重启」）：成功返回 true。
function killProcess(processName) {
  return new Promise((resolve) => {
    if (!processName) return resolve(false)
    let child
    try {
      child = spawn('taskkill.exe', ['/IM', processName, '/F'], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      })
    } catch (err) {
      return resolve(false)
    }
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

// —— 连招：加速器 →（延迟）→ ChatGPT ——
let chainRunning = false
let lastRun = null

async function runChain() {
  if (chainRunning) return { ok: false, error: '上一次启动还在进行中' }
  chainRunning = true
  const results = []
  try {
    const cfg = readConfig()
    const acc = cfg.apps.accelerator
    if (acc && acc.enabled !== false) {
      results.push({ id: 'accelerator', ...launchApp(acc) })
    }
    const delay = typeof cfg.delayMs === 'number' ? cfg.delayMs : 1500
    if (delay > 0) await sleep(delay)
    const gpt = cfg.apps.chatgpt
    if (gpt && gpt.enabled !== false) {
      results.push({ id: 'chatgpt', ...launchApp(gpt) })
    }
    lastRun = { ts: Date.now(), results }
  } finally {
    chainRunning = false
  }
  return { ok: results.every((r) => r.ok), results }
}

// —— HTTP 工具 ——
function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        try { req.destroy() } catch (err) {}
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function isLoopbackHostname(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!h) return false
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '::1') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  if (Number(m[1]) !== 127) return false
  return [m[2], m[3], m[4]].every((x) => Number(x) <= 255)
}

// 本机信任栅栏：只接受回环 Host、拒绝跨站标记、Origin 必须与 Host 同源。
// 目标程序在本机运行，被任意网页调用等于给了别人一个“任意启动器”，所以必须拦。
function fenceRejection(req) {
  try {
    const headers = (req && req.headers) || {}
    let hostUrl = null
    try {
      hostUrl = new URL('http://' + String(headers.host || ''))
    } catch (err) {
      return 403
    }
    if (!isLoopbackHostname(hostUrl.hostname)) return 403
    const site = String(headers['sec-fetch-site'] || '').toLowerCase()
    if (site === 'cross-site') return 403
    const origin = headers.origin
    if (typeof origin === 'string' && origin && origin !== 'null') {
      let originUrl = null
      try {
        originUrl = new URL(origin)
      } catch (err) {
        return 403
      }
      if (originUrl.host.toLowerCase() !== hostUrl.host.toLowerCase()) return 403
    }
    return null
  } catch (err) {
    return 403
  }
}

function sendJson(res, code, payload) {
  res.writeHead(code, JSON_HEADERS)
  res.end(JSON.stringify(payload))
}

// 桌面端启动时宿主只收集一次注入表 —— 行必须尽早注册，且用内联 script 行
// （script-src 行加载失败会 reject 整个 boot，见鲸鱼插件 issue #154 的记录）。
const DESKTOP_ROW_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'var s=document.createElement("script");s.src="/dsh-launch/widget.js";' +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

const WIDGET_FILE_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'launcher-widget.js'),
  path.join(PACKAGE_ROOT, 'assets', 'widget.js'),
]
let widgetCache = null // { text, mtimeMs }

function loadWidgetJs() {
  for (const p of WIDGET_FILE_CANDIDATES) {
    try {
      const st = fs.statSync(p)
      if (widgetCache && widgetCache.mtimeMs === st.mtimeMs) return widgetCache.text
      const text = fs.readFileSync(p, 'utf8')
      widgetCache = { text, mtimeMs: st.mtimeMs }
      return text
    } catch (err) {}
  }
  return widgetCache ? widgetCache.text : ''
}

// —— 自动探测 ——
function detectChatgptAumid() {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile', '-NonInteractive', '-Command',
          "Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1 -ExpandProperty PackageFamilyName",
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
      )
    } catch (err) {
      return resolve('')
    }
    let out = ''
    child.stdout.on('data', (d) => { out += String(d) })
    child.on('error', () => resolve(''))
    child.on('close', () => {
      const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      resolve(lines.length ? lines[lines.length - 1] + '!App' : '')
    })
  })
}

async function buildState() {
  const cfg = readConfig()
  const status = {}
  const apps = {}
  for (const id of ['accelerator', 'chatgpt']) {
    const app = cfg.apps[id] || {}
    const label = await resolveLabel(app)
    apps[id] = Object.assign({}, app, {
      label,
      processName: effectiveProcessName(app) || app.processName || '',
    })
    status[id] = {
      configured: app.enabled !== false
        ? (app.kind === 'aumid' ? !!(app.aumid || '').trim() : !!(app.path || '').trim())
        : false,
      exists: (app.kind === 'exe' || app.kind === 'lnk') ? !!app.path && fs.existsSync(app.path) : null,
      running: await appStatus(id, app),
    }
  }
  return {
    ok: true,
    version: 1,
    config: Object.assign({}, cfg, { apps }),
    status,
    chainRunning,
    lastRun,
  }
}

export default {
  name: 'dsh-quick-launcher',
  apply(root) {
    const rowDisposers = []
    root.effect(() => () => {
      for (const d of rowDisposers) {
        try { d() } catch (err) {}
      }
    })

    // ① 桌面端结构化注入行（必须尽早注册，宿主启动时只收集一次）
    rowDisposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf('/dsh-launch/widget.js') >= 0) return
        }
        table.push({ kind: 'script', placement: 'body', text: DESKTOP_ROW_TEXT })
      } catch (err) {}
    }))

    // ② 路由与页面注入：等 webServer 就绪
    root.inject(['webServer'], (ctx) => {
      const disposers = []

      function registerRoute(route) {
        const inner = route.handler
        const wrapped = Object.assign({}, route, {
          handler: async (req, res) => {
            const rejected = fenceRejection(req)
            if (rejected) {
              res.statusCode = rejected
              try { res.end() } catch (err) {}
              return
            }
            return inner(req, res)
          },
        })
        return ctx.webServer.register(wrapped)
      }

      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-launch/state.json',
        handler: async (req, res) => {
          try {
            sendJson(res, 200, await buildState())
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
          }
        },
      }))

      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-launch/open',
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const id = String(body.id || '')
            if (id !== 'accelerator' && id !== 'chatgpt') {
              return sendJson(res, 400, { ok: false, error: '未知目标：' + id })
            }
            const cfg = readConfig()
            const result = launchApp(cfg.apps[id])
            if (result.ok) {
              lastRun = { ts: Date.now(), results: [{ id, ...result }] }
              statusCache.delete(id)
            }
            sendJson(res, result.ok ? 200 : 500, result)
          } catch (err) {
            sendJson(res, 400, { ok: false, error: String((err && err.message) || err) })
          }
        },
      }))

      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-launch/chain',
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          try {
            const result = await runChain()
            for (const r of (result.results || [])) statusCache.delete(r.id)
            sendJson(res, result.ok ? 200 : 500, result)
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
          }
        },
      }))

      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-launch/config',
        handler: async (req, res) => {
          try {
            if (req.method === 'GET') {
              return sendJson(res, 200, { ok: true, config: readConfig() })
            }
            if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
            const patch = JSON.parse((await readBody(req)) || '{}')
            const next = normalizeConfig(patch)

            // 保存前做基本校验：exe/lnk 路径必须真实存在，aumid/url 必须非空。
            for (const id of ['accelerator', 'chatgpt']) {
              const app = next.apps[id]
              if (!app) continue
              const label = app.label || id
              if (app.kind === 'exe' || app.kind === 'lnk') {
                if (!app.path || !fs.existsSync(app.path)) {
                  return sendJson(res, 400, { ok: false, error: label + ' 的路径不存在：' + (app.path || '(空)') })
                }
              }
              if (app.kind === 'url' && !/^https?:\/\//i.test(String(app.url || ''))) {
                return sendJson(res, 400, { ok: false, error: label + ' 的网址格式不对' })
              }
              if (app.kind === 'aumid' && !String(app.aumid || '').trim()) {
                return sendJson(res, 400, { ok: false, error: label + ' 的 AUMID 不能为空' })
              }
            }

            const result = writeConfig(next)
            sendJson(res, result.ok ? 200 : 500, Object.assign({ ok: result.ok, config: next }, result.ok ? {} : { error: result.error }))
          } catch (err) {
            sendJson(res, 400, { ok: false, error: String((err && err.message) || err) })
          }
        },
      }))

      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-launch/detect.json',
        handler: async (req, res) => {
          try {
            const cfg = readConfig()
            const acceleratorPath = cfg.apps.accelerator.path || ''
            const aumid = await detectChatgptAumid()
            sendJson(res, 200, {
              ok: true,
              accelerator: { path: acceleratorPath, exists: !!acceleratorPath && fs.existsSync(acceleratorPath) },
              chatgpt: { aumid: aumid || cfg.apps.chatgpt.aumid || '', detected: !!aumid },
            })
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
          }
        },
      }))

      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-launch/restart',
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const id = String(body.id || '')
            if (id !== 'accelerator' && id !== 'chatgpt') {
              return sendJson(res, 400, { ok: false, error: '未知目标：' + id })
            }
            const cfg = readConfig()
            const app = cfg.apps[id]
            const wasRunning = await queryRunning(effectiveProcessName(app))
            let killed = false
            if (wasRunning && app && app.processName) {
              killed = await killProcess(app.processName)
              if (killed) await sleep(500)
            }
            const result = launchApp(app)
            statusCache.delete(id)
            if (result.ok) lastRun = { ts: Date.now(), results: [{ id, ...result, restarted: wasRunning }] }
            sendJson(res, result.ok ? 200 : 500, {
              ok: result.ok, id, wasRunning, killed,
              ...(result.ok ? {} : { error: result.error }),
            })
          } catch (err) {
            sendJson(res, 400, { ok: false, error: String((err && err.message) || err) })
          }
        },
      }))

      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-launch/gpt-icon.png',
        handler: (req, res) => {
          try {
            const bytes = fs.readFileSync(path.join(PACKAGE_ROOT, 'assets', 'gpt-icon.png'))
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' })
            res.end(bytes)
          } catch (err) {
            res.statusCode = 404
            res.end()
          }
        },
      }))

      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-launch/widget.js',
        handler: (req, res) => {
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          })
          res.end(loadWidgetJs())
        },
      }))

      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-launch/icon.png',
        handler: (req, res) => {
          try {
            const iconPath = path.join(PACKAGE_ROOT, 'icon.png')
            const bytes = fs.readFileSync(iconPath)
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' })
            res.end(bytes)
          } catch (err) {
            res.statusCode = 404
            res.end()
          }
        },
      }))

      // web 形态（dsh web）走 tapIndex；桌面端由上面的注入行负责。
      disposers.push(ctx.webServer.tapIndex((html) => {
        if (html.indexOf('/dsh-launch/widget.js') !== -1) return html
        const tag = '<script defer src="/dsh-launch/widget.js"></script>'
        if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
        return html + tag
      }))

      ctx.effect(() => () => {
        for (const d of disposers) {
          try { d() } catch (err) {}
        }
      })
    })
  },
}
