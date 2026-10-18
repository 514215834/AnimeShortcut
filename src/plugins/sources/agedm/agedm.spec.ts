import { describe, expect, it } from 'vitest'
import { createAgedmPlugin } from './index'
import { createPluginContext } from '../../host/context'
import { PluginError, type PluginManifest } from '../../host/types'
import homeList from './__fixtures__/home-list.json'
import updateP1 from './__fixtures__/update-p1-size3.json'
import searchP1 from './__fixtures__/search-juzhu-p1.json'
import detail20260293 from './__fixtures__/detail-20260293.json'
import catalogP1 from './__fixtures__/catalog-all-p1-size12.json'
import rankAll from './__fixtures__/rank-year-all.json'

function fakeRoute(url: string): unknown {
  if (url.includes('home-list')) return homeList
  if (url.includes('/update')) return updateP1
  if (url.includes('search?query=')) return searchP1
  if (url.includes('catalog?')) return catalogP1
  if (url.includes('rank?')) return rankAll
  if (url.includes('detail/')) return detail20260293
  throw new Error(`夹具未覆盖的 URL: ${url}`)
}

async function makePlugin() {
  const manifestRef = { current: null as PluginManifest | null }
  const ctx = createPluginContext(manifestRef, {
    transport: { fetchJson: async <T,>(url: string) => fakeRoute(url) as T },
  })
  const factory = createAgedmPlugin()
  const plugin = await factory(ctx)
  manifestRef.current = plugin.manifest
  await plugin.init({})
  return plugin
}

describe('agedm 插件（夹具回放）', () => {
  it('getWeeklySchedule：weekday 全部有效且覆盖多天', async () => {
    const p = await makePlugin()
    const r = await p.getWeeklySchedule!()
    expect(r.hasMore).toBe(false)
    expect(r.items.length).toBeGreaterThan(10)
    for (const it of r.items) {
      expect(it.weekday).toBeGreaterThanOrEqual(0)
      expect(it.weekday).toBeLessThanOrEqual(6)
      expect(it.title).toBeTruthy()
    }
    const day0 = r.items.filter((i) => i.weekday === 0)
    expect(day0.some((i) => i.title === '魔法★探险家')).toBe(true)
    // 周更封面由番剧 ID 构造（探测报告 §6）
    expect(r.items[0]?.cover).toMatch(/^https:\/\/cdn\.aqdstatic\.com:966\/age\/covers\/\d+\.jpg$/)
  })

  it('getLatestUpdates：分页与 hasMore', async () => {
    const p = await makePlugin()
    const r1 = await p.getLatestUpdates!(1)
    expect(r1.items).toHaveLength(3)
    expect(r1.hasMore).toBe(true) // total=5666 > 30
    expect(r1.items[0]?.title).toBe('脑洞学生会')
  })

  it('search：query 参数与结果映射', async () => {
    const p = await makePlugin()
    const r = await p.search!('咒术', 1)
    expect(r.items[0]?.title).toBe('咒术回战 死灭回游 前篇')
    expect(r.items[0]?.animeId).toBe('20260024')
  })

  it('getDetail：剧集按线路展开且跳转 URL 为 1-based', async () => {
    const p = await makePlugin()
    const d = await p.getDetail!('20260293')
    expect(d.title).toBeTruthy()
    expect(d.episodes.length).toBeGreaterThan(0)
    expect(d.episodes[0]?.playPageUrl).toBe('https://m.agedm.io/#/play/20260293/1/1')
    expect(d.episodes.every((e) => e.line)).toBe(true)
  })

  it('resolvePlay：episodeId l:e → 1-based 播放页', async () => {
    const p = await makePlugin()
    const r = await p.resolvePlay!('20260293', '1:0')
    expect(r.type).toBe('page')
    expect(r.url).toBe('https://m.agedm.io/#/play/20260293/2/1')
  })

  it('resolvePlay：非法剧集 id 抛 PARSE', async () => {
    const p = await makePlugin()
    await expect(p.resolvePlay!('20260293', '9:9')).rejects.toThrow(PluginError)
  })

  it('getCatalogMeta：四组筛选定义', async () => {
    const p = await makePlugin()
    const meta = p.getCatalogMeta!()
    expect(meta.map((g) => g.key)).toEqual(['region', 'genre', 'letter', 'year'])
    expect(meta[0]?.options.some((o) => o.value === '日本')).toBe(true)
    expect(meta[3]?.options.length).toBeGreaterThan(15)
  })

  it('getCatalog：带筛选参数且结果含封面', async () => {
    const p = await makePlugin()
    const r = await p.getCatalog!({ region: 'all', genre: 'all', letter: 'all', year: 'all' }, 1)
    expect(r.items).toHaveLength(12)
    expect(r.items[0]?.cover).toBeTruthy()
    expect(r.hasMore).toBe(true) // total=5666
  })

  it('getRank：周/月/总三组榜单映射', async () => {
    const p = await makePlugin()
    const groups = await p.getRank!('all')
    expect(groups).toHaveLength(3)
    expect(groups.map((g) => g.name)).toEqual(['周榜', '月榜', '总榜'])
    expect(groups[0]?.entries[0]).toMatchObject({ rankNo: 1, title: expect.any(String), score: expect.any(String) })
    expect(groups[0]?.entries).toHaveLength(50)
  })
})
