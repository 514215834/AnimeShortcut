<script setup lang="ts">
import { ref } from 'vue'
import type { AnimeSummary } from '../plugins/host/types'
import { listSources, sources } from '../plugins/host/host'
import { useSettingsStore } from '../stores/settings'
import { mergeByTitle, type MergedCard } from '../services/merge'
import AnimeCard from '../components/AnimeCard.vue'
import SkeletonGrid from '../components/SkeletonGrid.vue'
import ErrorState from '../components/ErrorState.vue'
import EmptyState from '../components/EmptyState.vue'

const settings = useSettingsStore()
const keyword = ref('')
const searching = ref(false)
const searched = ref(false)
const results = ref<MergedCard[]>([])
const error = ref('')

/** 会话级搜索记忆（LRU，上限 30 条）：返回/微调关键词时免重复网络请求 */
const memo = new Map<string, MergedCard[]>()
const MEMO_MAX = 30

async function doSearch(): Promise<void> {
  const q = keyword.value.trim()
  if (!q || searching.value) return
  const cached = memo.get(q)
  if (cached) {
    memo.delete(q)
    memo.set(q, cached)
    results.value = cached
    error.value = ''
    searched.value = true
    return
  }
  searching.value = true
  error.value = ''
  try {
    const srcs = listSources().filter((s) => settings.isSourceEnabled(s.id))
    const settled = await Promise.allSettled(srcs.map((s) => sources.search(s.id, q, 1)))
    let collected: AnimeSummary[] = []
    const failures: string[] = []
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        collected.push(...r.value.items)
      } else {
        const reason = r.reason
        failures.push(`${srcs[i].name}: ${reason instanceof Error ? reason.message : String(reason)}`)
      }
    })
    const merged = mergeByTitle(collected)
    results.value = merged
    if (merged.length > 0) {
      memo.set(q, merged)
      if (memo.size > MEMO_MAX) {
        const oldest = memo.keys().next()
        if (oldest.done !== true) memo.delete(oldest.value)
      }
    }
    error.value = collected.length === 0 ? failures.join('；') : ''
  } finally {
    searching.value = false
    searched.value = true
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl pt-4 sm:pt-8">
    <h2 class="mb-4 text-center text-[15px] font-semibold text-ink-2">搜索番剧</h2>
    <form
      class="flex items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_2px_16px_rgba(30,41,59,0.06)] backdrop-blur-xl"
      @submit.prevent="doSearch"
    >
      <span class="pl-2.5 text-sm text-ink-4">🔍</span>
      <input
        v-model="keyword"
        type="search"
        placeholder="输入番剧名称，如：咒术回战"
        class="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-ink-4/80"
      />
      <button
        type="submit"
        class="shrink-0 rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 px-5 py-2 text-sm text-white shadow-sm transition active:opacity-85"
        :disabled="searching"
      >
        {{ searching ? '搜索中…' : '搜索' }}
      </button>
    </form>
  </div>

  <div class="mt-6">
    <SkeletonGrid v-if="searching" :count="12" />
    <ErrorState v-else-if="error" :message="error" @retry="doSearch" />
    <EmptyState v-else-if="searched && results.length === 0" text="没有找到相关结果" hint="换个关键词试试" />
    <template v-else-if="results.length > 0">
      <p class="mb-3 text-xs text-ink-4">共 {{ results.length }} 部作品</p>
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        <AnimeCard v-for="it in results" :key="`${it.primary.sourceId}:${it.primary.animeId}`" :item="it.primary" :source-ids="it.sourceIds" />
      </div>
    </template>
  </div>
</template>
