// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from './settings'

describe('settings：数据源启用的零适配语义', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('全新用户：未初始化（null）= 默认全部启用，与具体源解耦', () => {
    const s = useSettingsStore()
    expect(s.settings.enabledSources).toBeNull()
    expect(s.isSourceEnabled('agedm')).toBe(true)
    expect(s.isSourceEnabled('任意未来插件')).toBe(true)
  })

  it('首次开关把 null 物化为显式列表', () => {
    const s = useSettingsStore()
    s.setSourceEnabled('agedm', false)
    expect(Array.isArray(s.settings.enabledSources)).toBe(true)
    expect(s.isSourceEnabled('agedm')).toBe(false)
    // 显式化后未知源回到未启用（与 null 的全启用语义区分开）
    expect(s.isSourceEnabled('任意未来插件')).toBe(false)
  })

  it('存量设置（显式列表）原样保留，不受默认值影响', () => {
    localStorage.setItem(
      'asc:settings',
      JSON.stringify({ schemaVersion: 1, enabledSources: ['agedm'] }),
    )
    const s = useSettingsStore()
    expect(s.isSourceEnabled('agedm')).toBe(true)
    expect(s.isSourceEnabled('yinhuadm')).toBe(false)
  })
})
