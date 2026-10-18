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
  <RouterLink to="/" class="mb-4 inline-block text-sm text-gray-500 hover:text-gray-800">
    ← 返回看板
  </RouterLink>

  <div v-if="loading" class="space-y-4">
    <div class="flex animate-pulse gap-4">
      <div class="aspect-[3/4] w-32 shrink-0 rounded-lg bg-gray-200 sm:w-40" />
      <div class="flex-1 space-y-2 py-1">
        <div class="h-5 w-3/5 rounded bg-gray-200" />
        <div class="h-3 w-2/5 rounded bg-gray-100" />
        <div class="h-3 w-1/3 rounded bg-gray-100" />
      </div>
    </div>
  </div>

  <div v-else-if="error" class="mt-6">
    <div class="rounded-xl border border-red-100 bg-red-50/60 p-6 text-center">
      <p class="text-sm text-red-600">{{ error }}</p>
      <button type="button" class="mt-3 rounded-lg bg-red-500 px-4 py-1.5 text-sm text-white" @click="load">
        重试
      </button>
    </div>
  </div>

  <template v-else-if="detail">
    <div class="flex gap-4">
      <img
        v-if="detail.cover"
        :src="detail.cover"
        :alt="detail.title"
        referrerpolicy="no-referrer"
        class="aspect-[3/4] w-32 shrink-0 rounded-lg bg-gray-200 object-cover sm:w-40"
      />
      <div class="min-w-0 flex-1">
        <h1 class="text-lg font-semibold leading-snug">{{ detail.title }}</h1>
        <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span
            v-if="statusLabel"
            class="rounded-full px-2 py-0.5"
            :class="detail.status === 'finished' ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-600'"
          >
            {{ statusLabel }}
          </span>
          <span v-if="detail.region" class="text-gray-400">{{ detail.region }}</span>
        </div>
        <p v-if="detail.latestEpisodeTitle" class="mt-2 text-xs text-gray-500">
          最近更新：{{ detail.latestEpisodeTitle }}
        </p>
        <div v-if="detail.genres.length > 0" class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="g in detail.genres"
            :key="g"
            class="rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600"
          >
            {{ g }}
          </span>
        </div>
      </div>
    </div>

    <p
      v-if="detail.description"
      class="mt-4 whitespace-pre-line text-sm leading-relaxed text-gray-600"
      :class="showFullDesc ? '' : 'line-clamp-3'"
    >
      {{ detail.description }}
    </p>
    <button
      v-if="detail.description"
      type="button"
      class="mt-1 text-xs text-indigo-500"
      @click="showFullDesc = !showFullDesc"
    >
      {{ showFullDesc ? '收起' : '展开' }}
    </button>

    <div v-if="lines.length > 0" class="mt-6">
      <div class="flex gap-2 overflow-x-auto pb-2">
        <button
          v-for="(ln, i) in lines"
          :key="ln.name"
          type="button"
          class="shrink-0 rounded-full px-3 py-1.5 text-sm"
          :class="activeLine === i ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'"
          @click="activeLine = i"
        >
          {{ ln.name }}
          <span class="ml-0.5 text-[11px] opacity-70">{{ ln.eps.length }}</span>
        </button>
      </div>
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
        <button
          v-for="ep in currentEps"
          :key="ep.episodeId"
          type="button"
          class="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700 hover:border-indigo-400 hover:text-indigo-600"
          :title="ep.playPageUrl"
          @click="openPlay(ep)"
        >
          {{ ep.title }}
        </button>
      </div>
      <p class="mt-3 text-xs text-gray-400">点击剧集将在新窗口打开源站播放页（{{ detail.sourceId }}）</p>
    </div>
    <div v-else class="mt-6">
      <p class="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        暂无剧集数据
      </p>
    </div>
  </template>
</template>
