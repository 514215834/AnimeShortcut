/**
 * dmmiku 自检（规范 §13）：以 Worker 沙箱语义（ctx 全方法 Promise 化）+ §13 夹具回归。
 * 锁定回归类别：utils.decodeEntities 等异步 RPC 漏 await —— v1.0.0 曾以
 * 「TypeError: s.replace is not a function」炸穿全部列表/详情/排行能力（main 沙箱自测发现不了）。
 * 对象 = 实际发布产物 public/plugins/dmmiku.asplugin.json（保证「测的就是发的」）：
 *   npm run pack:plugins && node src/plugins/packages/dmmiku/self-check.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'public/plugins/dmmiku.asplugin.json'), 'utf8'))
// Node 无 self；Worker 沙箱中 self 即全局 —— 置为等价再求值（§5.1 挂载依赖它）
globalThis.self = globalThis
// eslint-disable-next-line no-new-func
new Function(pkg.code)()
const factory = globalThis.__AS_PLUGIN__
delete globalThis.self
delete globalThis.__AS_PLUGIN__
if (typeof factory !== 'function') {
  console.error('✗ code 未挂载 __AS_PLUGIN__ 工厂（§5.1）')
  process.exit(1)
}
const fixture = (name) =>
  readFileSync(path.join(root, `src/plugins/packages/dmmiku/__fixtures__/${name}`), 'utf8')
/** 与宿主 main 侧 ctx 等价的 decodeEntities（textarea 实体解码，context.ts 同款） */
function decodeEntitiesSync(text) {
  const win = new Window()
  const el = win.document.createElement('textarea')
  el.innerHTML = text
  return el.value
}
/** Worker 沙箱语义的 ctx 桩：所有方法一律 async（返回 Promise），漏 await 即抛 TypeError */
function makeCtx({ rules }) {
  return {
    env: { hostVersion: 'self-check', specVersion: '1.0', locale: 'zh-CN', timezone: 'Asia/Shanghai', mode: 'dev' },
    http: {
      async getText(url) {
        const hit = rules.find(([re]) => re.test(url))
        if (!hit) throw { code: 'NETWORK', message: `自检未映射该 URL: ${url}` }
        return fixture(hit[1])
      },
      async getJson(url) {
        return JSON.parse(await this.getText(url))
      },
    },
    dom: {
      async query(html, selector, o) {
        const win = new Window()
        const d = new win.DOMParser()
        const els = Array.from(d.parseFromString(html, 'text/html').querySelectorAll(selector))
        const pick = (el) => {
          if (!o?.attr) return el.textContent?.trim() ?? null
          if (o.attr === 'outerHTML') return el.outerHTML
          if (o.attr === 'innerHTML') return el.innerHTML
          return el.getAttribute(o.attr)
        }
        return o?.all ? els.map(pick) : els.length > 0 ? pick(els[0]) : null
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    utils: {
      async absUrl(base, p) {
        return new URL(p, base).href
      },
      async decodeEntities(text) {
        return decodeEntitiesSync(text)
      },
      async hashId(input) {
        let h = 5381
        for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0
        return h.toString(36)
      },
    },
  }
}
const BASE = 'https://www.dmmiku.com/'
const results = []
async function run(name, fn) {
  try {
    await fn()
    results.push(`✓ ${name}`)
  } catch (e) {
    results.push(`✗ ${name}: ${e?.code ?? ''} ${e?.message}`)
    process.exitCode = 1
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg ?? '断言失败')
}
await run('latest（map 页全量，走 zipCards ×N 次 clean）', async () => {
  const host = factory(makeCtx({
    rules: [[/\/index\.php\/map\/index\.html$/, 'latest-normal-p1.html']],
  }))
  await host.init({})
  const r = await host.getLatestUpdates(1)
  expect(Array.isArray(r.items) && r.items.length > 0, `items 应非空（实际 ${r.items.length}）`)
  for (const it of r.items) {
    expect(typeof it.title === 'string', `title 应为字符串（实际 ${typeof it.title}）`)
    expect(!it.title.includes('&amp;'), `title 未解实体: ${it.title}`)
    expect(String(it.playPageUrl).startsWith('https://'), 'playPageUrl 必须 https')
  }
  expect(r.hasMore === false, '单页全量 hasMore 恒 false')
})
await run('search（含实体解码）', async () => {
  const host = factory(makeCtx({
    rules: [[/\/vod\/search\.html\?wd=/, 'search-normal-p1.html']],
  }))
  await host.init({})
  const r = await host.search('海贼王')
  expect(r.items.length > 0, `items 应非空（实际 ${r.items.length}）`)
})
await run('detail（7 处 clean 全链路 await）', async () => {
  const host = factory(makeCtx({
    rules: [[/\/vod\/detail\/id\/\d+\.html$/, 'detail-normal-p1.html']],
  }))
  await host.init({})
  const d = await host.getDetail('1293')
  expect(typeof d.title === 'string' && d.title, 'title 应为非空字符串')
  expect(d.episodes.length > 0, 'episodes 应非空')
  expect(/^\d+:\d+$/.test(d.episodes[0].episodeId), `episodeId 应为 线路:集（实际 ${d.episodes[0].episodeId}）`)
  expect(d.episodes.every((e) => typeof e.title === 'string'), '剧集标题应为字符串')
})
await run('play：stream 直链（encrypt 解码链）', async () => {
  const host = factory(makeCtx({
    rules: [
      [/\/vod\/detail\/id\/\d+\.html$/, 'detail-normal-p1.html'],
      [/\/vod\/play\/id\/\d+\/sid\/1\/nid\/1\.html$/, 'play-stream-normal-p1.html'],
    ],
  }))
  await host.init({})
  const r = await host.resolvePlay('1293', '0:0')
  expect(r.type === 'stream' || r.type === 'page', `type 应为 stream/page（实际 ${r.type}）`)
  expect(r.url.startsWith('https://'), '播放 URL 必须 https')
})
await run('play：不可流播回落 page', async () => {
  const host = factory(makeCtx({
    rules: [
      [/\/vod\/detail\/id\/\d+\.html$/, 'detail-normal-p1.html'],
      [/\/vod\/play\/id\/\d+\/sid\/1\/nid\/1\.html$/, 'play-normal-p1.html'],
    ],
  }))
  await host.init({})
  const r = await host.resolvePlay('1293', '0:0')
  expect(r.type === 'stream' || r.type === 'page', `type 应为 stream/page（实际 ${r.type}）`)
})
await run('rank（详情页侧栏，循环内 clean）', async () => {
  const host = factory(makeCtx({
    rules: [[/\/vod\/detail\/id\/\d+\.html$/, 'rank-normal-p1.html']],
  }))
  await host.init({})
  const groups = await host.getRank()
  expect(groups.length > 0 && groups[0].entries.length > 0, '排行分组/条目应非空')
  expect(typeof groups[0].entries[0].title === 'string', '排行标题应为字符串')
})
await run('catalog（p1 列表 + hasMore）', async () => {
  const host = factory(makeCtx({
    rules: [[/\/vod\/show\//, 'catalog-normal-p1.html']],
  }))
  await host.init({})
  const r = await host.getCatalog({ type: '22' }, 1)
  expect(r.items.length > 0, `items 应非空（实际 ${r.items.length}）`)
  expect(typeof r.hasMore === 'boolean', 'hasMore 应为布尔')
})
await run('latest：改版页 → PARSE（错误契约）', async () => {
  const host = factory(makeCtx({
    rules: [[/\/index\.php\/map\/index\.html$/, 'latest-parse-error-p1.html']],
  }))
  await host.init({})
  try {
    await host.getLatestUpdates(1)
    throw new Error('应抛 PARSE 却成功返回')
  } catch (e) {
    expect(e.code === 'PARSE', `错误码应为 PARSE（实际 ${e.code}: ${e.message}）`)
  }
})
await run('search：空关键字 / 空结果页', async () => {
  const host = factory(makeCtx({
    rules: [[/\/vod\/search\.html\?wd=/, 'search-empty-p1.html']],
  }))
  await host.init({})
  const none = await host.search('')
  expect(none.items.length === 0 && none.hasMore === false, '空关键字应返回空集')
  const empty = await host.search('不存在的关键词')
  expect(empty.items.length === 0 && empty.hasMore === false, '空结果页应返回 { items: [], hasMore: false }')
})
console.log(results.join('\n'))
console.log(process.exitCode ? '\n自检未通过' : `\n自检通过（${results.filter((r) => r.startsWith('✓')).length}/${results.length}）`)
