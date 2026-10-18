import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSettingsStore } from './stores/settings'
import { initPluginHost } from './plugins/host/host'
import { startUpdateChecker, runCheck } from './services/updateChecker'
import './assets/main.css'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  app.use(createPinia())

  const settings = useSettingsStore()
  settings.initHttp()

  // 初始化插件宿主（内置插件在 main 沙箱；remote 插件加载在迭代 3）
  // 开发环境把 agedm 指到 Vite 同源代理，免除外部 CORS 代理依赖
  await initPluginHost({
    enabledProvider: (id) => settings.isSourceEnabled(id),
    configProvider: (id): Record<string, string | number | boolean> =>
      import.meta.env.DEV && id === 'agedm' ? { apiBaseUrl: '/agedm-api/' } : {},
  })

  app.use(router)
  app.mount('#app')

  // 更新检测：可见性/间隔调度由服务内部管理
  startUpdateChecker()
  void runCheck(false)
}

void bootstrap()
