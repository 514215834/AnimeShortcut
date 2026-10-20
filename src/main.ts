import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSettingsStore } from './stores/settings'
import { usePluginsStore } from './stores/plugins'
import { initPluginHost } from './plugins/host/host'
import { startUpdateChecker, runCheck } from './services/updateChecker'
import './assets/main.css'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  app.use(createPinia())

  const settings = useSettingsStore()
  settings.initHttp()
  settings.initTheme()

  // 初始化插件宿主（内置插件在 main 沙箱；已安装的外置插件恢复在 Worker 沙箱）
  // 开发联调通道由插件按 env.mode 自行选择（规范 §6.1 开发例外），宿主无单源特判
  await initPluginHost({
    enabledProvider: (id) => settings.isSourceEnabled(id),
  })

  // 订阅插件注册表变更（导入/卸载/更新后驱动页面数据重拉）
  void usePluginsStore()

  app.use(router)
  app.mount('#app')

  // 更新检测：可见性/间隔调度由服务内部管理
  startUpdateChecker()
  void runCheck(false)
}

void bootstrap()
