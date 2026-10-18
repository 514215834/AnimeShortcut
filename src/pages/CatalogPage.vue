<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { AnimeSummary, CatalogFilterDef, CatalogQuery } from '../plugins/host/types'
import { listSources, sources } from '../plugins/host/host'
import { useSettingsStore } from '../stores/settings'
import { useInfiniteScroll } from '../composables/useInfiniteScroll'
import AnimeCard from '../components/AnimeCard.vue'
import SkeletonGrid from '../components/SkeletonGrid.vue'
import ErrorState from '../components/ErrorState.vue'
import EmptyState from '../components/EmptyState.vue'

const settings = useSettingsStore()

const filters = ref<CatalogFilterDef[]>([])
const query = ref<CatalogQuery>({})
const items = ref<AnimeSummary[]>([])
const page = ref(0)
const hasMore = ref(true)
const loading = ref(false)
const error = ref('')
const initialized = ref(false)

const catalogSources = computed(() =>
  listSources().filter((s) => settings.isSourceEnabled(s.id) && s.capabilities.includes('catalog')),
)

async function loadPage(reset: boolean): Promise<void> {
  if (loading.value || (!hasMore.value && !reset)) return
  loading.value = true
  if (reset) error.value = ''
  try {
    const p = reset ? 1 : page.value + 1
    let collected: AnimeSummary[] = []
    let anyMore = false
    const failures: string[] = []
    for (const src of catalogSources.value) {
      try {
        const r = await sources.catalog(src.id, query.value, p)
        collected = collected.concat(r.items)
        if (r.hasMore) anyMore = true
      } catch (e) {
        failures.push(`${src.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const seen = new Set<string>()
    const merged = (reset ? [] : items.value).concat(collected).filter((it) => {
      const k = `${it.sourceId}:${it.animeId}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    items.value = merged.sort((a, b) => (b.updateTime ?? 0) - (a.updateTime ?? 0))
    page.value = p
    hasMore.value = anyMore
    if (failures.length > 0 && collected.length === 0) error.value = failures.join('；')
  } finally {
    loading.value = false
  }
}

function setFilter(key: string, value: string): void {
  query.value = { ...query.value, [key]: value }
}

watch(query, () => {
  hasMore.value = true
  void loadPage(true)
})

const sentinel = ref<HTMLElement | null>(null)
useInfiniteScroll(sentinel, () => void loadPage(false))

onMounted(async () => {
  const src = catalogSources.value[0]
  if (!src) {
    error.value = '当前启用的数据源不支持分类浏览'
    initialized.value = true
    return
  }
  try {
    filters.value = await sources.catalogMeta(src.id)
    query.value = Object.fromEntries(filters.value.map((f) => [f.key, 'all']))
    await loadPage(true)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    initialized.value = true
  }
})
</script>

<template>
  <div v-if="filters.length > 0" class="mb-5 space-y-2.5 rounded-2xl border border-line bg-surface p-4 backdrop-blur">
    <div v-for="f in filters" :key="f.key" class="flex items-start gap-3">
      <span class="mt-1 w-12 shrink-0 text-xs text-ink-4">{{ f.label }}</span>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="o in f.options"
          :key="o.value"
          type="button"
          class="rounded-full border px-2.5 py-1 text-xs transition-all duration-150"
          :class="
            (query[f.key] ?? 'all') === o.value
              ? 'border-transparent bg-accent-600 font-medium text-white shadow-sm'
              : 'border-transparent bg-white/60 text-ink-2 hover:bg-surface-2 dark:bg-white/5'
          "
          @click="setFilter(f.key, o.value)"
        >
          {{ o.label }}
        </button>
      </div>
    </div>
  </div>

  <ErrorState v-if="error && items.length === 0" :message="error" @retry="loadPage(true)" />
  <EmptyState v-else-if="initialized && !loading && items.length === 0" text="没有符合筛选条件的结果" />
  <SkeletonGrid v-else-if="!initialized || (loading && page === 0)" :count="12" />
  <template v-else>
    <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
      <AnimeCard v-for="it in items" :key="`${it.sourceId}:${it.animeId}`" :item="it" />
    </div>
    <div ref="sentinel" class="py-8 text-center text-xs text-ink-4">
      <template v-if="loading">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400" />
          加载中…
        </span>
      </template>
      <template v-else-if="hasMore">
        <button type="button" class="rounded-full px-4 py-1.5 text-accent-500 transition hover:bg-accent-50/70" @click="loadPage(false)">
          加载更多
        </button>
      </template>
      <template v-else>已经到底啦</template>
    </div>
  </template>
</template>
