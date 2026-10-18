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

function saveNotify(): void {
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
  <div class="space-y-4">
    <section class="rounded-xl bg-white p-4">
      <h2 class="text-sm font-semibold text-gray-700">数据源</h2>
      <ul class="mt-3 space-y-2">
        <li
          v-for="s in sources"
          :key="s.id"
          class="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
        >
          <div>
            <p class="text-sm text-gray-800">{{ s.name }}</p>
            <p class="text-[11px] text-gray-400">
              {{ s.id }} · v{{ s.version }} · {{ s.capabilities.join(' / ') }}
            </p>
          </div>
          <label class="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              class="peer sr-only"
              :checked="settings.isSourceEnabled(s.id)"
              @change="toggleSource(s.id, $event)"
            />
            <div
              class="h-5 w-9 rounded-full bg-gray-300 transition peer-checked:bg-indigo-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4"
            />
          </label>
        </li>
      </ul>
    </section>

    <section class="rounded-xl bg-white p-4">
      <h2 class="text-sm font-semibold text-gray-700">代理（CORS）</h2>
      <p class="mt-1 text-xs text-gray-400">
        数据源接口仅对源站域名开放跨域，浏览器直连会被拦截。填写你自部署的 Cloudflare Worker 地址后走主通道，失败时自动回退公共代理。
      </p>
      <input
        v-model="proxyUrl"
        type="url"
        placeholder="https://your-proxy.your-name.workers.dev"
        class="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
      />
      <div class="mt-2 flex items-center gap-2">
        <button type="button" class="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm text-white active:opacity-80" @click="saveProxy">
          保存
        </button>
        <button type="button" class="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600" @click="runTest">
          测试连通
        </button>
      </div>
      <p
        v-if="testState === 'ok'"
        class="mt-2 text-xs text-green-600"
      >✓ {{ testMsg }}</p>
      <p v-else-if="testState === 'fail'" class="mt-2 text-xs text-red-600">{{ testMsg }}</p>
      <p v-else-if="testState === 'testing'" class="mt-2 text-xs text-gray-400">测试中…</p>
    </section>

    <section class="rounded-xl bg-white p-4">
      <h2 class="text-sm font-semibold text-gray-700">更新检测</h2>
      <div class="mt-3 flex items-center justify-between">
        <span class="text-sm text-gray-600">抓取间隔</span>
        <select
          v-model.number="interval"
          class="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          @change="saveInterval"
        >
          <option :value="15">15 分钟</option>
          <option :value="30">30 分钟</option>
          <option :value="60">1 小时</option>
          <option :value="120">2 小时</option>
        </select>
      </div>
      <div class="mt-3 flex items-center justify-between">
        <span class="text-sm text-gray-600">
          更新通知
          <span class="ml-1 text-[11px] text-gray-400">迭代 2 生效</span>
        </span>
        <input type="checkbox" v-model="notify" class="h-4 w-4 accent-indigo-600" @change="saveNotify" />
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-gray-400">
        GitHub Pages 无后端，更新提醒在页面打开时进行；浏览器关闭期间无法推送。
      </p>
    </section>
  </div>
</template>
