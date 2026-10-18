<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { AnimeDetail, Episode } from '../plugins/host/types'
import { sources } from '../plugins/host/host'

const route = useRoute()
const sourceId = computed(() => String(route.params.sourceId ?? ''))
const animeId = computed(() => String(route.params.animeId ?? ''))

const detail = ref<AnimeDetail | null>(null)
const loading = ref(false)
const error = ref('')
const showFullDesc = ref(false)
const activeLine = ref(0)

async function load(): Promise<void> {
  if (!sourceId.value || !animeId.value) {
    error.value = '地址缺少番剧标识'
    return
  }
  loading.value = true
  error.value = ''
  detail.value = null
  try {
    detail.value = await sources.detail(sourceId.value, animeId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(
  () => `${route.params.sourceId}/${route.params.animeId}`,
  () => void load(),
  { immediate: true },
)

const lines = computed(() => {
  const map = new Map<number, { name: string; eps: Episode[] }>()
  for (const ep of detail.value?.episodes ?? []) {
    const li = ep.lineIndex ?? 0
    if (!map.has(li)) map.set(li, { name: ep.line ?? `线路${li + 1}`, eps: [] })
    map.get(li)?.eps.push(ep)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
})
const currentEps = computed(() => lines.value[activeLine.value]?.eps ?? [])

const statusLabel = computed(() => {
  const map = { ongoing: '连载中', finished: '已完结', unknown: '' } as Record<string, string>
  return map[detail.value?.status ?? 'unknown'] ?? ''
})

function openPlay(ep: Episode): void {
  if (ep.playPageUrl) window.open(ep.playPageUrl, '_blank', 'noopener')
}
</script>

<template>
  <RouterLink
    to="/"
    class="mb-4 inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-[13px] text-gray-600 backdrop-blur transition hover:bg-white/85 hover:text-gray-900"
  >
    ← 返回看板
  </RouterLink>

  <div v-if="loading" class="rounded-2xl border border-white/70 bg-white/60 p-5 backdrop-blur">
    <div class="flex animate-pulse gap-5">
      <div class="aspect-[3/4] w-28 shrink-0 rounded-xl bg-gray-200/90 sm:w-36" />
      <div class="flex-1 space-y-2.5 py-1">
        <div class="h-5 w-3/5 rounded-full bg-gray-200/90" />
        <div class="h-3 w-2/5 rounded-full bg-gray-100/90" />
        <div class="h-3 w-1/3 rounded-full bg-gray-100/90" />
        <div class="flex gap-1.5 pt-1">
          <div class="h-5 w-12 rounded-full bg-gray-100/90" />
          <div class="h-5 w-12 rounded-full bg-gray-100/90" />
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="error">
    <ErrorState :message="error" @retry="load" />
  </div>

  <template v-else-if="detail">
    <!-- 头部信息：玻璃卡片 -->
    <div
      class="flex gap-5 rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl sm:p-5"
    >
      <img
        v-if="detail.cover"
        :src="detail.cover"
        :alt="detail.title"
        referrerpolicy="no-referrer"
        class="aspect-[3/4] w-28 shrink-0 rounded-xl bg-gray-200 object-cover shadow-md sm:w-36"
      />
      <div class="min-w-0 flex-1">
        <h1 class="text-lg font-semibold leading-snug text-gray-900">{{ detail.title }}</h1>
        <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span
            v-if="statusLabel"
            class="rounded-full px-2 py-0.5"
            :class="
              detail.status === 'finished'
                ? 'bg-gray-100/90 text-gray-500'
                : 'bg-emerald-50/90 text-emerald-600'
            "
          >
            {{ statusLabel }}
          </span>
          <span v-if="detail.region" class="text-gray-400">{{ detail.region }}</span>
        </div>
        <p v-if="detail.latestEpisodeTitle" class="mt-2 text-xs text-gray-500">
          最近更新：<span class="text-gray-700">{{ detail.latestEpisodeTitle }}</span>
        </p>
        <div v-if="detail.genres.length > 0" class="mt-2.5 flex flex-wrap gap-1.5">
          <span
            v-for="g in detail.genres"
            :key="g"
            class="rounded-full border border-indigo-100/80 bg-indigo-50/80 px-2 py-0.5 text-[11px] text-indigo-500"
          >
            {{ g }}
          </span>
        </div>
      </div>
    </div>

    <!-- 简介 -->
    <div
      v-if="detail.description"
      class="mt-4 rounded-2xl border border-white/70 bg-white/50 p-4 backdrop-blur"
    >
      <h3 class="mb-1.5 text-xs font-semibold tracking-wide text-gray-400">简介</h3>
      <p
        class="whitespace-pre-line text-[13px] leading-relaxed text-gray-600"
        :class="showFullDesc ? '' : 'line-clamp-3'"
      >
        {{ detail.description }}
      </p>
      <button
        type="button"
        class="mt-1.5 text-xs text-indigo-500 hover:text-indigo-600"
        @click="showFullDesc = !showFullDesc"
      >
        {{ showFullDesc ? '收起 ▲' : '展开 ▼' }}
      </button>
    </div>

    <!-- 剧集 -->
    <section v-if="lines.length > 0" class="mt-6">
      <div class="mb-3 flex items-baseline justify-between">
        <h3 class="text-[15px] font-semibold text-gray-700">选集播放</h3>
        <span class="text-xs text-gray-400">共 {{ detail.episodes.length }} 集 · {{ lines.length }} 条线路</span>
      </div>

      <div
        class="mb-3 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/70 bg-white/50 p-1 backdrop-blur"
      >
        <button
          v-for="(ln, i) in lines"
          :key="ln.name"
          type="button"
          class="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition-all duration-200"
          :class="
            activeLine === i
              ? 'bg-indigo-600 font-medium text-white shadow-sm'
              : 'text-gray-600 hover:bg-white/80'
          "
          @click="activeLine = i"
        >
          {{ ln.name }}
          <span class="ml-0.5 text-[10px]" :class="activeLine === i ? 'opacity-80' : 'text-gray-400'">
            {{ ln.eps.length }}
          </span>
        </button>
      </div>

      <div class="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
        <button
          v-for="ep in currentEps"
          :key="ep.episodeId"
          type="button"
          class="rounded-xl border border-white/80 bg-white/70 px-2 py-2 text-[13px] text-gray-700 shadow-[0_1px_6px_rgba(30,41,59,0.04)] backdrop-blur transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50/80 hover:text-indigo-600 active:scale-[0.97]"
          @click="openPlay(ep)"
        >
          {{ ep.title }}
        </button>
      </div>
      <p class="mt-3 text-[11px] text-gray-400">
        点击剧集将在新窗口打开源站播放页（{{ detail.sourceId }}）
      </p>
    </section>
    <EmptyState v-else text="暂无剧集数据" class="mt-6" />
  </template>
</template>
