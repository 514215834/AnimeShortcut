import { describe, expect, it } from 'vitest'
import { builtinFactories } from './registry'
import { createPluginContext } from '../host/context'
import type { PluginManifest } from '../host/types'

/** 锁定「目录即插件」的自动发现契约：新增内置源不应再改动任何宿主代码 */
describe('内置插件注册表（自动发现）', () => {
  it('发现当前全部内置插件（默认导出工厂 + 清单可取）且顺序稳定', async () => {
    // 内置仅 agedm；樱花动漫以官方插件包分发（src/plugins/packages，不参与内置发现）
    expect(builtinFactories.length).toBe(1)
    const ids: string[] = []
    for (const factory of builtinFactories) {
      const manifestRef = { current: null as PluginManifest | null }
      const plugin = await factory(createPluginContext(manifestRef))
      manifestRef.current = plugin.manifest
      ids.push(plugin.manifest.id)
      expect(plugin.manifest.type).toBe('builtin')
      expect(typeof plugin.init).toBe('function')
    }
    expect(ids).toEqual(['agedm'])
  })
})
