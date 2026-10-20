// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createYinhuadmPlugin } from './index'
import { createPluginContext } from '../../host/context'
import { PluginError, type PluginManifest } from '../../host/types'
import weekHtml from './__fixtures__/week-normal.html?raw'
import latestP1 from './__fixtures__/latest-normal-p1.json'
import searchP1 from './__fixtures__/search-laiziyuanfang-p1.json'
import detail29515 from './__fixtures__/detail-29515.json'
import searchEmpty from './__fixtures__/search-empty-p1.json'

const WEEK_URL = 'https://www.yinhuadm.cc/label/week.html'

function fakeRoute(url: string): unknown {
  if (url.includes('ac=detail&pg=') && !url.includes('wd=') && !url.includes('ids=')) return latestP1
  if (url.includes('wd=')) return searchP1
  if (url.includes('ids=29515')) return detail29515
  if (url.includes('ac=list')) return latestP1
  throw new Error(`夹具未覆盖的 URL: ${url}`)
}

async function makePlugin(weekHtmlText: string = weekHtml) {
  const manifestRef = { current: null as PluginManifest | null }
  const ctx = createPluginContext(manifestRef, {
    transport: {
      fetchJson: async <T,>(url: string) => fakeRoute(url) as T,
      fetchText: async (url: string) => {
        if (url === WEEK_URL) return weekHtmlText
        throw new Error(`夹具未覆盖的文本 URL: ${url}`)
      },
    },
  })
  const factory = createYinhuadmPlugin()
  const plugin = await factory(ctx)
  manifestRef.current = plugin.manifest
  await plugin.init({})
  return plugin
}

describe('yinhuadm 插件（夹具回放）', () => {
  it('getWeeklySchedule：七个分日面板按周一~周日映射，卡片字段齐全', async () => {
    const p = await makePlugin()
    const r = await p.getWeeklySchedule!()
    expect(r.hasMore).toBe(false)
    expect(r.items.length).toBeGreaterThan(50)
    const weekdays = new Set(r.items.map((i) => i.weekday))
    for (const d of [0, 1, 2, 3, 4, 5, 6]) expect(weekdays.has(d)).toBe(true)
    const monday = r.items.filter((i) => i.weekday === 1)
    expect(monday.some((i) => i.title === '来自远方')).toBe(true)
    const it = monday.find((i) => i.title === '来自远方')
    expect(it?.animeId).toBe('29515')
    expect(it?.cover).toMatch(/^https:\/\/img-dm\.l-il\.cn\//)
    expect(it?.latestEpisodeTitle).toContain('更新')
    expect(it?.playPageUrl).toBe('https://www.yinhuadm.cc/v/29515.html')
  })

  it('getWeeklySchedule：周表面板缺失时抛 PARSE（源站可能改版）', async () => {
    const p = await makePlugin('<div class="page">结构变了</div>')
    await expect(p.getWeeklySchedule!()).rejects.toThrow(PluginError)
  })

  it('getLatestUpdates：分页语义与字段映射', async () => {
    const p = await makePlugin()
    const r = await p.getLatestUpdates!(1)
    expect(r.items).toHaveLength(3) // 夹具裁剪为 3 条
    expect(r.hasMore).toBe(true) // page 1 < pagecount 700
    const first = r.items[0]
    expect(first?.title).toBe('七龙珠超：比鲁斯')
    expect(first?.animeId).toBe('29558')
    expect(first?.latestEpisodeTitle).toBe('更新至第02集')
    expect(first?.updateTime).toBeGreaterThan(0)
    expect(first?.cover).toMatch(/^https:\/\//)
  })

  it('search：关键词命中与空结果语义', async () => {
    const p = await makePlugin()
    const r = await p.search!('来自远方', 1)
    expect(r.items).toHaveLength(2)
    expect(r.items[0]?.title).toBe('来自远方')
    const empty = await p.search!('zzz不存在的番剧名qqq', 1)
    // 搜索夹具路由按 wd= 命中 searchP1；空结果用例由 detail-empty 专测见下
    expect(Array.isArray(empty.items)).toBe(true)
  })

  it('search：空结果返回空列表不抛错', async () => {
    // 专测空结果夹具：wd 命中空集
    const manifestRef = { current: null as PluginManifest | null }
    const ctx = createPluginContext(manifestRef, {
      transport: {
        fetchJson: async <T,>() => searchEmpty as T,
        fetchText: async () => weekHtml,
      },
    })
    const plugin = await (createYinhuadmPlugin())(ctx)
    manifestRef.current = plugin.manifest
    await plugin.init({})
    const r = await plugin.search!('不存在', 1)
    expect(r.items).toHaveLength(0)
    expect(r.hasMore).toBe(false)
  })

  it('getDetail：元信息、简介剥标签与三线路剧集展开', async () => {
    const p = await makePlugin()
    const d = await p.getDetail!('29515')
    expect(d.title).toBe('来自远方')
    expect(d.animeId).toBe('29515')
    expect(d.genres.length).toBeGreaterThan(0)
    expect(d.description).toBeTruthy()
    expect(d.description).not.toMatch(/<[^>]+>/)
    expect(d.playPageUrl).toBe('https://www.yinhuadm.cc/v/29515.html')
    // 3 条线路 × 3 集（API vod_play_from 顺序：bfzym3u8/ffm3u8/lzm3u8）
    expect(d.episodes).toHaveLength(9)
    const line0 = d.episodes.filter((e) => e.lineIndex === 0)
    expect(line0.map((e) => e.title)).toEqual(['第1集', '第2集', '第3集'])
    expect(line0[0]?.line).toBe('暴风') // vod_play_from[0] = bfzym3u8
    expect(line0[0]?.episodeId).toBe('0:0')
    expect(line0[0]?.playPageUrl).toBe('https://www.yinhuadm.cc/p/29515-1-1.html')
    const line1 = d.episodes.filter((e) => e.lineIndex === 1)
    expect(line1[0]?.line).toBe('非凡')
    expect(line1[0]?.playPageUrl).toBe('https://www.yinhuadm.cc/p/29515-2-1.html')
    const line2 = d.episodes.filter((e) => e.lineIndex === 2)
    expect(line2[0]?.line).toBe('量子')
    expect(line2[0]?.playPageUrl).toBe('https://www.yinhuadm.cc/p/29515-3-1.html')
  })

  it('resolvePlay：m3u8 直链 → stream', async () => {
    const p = await makePlugin()
    const r = await p.resolvePlay!('29515', '0:0')
    expect(r.type).toBe('stream')
    expect(r.url).toMatch(/^https:\/\/fengbao13\.com\/video\/.*index\.m3u8$/)
    expect(r.referer).toBe('https://www.yinhuadm.cc/')
  })

  it('resolvePlay：不存在的剧集抛 PARSE', async () => {
    const p = await makePlugin()
    await expect(p.resolvePlay!('29515', '9:9')).rejects.toThrow(PluginError)
    await expect(p.resolvePlay!('29515', 'abc')).rejects.toThrow(PluginError)
  })

  it('getDetail：decodeEntities 为异步（Worker RPC 形态）时简介仍正确解析', async () => {
    // Worker 沙箱下 ctx.utils.decodeEntities 经 postMessage 桥接返回 Promise（规范 §10），
    // 插件必须 await —— 回归：同步误用会以 "s.replace is not a function" 炸掉整个 getDetail
    const manifestRef = { current: null as PluginManifest | null }
    const ctx = createPluginContext(manifestRef, {
      transport: {
        fetchJson: async <T,>(url: string) => fakeRoute(url) as T,
        fetchText: async () => weekHtml,
      },
    })
    const factory = createYinhuadmPlugin()
    // Worker 沙箱下 decodeEntities 实际返回 Promise，但宿主类型声明为同步（规范 §6）——
    // 此处按运行时实态模拟并 cast，插件侧必须 await 兼容两种形态
    const asyncDecode = (s: string): string => Promise.resolve(ctx.utils.decodeEntities(s)) as unknown as string
    const plugin = await factory({ ...ctx, utils: { ...ctx.utils, decodeEntities: asyncDecode } })
    manifestRef.current = plugin.manifest
    await plugin.init({})
    const d = await plugin.getDetail!('29515')
    expect(d.description).toBeTruthy()
    expect(d.description).not.toMatch(/<[^>]+>/)
    expect(d.episodes).toHaveLength(9)
  })

  it('getDetail：接口返回空列表（无效 id）抛 PARSE', async () => {
    const manifestRef = { current: null as PluginManifest | null }
    const ctx = createPluginContext(manifestRef, {
      transport: {
        fetchJson: async <T,>() => searchEmpty as T,
        fetchText: async () => weekHtml,
      },
    })
    const plugin = await (createYinhuadmPlugin())(ctx)
    manifestRef.current = plugin.manifest
    await plugin.init({})
    await expect(plugin.getDetail!('999999999')).rejects.toThrow(PluginError)
  })

  it('API 响应结构异常（code!==1）抛 PARSE', async () => {
    const manifestRef = { current: null as PluginManifest | null }
    const ctx = createPluginContext(manifestRef, {
      transport: {
        fetchJson: async <T,>() => ({ code: 500, msg: '系统错误' }) as T,
        fetchText: async () => weekHtml,
      },
    })
    const plugin = await (createYinhuadmPlugin())(ctx)
    manifestRef.current = plugin.manifest
    await plugin.init({})
    await expect(plugin.getLatestUpdates!(1)).rejects.toThrow(PluginError)
  })
})
