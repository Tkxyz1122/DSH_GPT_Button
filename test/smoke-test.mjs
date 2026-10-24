// 本地冒烟测试：用模拟的 cordis 上下文加载插件，逐个调用路由（不真正启动程序）。
// 用法：node test/smoke-test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginPath = path.join(here, '..', 'lib', 'index.js')
const mod = await import(pathToFileURL(pluginPath).href)
const plugin = mod.default

const routes = new Map()
const tapIndexFns = []
const injectRows = []
let initCb = null
const cleanupFns = []

const fakeCtx = {
  webServer: {
    register(route) {
      routes.set(route.path, route)
      return () => {}
    },
    tapIndex(fn) {
      tapIndexFns.push(fn)
      return () => {}
    },
  },
  effect(fn) {
    const fn2 = fn && fn()
    if (typeof fn2 === 'function') cleanupFns.push(fn2)
    return () => {}
  },
}

const root = {
  on(event, cb) {
    if (event === 'webserver/index-inject') initCb = cb
    return () => {}
  },
  inject(services, cb) {
    if (!Array.isArray(services)) throw new Error('inject expects array')
    cb(fakeCtx)
  },
  effect(fn) {
    const fn2 = fn && fn()
    if (typeof fn2 === 'function') cleanupFns.push(fn2)
    return () => {}
  },
}

plugin.apply(root)

if (typeof initCb !== 'function') throw new Error('index-inject 回调未注册')
initCb(injectRows)
if (!injectRows.some((r) => r.kind === 'script' && r.text && r.text.includes('/dsh-launch/widget.js'))) {
  throw new Error('桌面注入行未加入')
}
if (tapIndexFns.length !== 1) throw new Error('tapIndex 未注册')

function call(routePath, method = 'GET', body = null) {
  const route = routes.get(routePath)
  if (!route) throw new Error('route not found: ' + routePath)
  return new Promise((resolve) => {
    const chunks = []
    const res = {
      statusCode: 0,
      headers: null,
      body: '',
      writeHead(code, headers) {
        this.statusCode = code
        this.headers = headers
      },
      end(chunk) {
        if (chunk) this.body += String(chunk)
        resolve(this)
      },
    }
    const req = {
      method,
      headers: { host: '127.0.0.1:53946' },
      url: routePath,
      on(ev, cb) {
        if (ev === 'data' && body) cb(Buffer.from(body))
        if (ev === 'end') cb()
      },
      destroy() {},
    }
    try {
      route.handler(req, res)
    } catch (err) {
      resolve({ statusCode: 0, body: 'THROW ' + err.message, headers: null })
    }
  })
}

const r1 = await call('/dsh-launch/state.json')
const st1 = JSON.parse(r1.body)
console.log('state.json ->', r1.statusCode, st1.ok, 'label=', st1.config.apps.accelerator.label, 'proc=', st1.config.apps.accelerator.processName, 'delay=', st1.config.delayMs, 'float=', st1.config.float)

const r2 = await call('/dsh-launch/config')
console.log('config GET ->', r2.statusCode, JSON.parse(r2.body).ok)

const r3 = await call('/dsh-launch/widget.js')
console.log('widget.js ->', r3.statusCode, r3.body.slice(0, 40).replace(/\n/g, ' '))

const r4 = await call('/dsh-launch/config', 'POST', JSON.stringify({
  delayMs: 500,
  float: true,
  floatRange: 'left',
  apps: {
    accelerator: { path: 'D:\\_App\\FalemonVPN\\Falemon.exe' },
    chatgpt: { aumid: 'OpenAI.Codex_2p2nqsd0c76g0!App' },
  },
}))
console.log('config POST ->', r4.statusCode, JSON.parse(r4.body).ok, 'delay=', JSON.parse(r4.body).config.delayMs, 'float=', JSON.parse(r4.body).config.float, 'range=', JSON.parse(r4.body).config.floatRange)

const r5 = await call('/dsh-launch/restart')
console.log('restart GET (expect 405) ->', r5.statusCode)

const r6 = await call('/dsh-launch/gpt-icon.png')
console.log('gpt-icon ->', r6.statusCode, 'pngMagic=', r6.body.charCodeAt(0) === 137)

console.log('SMOKE_OK')
