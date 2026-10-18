<script setup lang="ts">
import { ref } from 'vue'
import type { AnimeSummary } from '../plugins/host/types'
import { listSources, sources } from '../plugins/host/host'
import { useSettingsStore } from '../stores/settings'
import AnimeCard from '../components/AnimeCard.vue'
import SkeletonGrid from '../components/SkeletonGrid.vue'
import ErrorState from '../components/ErrorState.vue'
import EmptyState from '../components/EmptyState.vue'

const settings = useSettingsStore()
const keyword = ref('')
const searching = ref(false)
const searched = ref(false)
const results = ref<AnimeSummary[]>([])
const error = ref('')

async function doSearch(): Promise<void> {
  const q = keyword.value.trim()
  if (!q || searching.value) return
  searching.value = true
  error.value = ''
  try {
    let collected: AnimeSummary[] = []
    const failures: string[] = []
    for (const src of listSources()) {
      if (!settings.isSourceEnabled(src.id)) continue
      try {
        const r = await sources.search(src.id, q, 1)
        collected = collected.concat(r.items)
      } catch (e) {
        failures.push(`${src.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    results.value = collected.sort((a, b) => (b.updateTime ?? 0) - (a.updateTime ?? 0))
    error.value = collected.length === 0 ? failures.join('；') : ''
  } finally {
    searching.value = false
    searched.value = true
  }
}
</script>

<template>
  <form class="flex gap-2" @submit.prevent="doSearch">
    <input
      v-model="keyword"
      type="search"
      placeholder="搜索番剧名称…"
      class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
    />
    <button
      type="submit"
      class="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white active:opacity-80"
      :disabled="searching"
    >
      {{ searching ? '搜索中…' : '搜索' }}
    </button>
  </form>

  <div class="mt-5">
    <SkeletonGrid v-if="searching" :count="12" />
    <ErrorState v-else-if="error" :message="error" @retry="doSearch" />
    <EmptyState v-else-if="searched && results.length === 0" text="没有找到相关结果" />
    <div v-else-if="results.length > 0" class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      <AnimeCard v-for="it in results" :key="`${it.sourceId}:${it.animeId}`" :item="it" />
    </div>
    <p v-else class="mt-10 text-center text-sm text-gray-400">输入关键词开始搜索</p>
  </div>
</template>
