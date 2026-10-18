import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initPluginHost, listSources, sources } from './host'
import { cacheClearAll } from '../../core/http/cache'
import { PluginError, type AnimeSourcePlugin, type PluginContext, type PluginFactory, type PluginManifest, type PagedResult } from './types'

function stubManifest(over: Partial<PluginManifest>): PluginManifest {
  return {
    manifestVersion: '1.0',
    id: 'stub',
    name: '测试源',
    version: '1.0.0',
    siteUrl: 'https://example.com',
    type: 'builtin',
    entry: 'stub/index.ts',
    sandbox: 'main',
    capabilities: ['latest'],
    permissions: { domains: ['example.com'] },
    ...over,
  }
}

function stubFactory(
  manifest: PluginManifest,
  impl: Partial<AnimeSourcePlugin>,
  calls: { count: number },
): PluginFactory {
  return (_ctx: PluginContext) => {
    calls.count += 1
    return {
      manifest,
      init: impl.init ?? (async () => undefined),
      getLatestUpdates: impl.getLatestUpdates,
      getDetail: impl.getDetail,
    } as AnimeSourcePlugin
  }
}

const emptyPage: PagedResult<{ animeId: string; title: string }> = {
  items: [],
  page: 1,
  hasMore: false,
}

beforeEach(() => {
  cacheClearAll() // 清模块级内存缓存，避免用例间串扰
  vi.resetModules()
})

describe('PluginHost 能力协商与注入', () => {
  it('latest 结果注入 sourceId', async () => {
    const calls = { count: 0 }
    const mf = stubManifest({})
    await initPluginHost({
      factories: [
        stubFactory(mf, {
          getLatestUpdates: async () => ({
            items: [{ animeId: 'a1', title: '番' }],
            page: 1,
            hasMore: false,
          }),
        }, calls),
      ],
    })
    const r = await sources.latest('stub')
    expect(r.items[0]?.sourceId).toBe('stub')
    expect(r.items[0]?.animeId).toBe('a1')
  })

  it('未声明的能力 → UNSUPPORTED', async () => {
    const mf = stubManifest({ capabilities: ['latest'] })
    await initPluginHost({ factories: [stubFactory(mf, { getWeeklySchedule: async () => emptyPage }, { count: 0 })] })
    await expect(sources.weekly('stub')).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })

  it('已停用的源 → CONFIG_INVALID', async () => {
    const mf = stubManifest({})
    await initPluginHost({
      enabledProvider: () => false,
      factories: [stubFactory(mf, {}, { count: 0 })],
    })
    await expect(sources.latest('stub')).rejects.toMatchObject({ code: 'CONFIG_INVALID' })
  })

  it('插件错误原样透传', async () => {
    const mf = stubManifest({})
    await initPluginHost({
      factories: [
        stubFactory(mf, {
          getLatestUpdates: async () => {
            throw new PluginError('PARSE', '源站改版')
          },
        }, { count: 0 }),
      ],
    })
    await expect(sources.latest('stub')).rejects.toMatchObject({ code: 'PARSE' })
  })

  it('cacheHints 生效：命中缓存不重复调用', async () => {
    const calls = { count: 0 }
    const mf = stubManifest({ cacheHints: { latest: 600 } })
    await initPluginHost({
      factories: [
        stubFactory(mf, {
          getLatestUpdates: async () => ({ items: [], page: 1, hasMore: false }),
        }, calls),
      ],
    })
    const before = calls.count
    await sources.latest('stub', 1)
    await sources.latest('stub', 1)
    expect(calls.count).toBe(before) // init 不经 invoke；两次调用命中缓存
    expect(listSources()[0]?.id).toBe('stub')
  })

  it('未知数据源 → UNSUPPORTED', async () => {
    await initPluginHost({ factories: [stubFactory(stubManifest({}), {}, { count: 0 })] })
    await expect(sources.latest('nope')).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })
})
