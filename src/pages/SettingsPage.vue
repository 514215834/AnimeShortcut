<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { listSources } from '../plugins/host/host'
import { requestJson } from '../core/http/request'
import { getLastGoodChannel } from '../core/http/proxyChain'

const settings = useSettingsStore()
const sources = listSources()

const proxyUrl = ref(settings.settings.proxyWorkerUrl)
const interval = ref(settings.settings.fetchIntervalMin)
const notify = ref(settings.settings.notificationsEnabled)

const testState = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle')
const testMsg = ref('')

function saveProxy(): void {
  settings.setProxyWorkerUrl(proxyUrl.value)
  void runTest()
}

function saveInterval(): void {
  settings.setFetchInterval(Number(interval.value) || 30)
}

const notifyDenied = ref(false)

async function saveNotify(): Promise<void> {
  if (notify.value) {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      try {
        const p = await Notification.requestPermission()
        if (p !== 'granted') {
          notify.value = false
          notifyDenied.value = true
        } else {
          notifyDenied.value = false
        }
      } catch {
        notify.value = false
        notifyDenied.value = true
      }
    }
  }
  settings.setNotificationsEnabled(notify.value)
}

function toggleSource(id: string, ev: Event): void {
  settings.setSourceEnabled(id, (ev.target as HTMLInputElement).checked)
}

/** 连通性测试：走完整代理链访问 agedm 接口 */
async function runTest(): Promise<void> {
  testState.value = 'testing'
  testMsg.value = ''
  try {
    await requestJson<unknown>('https://api.agedm.io/v2/update?page=1&size=1', {
      timeoutMs: 8000,
      retries: 0,
      ttlMs: 0,
    })
    testState.value = 'ok'
    testMsg.value = `连接成功（通道：${getLastGoodChannel() ?? 'direct'}）`
  } catch (e) {
    testState.value = 'fail'
    testMsg.value = `连接失败：${e instanceof Error ? e.message : String(e)}`
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl space-y-4 pt-1">
    <h2 class="text-[15px] font-semibold text-gray-700">设置</h2>

    <section
      class="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
    >
      <h3 class="text-xs font-semibold tracking-wide text-gray-400">数据源</h3>
      <ul class="mt-3 space-y-2">
        <li
          v-for="s in sources"
          :key="s.id"
          class="flex items-center justify-between rounded-xl border border-white/80 bg-white/60 px-3.5 py-2.5 transition hover:bg-white/85"
        >
          <div class="min-w-0">
            <p class="text-[13.5px] text-gray-800">{{ s.name }}</p>
            <p class="truncate text-[11px] text-gray-400">
              {{ s.id }} · v{{ s.version }} · {{ s.capabilities.join(' / ') }}
            </p>
          </div>
          <label class="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              class="peer sr-only"
              :checked="settings.isSourceEnabled(s.id)"
              @change="toggleSource(s.id, $event)"
            />
            <div
              class="h-5 w-9 rounded-full bg-gray-300/80 transition-all duration-200 peer-checked:bg-indigo-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 peer-checked:after:translate-x-4"
            />
          </label>
        </li>
      </ul>
    </section>

    <section
      class="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
    >
      <h3 class="text-xs font-semibold tracking-wide text-gray-400">代理（CORS）</h3>
      <p class="mt-1.5 text-xs leading-relaxed text-gray-400">
        数据源接口仅对源站域名开放跨域，需经代理访问。填入你自部署的 Cloudflare Worker
        地址后走主通道，失败时自动回退公共代理。部署方法见项目 <code class="rounded bg-gray-100/90 px-1">worker/README</code>。
      </p>
      <input
        v-model="proxyUrl"
        type="url"
        placeholder="https://your-proxy.your-name.workers.dev"
        class="mt-3 w-full rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:bg-white/90"
      />
      <div class="mt-3 flex items-center gap-2">
        <button
          type="button"
          class="rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 px-5 py-2 text-sm text-white shadow-sm transition active:opacity-85"
          @click="saveProxy"
        >
          保存
        </button>
        <button
          type="button"
          class="rounded-xl border border-white/80 bg-white/70 px-5 py-2 text-sm text-gray-600 backdrop-blur transition hover:bg-white/90"
          @click="runTest"
        >
          测试连通
        </button>
      </div>
      <p v-if="testState === 'ok'" class="mt-2.5 text-xs text-emerald-600">✓ {{ testMsg }}</p>
      <p v-else-if="testState === 'fail'" class="mt-2.5 text-xs text-rose-600">{{ testMsg }}</p>
      <p v-else-if="testState === 'testing'" class="mt-2.5 text-xs text-gray-400">测试中…</p>
    </section>

    <section
      class="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
    >
      <h3 class="text-xs font-semibold tracking-wide text-gray-400">更新检测</h3>
      <div class="mt-3 flex items-center justify-between">
        <span class="text-[13.5px] text-gray-700">抓取间隔</span>
        <select
          v-model.number="interval"
          class="rounded-xl border border-white/80 bg-white/70 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-300"
          @change="saveInterval"
        >
          <option :value="15">15 分钟</option>
          <option :value="30">30 分钟</option>
          <option :value="60">1 小时</option>
          <option :value="120">2 小时</option>
        </select>
      </div>
      <div class="mt-3 flex items-center justify-between">
        <span class="text-[13.5px] text-gray-700">更新通知</span>
        <input
          v-model="notify"
          type="checkbox"
          class="h-4 w-4 accent-indigo-600"
          @change="saveNotify"
        />
      </div>
      <p v-if="notifyDenied" class="mt-2 text-xs text-amber-600">
        浏览器未授予通知权限，已保持关闭；可在浏览器设置里放行后重新开启。
      </p>
      <p class="mt-2.5 text-[11px] leading-relaxed text-gray-400">
        GitHub Pages 无后端，更新提醒在页面打开时进行；浏览器关闭期间无法推送。
      </p>
    </section>
  </div>
</template>
