<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { HistoryEntry } from '../core/storage/schema'
import { useHistoryStore } from '../stores/history'
import EmptyState from '../components/EmptyState.vue'
import SkeletonGrid from '../components/SkeletonGrid.vue'

const historyStore = useHistoryStore()

const confirmingClear = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | undefined

onMounted(() => void historyStore.load())

const latest = computed(() => historyStore.entries[0] ?? null)

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openEntry(e: HistoryEntry): void {
  // 站内播放页接管；无剧集 id 的旧记录退回源站播放页
  if (e.episodeId) window.location.hash = `/play/${e.sourceId}/${e.animeId}/${e.episodeId}`
  else if (e.playPageUrl) window.open(e.playPageUrl, '_blank', 'noopener')
}

function requestClear(): void {
  if (confirmingClear.value) {
    void historyStore.clearAll()
    confirmingClear.value = false
    return
  }
  confirmingClear.value = true
  clearTimeout(confirmTimer)
  confirmTimer = setTimeout(() => (confirmingClear.value = false), 3000)
}
</script>

<template>
  <div class="mb-3 flex items-center justify-between">
    <h2 class="text-[15px] font-semibold text-ink-2">
      观看历史
      <span v-if="historyStore.loaded" class="ml-1 text-xs font-normal text-ink-4">
        {{ historyStore.entries.length }} 条
      </span>
    </h2>
    <button
      v-if="historyStore.entries.length > 0"
      type="button"
      class="rounded-full px-3 py-1 text-xs transition"
      :class="
        confirmingClear
          ? 'bg-rose-500 text-white'
          : 'text-ink-4 hover:bg-rose-50 hover:text-rose-500'
      "
      @click="requestClear"
    >
      {{ confirmingClear ? '确认清空？' : '清空' }}
    </button>
  </div>

  <!-- 继续观看 -->
  <div
    v-if="latest"
    class="mb-4 flex items-center gap-3.5 rounded-2xl border border-accent-100/90 bg-gradient-to-br from-accent-50/80 to-accent-100/40 p-4 backdrop-blur dark:border-accent-500/20 dark:from-accent-500/10 dark:to-accent-400/5"
  >
    <img
      v-if="latest.cover"
      :src="latest.cover"
      :alt="latest.title"
      referrerpolicy="no-referrer"
      loading="lazy"
      class="h-16 w-11 shrink-0 rounded-lg object-cover shadow-sm"
    />
    <div class="min-w-0 flex-1">
      <p class="text-[11px] text-accent-400">继续观看</p>
      <p class="truncate text-[13.5px] font-medium text-ink">{{ latest.title }}</p>
      <p class="mt-0.5 truncate text-xs text-ink-3">上次看到：{{ latest.episodeTitle }}</p>
    </div>
    <button
      type="button"
      class="shrink-0 rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 px-4 py-2 text-xs text-white shadow-sm transition active:opacity-85"
      @click="openEntry(latest)"
    >
      ▶ 播放
    </button>
  </div>

  <SkeletonGrid v-if="!historyStore.loaded" :count="8" />
  <EmptyState
    v-else-if="historyStore.entries.length === 0"
    text="暂无观看记录"
    hint="在看板或搜索里点开剧集后会记录在这里"
  />
  <!-- 历史卡片网格 -->
  <div v-else class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
    <div v-for="e in historyStore.entries" :key="e.key" class="group relative">
      <button
        type="button"
        class="block w-full rounded-2xl border border-line bg-surface p-2 text-left shadow-[0_2px_10px_rgba(30,41,59,0.04)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 hover:shadow-[0_8px_24px_rgba(30,41,59,0.12)]"
        @click="openEntry(e)"
      >
        <div class="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-white/5 dark:to-white/10">
          <img
            v-if="e.cover"
            :src="e.cover"
            :alt="e.title"
            referrerpolicy="no-referrer"
            loading="lazy"
            class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          />
          <span
            class="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm"
          >
            {{ e.episodeTitle }}
          </span>
        </div>
        <p class="mt-2 line-clamp-2 text-[13px] leading-snug text-ink">{{ e.title }}</p>
        <p class="mt-0.5 pb-0.5 text-[11px] text-ink-4">{{ fmtTime(e.watchedAt) }}</p>
      </button>
      <button
        type="button"
        title="删除记录"
        class="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-[11px] text-white backdrop-blur-sm transition hover:bg-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
        @click.stop="historyStore.remove(e.key)"
      >
        ✕
      </button>
    </div>
  </div>
</template>
