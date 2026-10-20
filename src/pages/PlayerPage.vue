<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { AnimeDetail } from '../plugins/host/types'
import { sources } from '../plugins/host/host'
import { channelsFor, getWorkerUrl, type ChannelName } from '../core/http/proxyChain'
import { useHistoryStore } from '../stores/history'

/**
 * 站内播放（迭代 3 功能点 3-4/3-6）：
 * - resolvePlay 返回 stream → hls.js 动态加载播放 m3u8（主流线路 CORS 直连实测可用）
 * - 返回 page / 解析失败 / 播放失败 → 可读原因 + 跳转源站按钮（3-6 健壮性）
 * - 倍速切换、播放位置记忆（localStorage，刷新后恢复）
 */

const route = useRoute()
const historyStore = useHistoryStore()

const sourceId = computed(() => String(route.params.sourceId ?? ''))
const animeId = computed(() => String(route.params.animeId ?? ''))
const episodeId = computed(() => String(route.params.episodeId ?? ''))

const detail = ref<AnimeDetail | null>(null)
const episodeTitle = ref('')
const fallbackPageUrl = ref('')

type Phase = 'resolving' | 'playing' | 'page-jump' | 'error'
const phase = ref<Phase>('resolving')
const errMsg = ref('')
/** 是否可用「经代理重试」：仅当配置了 Worker 代理（m3u8 改写需 Worker 支持） */
const proxyRetryable = computed(() => Boolean(getWorkerUrl()))

const speedOptions = [0.75, 1, 1.25, 1.5, 2]
const speed = ref(1)
const videoEl = ref<HTMLVideoElement | null>(null)
const progressPct = ref(0)

let hlsInstance: { destroy(): void } | null = null
let streamUrl = ''
let saveTimer: ReturnType<typeof setInterval> | null = null
/** 看门狗：流开始加载后限时未出画面则给出可读失败（3-6：5 秒内可感知，留 3s 解析余量） */
let watchdogTimer: ReturnType<typeof setTimeout> | null = null

function armWatchdog(): void {
  clearWatchdog()
  watchdogTimer = setTimeout(() => {
    const v = videoEl.value
    if (phase.value === 'playing' && v && v.readyState < 2) {
      fail('连接流超时：直连被拦截或网络不可达')
    }
  }, 8000)
}

function clearWatchdog(): void {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer)
    watchdogTimer = null
  }
}

const posKey = computed(
  () => `asc:playpos:${sourceId.value}:${animeId.value}:${episodeId.value}`,
)

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function findEpisode(): { title: string; playPageUrl?: string } | null {
  const ep = detail.value?.episodes.find((e) => e.episodeId === episodeId.value)
  if (!ep) return null
  return { title: ep.title, playPageUrl: ep.playPageUrl }
}

function recordHistory(): void {
  if (!detail.value || !sourceId.value) return
  const ep = findEpisode()
  void historyStore.record({
    sourceId: sourceId.value,
    animeId: animeId.value,
    episodeId: episodeId.value,
    title: detail.value.title,
    episodeTitle: ep?.title ?? episodeTitle.value,
    cover: detail.value.cover,
    playPageUrl: ep?.playPageUrl,
  })
}

// ========= 播放位置记忆 =========
function loadSavedPosition(): number {
  try {
    const v = Number(localStorage.getItem(posKey.value))
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}

function savePosition(): void {
  const v = videoEl.value
  if (!v || Number.isNaN(v.currentTime)) return
  try {
    localStorage.setItem(posKey.value, String(Math.floor(v.currentTime)))
  } catch {
    /* 忽略 */
  }
}

function onTimeUpdate(): void {
  const v = videoEl.value
  if (v && v.duration) progressPct.value = (v.currentTime / v.duration) * 100
}

// ========= hls.js 播放 =========
async function playStream(url: string, viaProxy: boolean): Promise<void> {
  const Hls = (await import('hls.js')).default
  const video = videoEl.value
  if (!video) return
  if (!Hls.isSupported()) {
    // Safari 原生支持 HLS
    video.src = viaProxy ? proxyWrap(url) : url
    return
  }  const hls = new Hls({
    // 3-6：首字节 5 秒超时，尽快给出可读失败原因
    manifestLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 5000,
        maxLoadTimeMs: 10000,
        timeoutRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 1000 },
        errorRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 1000 },
      },
    },
    playlistLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 5000,
        maxLoadTimeMs: 15000,
        timeoutRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
        errorRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 1000 },
      },
    },
    // 代理重试路径：把 hls.js 的每个请求包进 Worker 代理（m3u8 改写由 Worker 端完成）
    xhrSetup: (xhr, reqUrl) => {
      if (!viaProxy) return
      const wrapped = proxyWrap(reqUrl)
      if (wrapped !== reqUrl) xhr.open('GET', wrapped, true)
    },
  })
  hlsInstance = hls
  hls.on(Hls.Events.ERROR, (_evt, data) => {
    if (!data.fatal) return
    const reason =
      data.type === 'networkError'
        ? data.details === 'manifestLoadError'
          ? '流地址连接失败（网络或防盗链拦截）'
          : '网络错误，播放中断'
        : data.type === 'mediaError'
          ? '视频解码失败（编码不兼容）'
          : `播放失败（${data.details}）`
    fail(reason)
  })
  hls.loadSource(url)
  hls.attachMedia(video)
  hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => undefined))
  hls.on(Hls.Events.FRAG_BUFFERED, clearWatchdog)
  armWatchdog()
}

/** 经 Worker 代理包装流 URL（m3u8 改写由 Worker 端完成，见 worker/worker.js） */
function proxyWrap(url: string): string {
  const worker = getWorkerUrl()
  if (!worker) return url
  // 已经是代理 URL 的不重复包装（相对地址会先被解析为完整 URL 再进来）
  try {
    if (new URL(url, location.href).host === new URL(worker).host) return url
  } catch {
    /* 保留原 URL */
  }
  // 代理链通道记忆已保证 worker 优先时 channelsFor()[0] 是 worker；这里显式走 worker
  return `${worker}${worker.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`
}

function fail(msg: string): void {
  errMsg.value = msg
  phase.value = 'error'
  destroyHls()
}

function destroyHls(): void {
  clearWatchdog()
  hlsInstance?.destroy()
  hlsInstance = null
}

function openSourceSite(): void {
  const url = fallbackPageUrl.value
  if (!url) return
  window.open(url, '_blank', 'noopener')
}

function setSpeed(v: number): void {
  speed.value = v
  if (videoEl.value) videoEl.value.playbackRate = v
}

async function setup(): Promise<void> {
  phase.value = 'resolving'
  errMsg.value = ''
  destroyHls()
  if (!sourceId.value || !animeId.value || !episodeId.value) {
    phase.value = 'error'
    errMsg.value = '地址缺少播放标识'
    return
  }
  try {
    // 详情走宿主方法级缓存（detail TTL 3600s），用于标题/封面/回落跳转地址
    detail.value = await sources.detail(sourceId.value, animeId.value)
    const ep = findEpisode()
    if (!ep) {
      phase.value = 'error'
      errMsg.value = '该番剧在此线路上不存在这一集'
      return
    }
    episodeTitle.value = ep.title
    fallbackPageUrl.value = ep.playPageUrl ?? detail.value.playPageUrl ?? ''

    const play = await sources.play(sourceId.value, animeId.value, episodeId.value)
    if (play.type === 'stream') {
      streamUrl = play.url
      phase.value = 'playing'
      recordHistory()
      // 等 video 元素随 phase 变化渲染就绪（nextTick 不依赖页面可见性，后台标签页也成立）
      await nextTick()
      const saved = loadSavedPosition()
      const video = videoEl.value
      if (video) {
        video.onloadedmetadata = () => {
          // 已看大半视为看完，从头开始
          if (saved > 15 && video.duration - saved > 30) video.currentTime = saved
        }
      }
      await playStream(play.url, false)
    } else {
      phase.value = 'page-jump'
      recordHistory()
      window.open(play.url, '_blank', 'noopener')
    }
  } catch (e) {
    phase.value = 'error'
    errMsg.value = `无法解析播放地址：${errMessage(e)}`
  }
}

/** 3-6：经代理重试（Worker 端 m3u8 改写，见 worker/worker.js） */
async function retryViaProxy(): Promise<void> {
  if (!streamUrl) return
  phase.value = 'resolving'
  errMsg.value = ''
  destroyHls()
  await nextTick()
  phase.value = 'playing'
  try {
    await playStream(streamUrl, true)
  } catch (e) {
    fail(`代理播放失败：${errMessage(e)}`)
  }
}

function startSaving(): void {
  if (saveTimer) return
  saveTimer = setInterval(savePosition, 5000)
}

function stopSaving(): void {
  if (saveTimer) {
    clearInterval(saveTimer)
    saveTimer = null
  }
}

onMounted(() => void setup())
onBeforeUnmount(() => {
  savePosition()
  stopSaving()
  destroyHls()
})

watch(
  () => `${route.params.sourceId}/${route.params.animeId}/${route.params.episodeId}`,
  () => {
    if (route.name === 'play') void setup()
  },
)

/** 代理链当前通道（供 UI 提示） */
const channelName = computed<ChannelName | null>(() => channelsFor()[0]?.name ?? null)
</script>

<template>
  <div class="w-full">
    <RouterLink
      :to="`/anime/${sourceId}/${animeId}`"
      class="mb-4 inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2 backdrop-blur transition hover:bg-surface-2 hover:text-ink"
    >
      ← 返回详情
    </RouterLink>

    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-[15px] font-semibold text-ink">
        {{ detail?.title ?? '加载中…' }}
        <span v-if="episodeTitle" class="ml-1 text-xs font-normal text-ink-3">{{ episodeTitle }}</span>
      </h2>
      <span v-if="detail?.sourceId" class="text-[11px] text-ink-4">来源：{{ detail.sourceId }}</span>
    </div>

    <!-- 播放区 -->
    <div
      class="relative mt-3 aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black shadow-[0_2px_16px_rgba(30,41,59,0.1)]"
    >
      <!-- 正常播放 -->
      <video
        v-show="phase === 'playing'"
        ref="videoEl"
        controls
        autoplay
        playsinline
        class="h-full w-full bg-black"
        @timeupdate="onTimeUpdate"
        @playing="startSaving"
        @pause="savePosition"
        @ended="savePosition"
      />

      <!-- 解析中 -->
      <div
        v-if="phase === 'resolving'"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-gray-300"
      >
        <span class="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        正在解析播放地址…
      </div>

      <!-- 需跳转源站播放 -->
      <div
        v-else-if="phase === 'page-jump'"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p class="text-sm text-gray-200">该剧集未取得站内流地址（加密线路或解析受限）</p>
        <p class="text-xs text-gray-400">已尝试打开源站播放页；若浏览器拦截了弹出窗口，请点击下方按钮</p>
        <button
          type="button"
          class="rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 px-5 py-2 text-sm text-white shadow-sm transition active:opacity-85"
          @click="openSourceSite"
        >
          打开源站播放页 ↗
        </button>
      </div>

      <!-- 播放失败（3-6：可读原因 + 跳转按钮） -->
      <div
        v-else-if="phase === 'error'"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p class="text-sm text-rose-300">{{ errMsg }}</p>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <button
            v-if="proxyRetryable"
            type="button"
            class="rounded-xl border border-white/20 px-4 py-2 text-xs text-gray-100 transition hover:bg-white/10"
            @click="void retryViaProxy()"
          >
            经代理重试
          </button>
          <button
            v-if="fallbackPageUrl"
            type="button"
            class="rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 px-4 py-2 text-xs text-white shadow-sm transition active:opacity-85"
            @click="openSourceSite"
          >
            打开源站播放页 ↗
          </button>
        </div>
      </div>
    </div>

    <!-- 倍速与提示 -->
    <div
      v-if="phase === 'playing'"
      class="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 backdrop-blur"
    >
      <span class="text-xs text-ink-4">倍速</span>
      <div class="inline-flex items-center gap-1 rounded-full border border-line-2 bg-surface-3 p-1">
        <button
          v-for="v in speedOptions"
          :key="v"
          type="button"
          class="rounded-full px-3 py-1 text-xs transition-all duration-150"
          :class="speed === v ? 'bg-accent-600 font-medium text-white shadow-sm' : 'text-ink-2 hover:bg-surface-2'"
          @click="setSpeed(v)"
        >
          {{ v }}x
        </button>
      </div>
      <span class="text-[11px] text-ink-4">
        播放进度会自动记忆，下次进入同一集从上次位置继续
      </span>
    </div>
    <p v-if="phase === 'playing'" class="mt-2 text-[11px] text-ink-4">
      流媒体来自源站合作 CDN（{{ channelName === 'worker' ? '经你的 Worker 代理' : '直连' }}）；若无法播放，将给出原因并可一键跳转源站。
    </p>
  </div>
</template>
