<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useHistoryStore } from '../stores/history'
import EmptyState from '../components/EmptyState.vue'
import SkeletonList from '../components/SkeletonList.vue'

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

function openEntry(url: string | undefined): void {
  if (url) window.open(url, '_blank', 'noopener')
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
  <div class="w-full">
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
      class="mb-4 flex items-center gap-3.5 rounded-2xl border border-accent-100/90 bg-gradient-to-br from-accent-50/80 to-accent-100/40 dark:border-accent-500/20 dark:from-accent-500/10 dark:to-accent-400/5 p-4 backdrop-blur"
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
        @click="openEntry(latest.playPageUrl)"
      >
        ▶ 播放
      </button>
    </div>

    <SkeletonList v-if="!historyStore.loaded" :count="5" />
    <EmptyState
      v-else-if="historyStore.entries.length === 0"
      text="暂无观看记录"
      hint="在看板或搜索里点开剧集后会记录在这里"
    />
    <ul
      v-else
      class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface backdrop-blur"
    >
      <li v-for="e in historyStore.entries" :key="e.key">
        <div class="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2">
          <button type="button" class="min-w-0 flex-1 text-left" @click="openEntry(e.playPageUrl)">
            <p class="truncate text-[13.5px] text-ink">
              {{ e.episodeTitle }} · <span class="text-ink-3">{{ e.title }}</span>
            </p>
            <p class="mt-0.5 text-[11px] text-ink-4">{{ fmtTime(e.watchedAt) }}</p>
          </button>
          <button
            type="button"
            class="shrink-0 rounded-full px-2.5 py-1 text-[11px] text-ink-4 transition hover:bg-rose-50 hover:text-rose-500"
            @click="historyStore.remove(e.key)"
          >
            ✕
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
