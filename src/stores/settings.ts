import { ref } from 'vue'
import { defineStore } from 'pinia'
import { readJson, writeJson } from '../core/storage/localStore'
import { setWorkerUrl } from '../core/http/proxyChain'
import { applyTheme, type ThemeMode } from '../theme'
export interface Settings {
  schemaVersion: number
  /** 自部署 Cloudflare Worker 代理地址（空 = 不使用该通道） */
  proxyWorkerUrl: string
  /** 更新检测抓取间隔（分钟） */
  fetchIntervalMin: number
  notificationsEnabled: boolean
  /** 启用的数据源插件 id */
  enabledSources: string[]
  /** 主题色预设 id（src/theme.ts ACCENT_PRESETS） */
  accent: string
  /** 明暗模式 */
  themeMode: ThemeMode
  /** 背景光斑开 */
  bgGlow: boolean
}

const KEY = 'settings'
const DEFAULTS: Settings = {
  schemaVersion: 1,
  proxyWorkerUrl: '',
  fetchIntervalMin: 30,
  notificationsEnabled: true,
  enabledSources: ['agedm'],
  accent: 'indigo',
  themeMode: 'light',
  bgGlow: true,
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(migrate(readJson<Settings>(KEY)))
  /** 配置版本号：代理地址/数据源启停等影响拉取的配置变化时 +1，页面监听后自动刷新数据 */
  const configRev = ref(0)

  function migrate(raw: Settings | null): Settings {
    const merged = { ...DEFAULTS, ...(raw ?? {}) } as Settings
    if (!Array.isArray(merged.enabledSources)) merged.enabledSources = [...DEFAULTS.enabledSources]
    return merged
  }

  function save(): void {
    writeJson(KEY, settings.value)
  }

  /** 把代理地址同步到请求层（启动时与修改时调用） */
  function initHttp(): void {
    setWorkerUrl(settings.value.proxyWorkerUrl)
  }

  function setProxyWorkerUrl(url: string): void {
    settings.value.proxyWorkerUrl = url.trim()
    setWorkerUrl(settings.value.proxyWorkerUrl)
    save()
    configRev.value += 1
  }

  function setFetchInterval(min: number): void {
    settings.value.fetchIntervalMin = Math.max(5, Math.min(240, min))
    save()
  }

  function setNotificationsEnabled(on: boolean): void {
    settings.value.notificationsEnabled = on
    save()
  }

  function setSourceEnabled(id: string, on: boolean): void {
    const set = new Set(settings.value.enabledSources)
    if (on) set.add(id)
    else set.delete(id)
    settings.value.enabledSources = Array.from(set)
    save()
    configRev.value += 1
  }

  function isSourceEnabled(id: string): boolean {
    return settings.value.enabledSources.includes(id)
  }

  function setAccent(id: string): void {
    settings.value.accent = id
    save()
    applyTheme(settings.value.accent, settings.value.bgGlow, settings.value.themeMode)
  }

  function setThemeMode(mode: ThemeMode): void {
    settings.value.themeMode = mode
    save()
    applyTheme(settings.value.accent, settings.value.bgGlow, mode)
  }

  function setBgGlow(on: boolean): void {
    settings.value.bgGlow = on
    save()
    applyTheme(settings.value.accent, settings.value.bgGlow, settings.value.themeMode)
  }

  /** 启动时应用已保存的主题 */
  function initTheme(): void {
    applyTheme(settings.value.accent, settings.value.bgGlow, settings.value.themeMode)
  }

  return {
    settings,
    configRev,
    save,
    initHttp,
    initTheme,
    setAccent,
    setThemeMode,
    setBgGlow,
    setProxyWorkerUrl,
    setFetchInterval,
    setNotificationsEnabled,
    setSourceEnabled,
    isSourceEnabled,
  }
})
