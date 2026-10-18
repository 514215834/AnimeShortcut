<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { listSources } from '../plugins/host/host'
import { requestJson } from '../core/http/request'
import { getLastGoodChannel } from '../core/http/proxyChain'
import { ACCENT_PRESETS, THEME_MODES, type ThemeMode } from '../theme'

const settings = useSettingsStore()
const sources = listSources()

const proxyUrl = ref(settings.settings.proxyWorkerUrl)
const interval = ref(settings.settings.fetchIntervalMin)
const notify = ref(settings.settings.notificationsEnabled)
const accent = ref(settings.settings.accent)
const mode = ref<ThemeMode>(settings.settings.themeMode)
const bgGlow = ref(settings.settings.bgGlow)

const testState = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle')
const testMsg = ref('')
const notifyDenied = ref(false)

function pickAccent(id: string): void {
  accent.value = id
  settings.setAccent(id)
}

function pickMode(id: ThemeMode): void {
  mode.value = id
  settings.setThemeMode(id)
}

function saveGlow(): void {
  settings.setBgGlow(bgGlow.value)
}

function saveProxy(): void {
  settings.setProxyWorkerUrl(proxyUrl.value)
  void runTest()
}

function saveInterval(): void {
  settings.setFetchInterval(Number(interval.value) || 30)
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
</script>

<template>
  <div class="w-full space-y-4">
    <h2 class="text-[15px] font-semibold text-ink-2">设置</h2>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- 外观 -->
      <section
        class="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
      >
        <h3 class="text-xs font-semibold tracking-wide text-ink-4">外观</h3>
        <p class="mt-1.5 text-[13px] text-ink-2">明暗模式</p>
        <div class="mt-2.5 inline-flex items-center gap-1 rounded-full border border-line-2 bg-surface p-1">
          <button
            v-for="m in THEME_MODES"
            :key="m.id"
            type="button"
            class="rounded-full px-3.5 py-1.5 text-xs transition-all duration-200"
            :class="
              mode === m.id
                ? 'bg-accent-600 font-medium text-white shadow-sm'
                : 'text-ink-2 hover:bg-surface-2'
            "
            @click="pickMode(m.id)"
          >
            {{ m.name }}
          </button>
        </div>
        <p class="mt-3.5 text-[13px] text-ink-2">主题色</p>
        <div class="mt-2.5 flex flex-wrap gap-2.5">
          <button
            v-for="p in ACCENT_PRESETS"
            :key="p.id"
            type="button"
            class="group flex flex-col items-center gap-1"
            :title="p.name"
            @click="pickAccent(p.id)"
          >
            <span
              class="h-8 w-8 rounded-full shadow-sm transition-all duration-150"
              :style="{ background: `linear-gradient(135deg, ${p.shades['400']}, ${p.shades['600']})` }"
              :class="accent === p.id ? 'ring-2 ring-offset-2 ring-accent-500 dark:ring-offset-[#10131d]' : 'group-hover:scale-110'"
            />
            <span class="text-[10px]" :class="accent === p.id ? 'text-accent-600' : 'text-ink-4'">{{ p.name }}</span>
          </button>
        </div>
        <div class="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span class="text-[13px] text-ink-2">背景光斑</span>
          <label class="relative inline-flex cursor-pointer items-center">
            <input v-model="bgGlow" type="checkbox" class="peer sr-only" @change="saveGlow" />
            <div
              class="h-5 w-9 rounded-full bg-gray-300/80 dark:bg-white/15 transition-all duration-200 peer-checked:bg-accent-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 peer-checked:after:translate-x-4"
            />
          </label>
        </div>
      </section>

      <!-- 数据源 -->
      <section
        class="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
      >
        <h3 class="text-xs font-semibold tracking-wide text-ink-4">数据源</h3>
        <ul class="mt-3 space-y-2">
          <li
            v-for="s in sources"
            :key="s.id"
            class="flex items-center justify-between rounded-xl border border-line-2 bg-surface px-3.5 py-2.5 transition hover:bg-surface-2"
          >
            <div class="min-w-0">
              <p class="text-[13.5px] text-ink">{{ s.name }}</p>
              <p class="truncate text-[11px] text-ink-4">
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
                class="h-5 w-9 rounded-full bg-gray-300/80 dark:bg-white/15 transition-all duration-200 peer-checked:bg-accent-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 peer-checked:after:translate-x-4"
              />
            </label>
          </li>
        </ul>
      </section>

      <!-- 代理 -->
      <section
        class="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
      >
        <h3 class="text-xs font-semibold tracking-wide text-ink-4">代理（CORS）</h3>
        <p class="mt-1.5 text-xs leading-relaxed text-ink-4">
          数据源接口仅对源站域名开放跨域，需经代理访问。填入你自部署的 Cloudflare Worker
          地址后走主通道，失败时自动回退公共代理。部署方法见项目 <code class="rounded bg-gray-100/90 dark:bg-white/10 px-1">worker/README</code>。
        </p>
        <input
          v-model="proxyUrl"
          type="url"
          placeholder="https://your-proxy.your-name.workers.dev"
          class="mt-3 w-full rounded-xl border border-line-2 bg-surface-3 px-3 py-2 text-sm outline-none transition focus:border-accent-300 focus:bg-surface-2"
        />
        <div class="mt-3 flex items-center gap-2">
          <button
            type="button"
            class="rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 px-5 py-2 text-sm text-white shadow-sm transition active:opacity-85"
            @click="saveProxy"
          >
            保存
          </button>
          <button
            type="button"
            class="rounded-xl border border-line-2 bg-surface-3 px-5 py-2 text-sm text-ink-2 backdrop-blur transition hover:bg-surface-2"
            @click="runTest"
          >
            测试连通
          </button>
        </div>
        <p v-if="testState === 'ok'" class="mt-2.5 text-xs text-emerald-600">✓ {{ testMsg }}</p>
        <p v-else-if="testState === 'fail'" class="mt-2.5 text-xs text-rose-600">{{ testMsg }}</p>
        <p v-else-if="testState === 'testing'" class="mt-2.5 text-xs text-ink-4">测试中…</p>
      </section>

      <!-- 更新检测与通知 -->
      <section
        class="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
      >
        <h3 class="text-xs font-semibold tracking-wide text-ink-4">更新检测与通知</h3>
        <div class="mt-3 flex items-center justify-between">
          <span class="text-[13.5px] text-ink-2">抓取间隔</span>
          <select
            v-model.number="interval"
            class="rounded-xl border border-line-2 bg-surface-3 px-2.5 py-1.5 text-sm outline-none focus:border-accent-300"
            @change="saveInterval"
          >
            <option :value="15">15 分钟</option>
            <option :value="30">30 分钟</option>
            <option :value="60">1 小时</option>
            <option :value="120">2 小时</option>
          </select>
        </div>
        <div class="mt-3 flex items-center justify-between">
          <span class="text-[13.5px] text-ink-2">系统通知</span>
          <input
            v-model="notify"
            type="checkbox"
            class="h-4 w-4 accent-accent-600"
            @change="saveNotify"
          />
        </div>
        <p v-if="notifyDenied" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
          浏览器未授予通知权限，已保持关闭；可在浏览器设置里放行后重新开启。
        </p>
        <p class="mt-2.5 text-[11px] leading-relaxed text-ink-4">
          更新提醒在页面打开时进行（GitHub Pages 无后端）；关闭浏览器期间不会推送，角标在下次打开时补上。
        </p>
      </section>
    </div>
  </div>
</template>
