import { ref } from 'vue'
import { defineStore } from 'pinia'
import { readJson, writeJson } from '../core/storage/localStore'
import { setWorkerUrl } from '../core/http/proxyChain'

export interface Settings {
  schemaVersion: number
  /** 自部署 Cloudflare Worker 代理地址（空 = 不使用该通道） */
  proxyWorkerUrl: string
  /** 更新检测抓取间隔（分钟，迭代 2 生效） */
  fetchIntervalMin: number
  notificationsEnabled: boolean
  /** 启用的数据源插件 id */
  enabledSources: string[]
}

const KEY = 'settings'
const DEFAULTS: Settings = {
  schemaVersion: 1,
  proxyWorkerUrl: '',
  fetchIntervalMin: 30,
  notificationsEnabled: true,
  enabledSources: ['agedm'],
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(migrate(readJson<Settings>(KEY)))

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
  }

  function isSourceEnabled(id: string): boolean {
    return settings.value.enabledSources.includes(id)
  }

  return {
    settings,
    save,
    initHttp,
    setProxyWorkerUrl,
    setFetchInterval,
    setNotificationsEnabled,
    setSourceEnabled,
    isSourceEnabled,
  }
})
