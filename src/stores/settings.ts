import { ref } from 'vue'
import { defineStore } from 'pinia'
import { readJson, writeJson } from '../core/storage/localStore'
import { setWorkerUrl } from '../core/http/proxyChain'
import { listSources } from '../plugins/host/host'
import { applyTheme, type ThemeMode } from '../theme'
export interface Settings {
  schemaVersion: number
  /** 自部署 Cloudflare Worker 代理地址（空 = 不使用该通道） */
  proxyWorkerUrl: string
  /** 更新检测抓取间隔（分钟） */
  fetchIntervalMin: number
  notificationsEnabled: boolean
  /** 启用的数据源插件 id；null = 未初始化（默认全部启用，首次开关时物化为显式列表） */
  enabledSources: string[] | null
  /** 主题色预设 id（src/theme.ts ACCENT_PRESETS） */
  accent: string
  /** 明暗模式 */
  themeMode: ThemeMode
  /** 背景光斑开 */
  bgGlow: boolean
  /** 远程插件导入入口（默认关闭，规范 §11：默认不开启外置插件入口） */
  enableRemotePlugins: boolean
}

const KEY = 'settings'
const DEFAULTS: Settings = {
  schemaVersion: 1,
  proxyWorkerUrl: '',
  fetchIntervalMin: 30,
  notificationsEnabled: true,
  enabledSources: null,
  accent: 'indigo',
  themeMode: 'light',
  bgGlow: true,
  enableRemotePlugins: false,
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(migrate(readJson<Settings>(KEY)))
  /** 配置版本号：代理地址/数据源启停等影响拉取的配置变化时 +1，页面监听后自动刷新数据 */
  const configRev = ref(0)

  function migrate(raw: Settings | null): Settings {
    // 默认值逐字段并入；enabledSources 保留 null 语义（新用户/新装插件默认全启用）
    const merged = { ...DEFAULTS, ...(raw ?? {}) } as Settings
    if (raw !== null && !Array.isArray(merged.enabledSources)) merged.enabledSources = null
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
    // 首次开关：以「当前注册表全量」物化为显式列表（与 null 语义一致），再做增删
    const set = new Set(settings.value.enabledSources ?? listSources().map((s) => s.id))
    if (on) set.add(id)
    else set.delete(id)
    settings.value.enabledSources = Array.from(set)
    save()
    configRev.value += 1
  }

  function isSourceEnabled(id: string): boolean {
    const list = settings.value.enabledSources
    return list === null ? true : list.includes(id)
  }

  function setRemotePluginsEnabled(on: boolean): void {
    settings.value.enableRemotePlugins = on
    save()
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
    setRemotePluginsEnabled,
  }
})
