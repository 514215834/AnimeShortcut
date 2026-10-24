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
    const mf = stubManifest({ cacheHints: { latest: 600 } })
    let capCalls = 0
    await initPluginHost({
      factories: [
        stubFactory(mf, {
          getLatestUpdates: async () => {
            capCalls += 1
            return { items: [], page: 1, hasMore: false }
          },
        }, { count: 0 }),
      ],
    })
    await sources.latest('stub', 1)
    await sources.latest('stub', 1)
    expect(capCalls).toBe(1) // 第二次调用命中能力级缓存，不再进插件
    expect(listSources()[0]?.id).toBe('stub')
  })

  it('cacheHints 单位为秒（回归）：600s 内推进时钟仍命中缓存', async () => {
    vi.useFakeTimers()
    try {
      const mf = stubManifest({ cacheHints: { latest: 600 } })
      let capCalls = 0
      await initPluginHost({
        factories: [
          stubFactory(mf, {
            getLatestUpdates: async () => {
              capCalls += 1
              return { items: [], page: 1, hasMore: false }
            },
          }, { count: 0 }),
        ],
      })
      await sources.latest('stub', 1)
      vi.setSystemTime(Date.now() + 5 * 60 * 1000) // 推进 5 分钟：若单位误作毫秒此时早已过期
      await sources.latest('stub', 1)
      expect(capCalls).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('未知数据源 → UNSUPPORTED', async () => {
    await initPluginHost({ factories: [stubFactory(stubManifest({}), {}, { count: 0 })] })
    await expect(sources.latest('nope')).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })
})
