import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cacheClearAll,
  cacheGet,
} from '../../core/http/cache'
import { idbClear } from '../../core/storage/idb'
import { initPluginHost, installPlugin, listSources, onSourcesChanged, sources, uninstallPlugin } from './host'
import { PluginError, type PluginManifest, type PluginPackage } from './types'

/** 沙箱替身：call 直连测试注入的实现表，记录销毁次数 */
const sbx = vi.hoisted(() => ({
  impl: {} as Record<string, (...args: unknown[]) => unknown>,
  destroys: 0,
  started: 0,
}))

vi.mock('./sandbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sandbox')>()
  return {
    ...actual,
    startSandbox: async () => {
      sbx.started += 1
      return {
        call: async (method: string, args: unknown[]) => {
          if (method === 'init') return null
          const fn = sbx.impl[method]
          if (!fn) throw new PluginError('UNSUPPORTED', `插件未实现 ${method}`)
          return fn(...args)
        },
        destroy: () => {
          sbx.destroys += 1
        },
      }
    },
  }
})

function manifest(over: Partial<PluginManifest>): PluginManifest {
  return {
    manifestVersion: '1.0',
    id: 'example',
    name: '示例站',
    version: '1.0.0',
    siteUrl: 'https://example.com',
    type: 'remote',
    entry: 'index.js',
    sandbox: 'worker',
    capabilities: ['latest'],
    permissions: { domains: ['example.com'] },
    ...over,
  }
}

function pkg(m: PluginManifest): PluginPackage {
  return { formatVersion: 1, manifest: m, code: '(function(){})();' }
}

beforeEach(async () => {
  cacheClearAll()
  sbx.impl = {}
  sbx.destroys = 0
  sbx.started = 0
  // 清 IDB（内存回退）避免上一条用例安装的记录在本条启动恢复时复活
  await idbClear('plugins')
  // 空注册表起步（无内置插件）
  await initPluginHost({ factories: [] })
})

describe('installPlugin', () => {
  it('安装 → 注册 → 探活通过 → 事件通知', async () => {
    sbx.impl['getLatestUpdates'] = () => ({ items: [], page: 1, hasMore: false })
    const seen: string[][] = []
    onSourcesChanged((list) => seen.push(list.map((s) => s.id)))

    const info = await installPlugin(pkg(manifest({})))
    expect(info).toMatchObject({ id: 'example', type: 'remote', enabled: true })
    expect(listSources().map((s) => s.id)).toContain('example')
    expect(seen.at(-1)).toContain('example')
  })

  it('能力调用经沙箱句柄路由并注入 sourceId', async () => {
    sbx.impl['getLatestUpdates'] = () => ({
      items: [{ animeId: 'a1', title: '番' }],
      page: 1,
      hasMore: false,
    })
    await installPlugin(pkg(manifest({})))
    const r = await sources.latest('example')
    expect(r.items[0]).toMatchObject({ sourceId: 'example', animeId: 'a1' })
  })

  it('清单非法 → CONFIG_INVALID 且不注册', async () => {
    await expect(
      installPlugin(pkg(manifest({ id: 'Bad_ID' }))),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' })
    expect(listSources()).toHaveLength(0)
  })

  it('sha256 不符 → CONFIG_INVALID 且不创建沙箱', async () => {
    await expect(
      installPlugin(pkg(manifest({ sha256: '0'.repeat(64) }))),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' })
    expect(sbx.started).toBe(0)
  })

  it('探活失败 → 回滚：不注册、沙箱销毁', async () => {
    // 探活取 latest（第 1 个声明能力）→ 抛 PARSE
    sbx.impl['getLatestUpdates'] = () => {
      throw new PluginError('PARSE', '源站改版')
    }
    await expect(installPlugin(pkg(manifest({})))).rejects.toMatchObject({ code: 'PARSE' })
    expect(listSources()).toHaveLength(0)
    expect(sbx.destroys).toBe(1)
  })

  it('同 id 覆盖更新：新版本生效、旧实例销毁', async () => {
    sbx.impl['getLatestUpdates'] = () => ({ items: [], page: 1, hasMore: false })
    await installPlugin(pkg(manifest({ version: '1.0.0' })))
    const destroysBefore = sbx.destroys
    await installPlugin(pkg(manifest({ version: '2.0.0', name: '示例站 2' })))
    const info = listSources().find((s) => s.id === 'example')
    expect(info?.version).toBe('2.0.0')
    expect(sbx.destroys).toBeGreaterThan(destroysBefore) // 旧实例已释放
  })

  it('persist 后重启（initPluginHost）可恢复；sha256 校验贯穿', async () => {
    sbx.impl['getLatestUpdates'] = () => ({ items: [], page: 1, hasMore: false })
    await installPlugin(pkg(manifest({})))
    // 模拟重启：重新初始化宿主（不传 factories 不清注册表之外的部分，恢复走 IDB 记录）
    await initPluginHost({ factories: [] })
    expect(listSources().map((s) => s.id)).toContain('example')
  })
})

describe('uninstallPlugin', () => {
  it('卸载 → 注册表移除、调用抛 UNSUPPORTED、持久化记录删除', async () => {
    sbx.impl['getLatestUpdates'] = () => ({ items: [], page: 1, hasMore: false })
    await installPlugin(pkg(manifest({})))
    await uninstallPlugin('example')
    expect(listSources()).toHaveLength(0)
    await expect(sources.latest('example')).rejects.toMatchObject({ code: 'UNSUPPORTED' })
    // 记录已删：重启后不复活
    await initPluginHost({ factories: [] })
    expect(listSources()).toHaveLength(0)
  })

  it('卸载清空该方法级缓存（重装后重新拉取）', async () => {
    let calls = 0
    sbx.impl['getLatestUpdates'] = () => {
      calls += 1
      return { items: [], page: 1, hasMore: false }
    }
    await installPlugin(pkg(manifest({ cacheHints: { latest: 600 } })))
    calls = 0 // 安装探活已消耗一次调用，从业务调用开始计数
    await sources.latest('example')
    await sources.latest('example')
    expect(calls).toBe(1) // 缓存命中

    await uninstallPlugin('example')
    expect(cacheGet('plugin:example:latest:[1]')).toBeNull()
  })

  it('未安装 → UNSUPPORTED', async () => {
    await expect(uninstallPlugin('nope')).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })
})
