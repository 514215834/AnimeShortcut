import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  installPlugin,
  listSources,
  onSourcesChanged,
  reloadPlugin,
  uninstallPlugin,
  type InstallOptions,
  type SourceInfo,
} from '../plugins/host/host'
import type { PluginPackage } from '../plugins/host/types'
import { useSettingsStore } from './settings'

/**
 * 数据源注册表的响应式门面（设计 §4.4）：
 * 列表随宿主注册表变更自动更新，并推动 settings.configRev，
 * 让看板等已监听 configRev 的页面在插件热插拔后自动重拉数据。
 */
export const usePluginsStore = defineStore('plugins', () => {
  const settings = useSettingsStore()
  const sources = ref<SourceInfo[]>(listSources())

  onSourcesChanged((next) => {
    sources.value = next
    settings.configRev += 1
  })

  async function install(pkg: PluginPackage, opts?: InstallOptions): Promise<SourceInfo> {
    // 首次安装默认启用（用户显式导入即视为启用）；覆盖更新沿用现有启停状态
    const known = pkg.manifest ? sources.value.some((s) => s.id === pkg.manifest.id) : false
    const info = await installPlugin(pkg, opts)
    if (!known) settings.setSourceEnabled(info.id, true)
    return info
  }

  return {
    sources,
    install,
    uninstall: (id: string, wipeStorage = false) => uninstallPlugin(id, { wipeStorage }),
    reload: (id: string) => reloadPlugin(id),
  }
})
