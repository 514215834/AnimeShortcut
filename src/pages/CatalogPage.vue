<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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

/** 已无更多分页的源：后续页不再对其发起注定为空的请求 */
const exhausted = new Set<string>()
/** 竞态防护：加载期间变更筛选时，旧加载结果作废、结束后按最新筛选重跑 */
let pendingReset = false
/** 在途加载的筛选快照：init 里 watch(query) 与显式 loadPage 双触发时按同参去重，避免作废重发 */
let loadingQuery: CatalogQuery | null = null

function sameQuery(a: CatalogQuery, b: CatalogQuery | null): boolean {
  return b !== null && JSON.stringify(a) === JSON.stringify(b)
}

async function loadPage(reset: boolean): Promise<void> {
  const querySnapshot: CatalogQuery = { ...query.value }
  if (loading.value) {
    if (reset && !sameQuery(querySnapshot, loadingQuery)) pendingReset = true
    return
  }
  if (!hasMore.value && !reset) return
  loading.value = true
  loadingQuery = querySnapshot
  if (reset) {
    error.value = ''
    exhausted.clear()
  }
  const p = reset ? 1 : page.value + 1
  const active = catalogSources.value.filter((s) => !exhausted.has(s.id))
  try {
    const settled = await Promise.allSettled(
      active.map((src) => sources.catalog(src.id, querySnapshot, p)),
    )
    // 在途期间有筛选变更：本次结果作废，finally 里按新筛选重来
    if (pendingReset) return
    const collected: AnimeSummary[] = []
    let anyMore = false
    const failures: string[] = []
    settled.forEach((r, i) => {
      const src = active[i]
      if (r.status === 'fulfilled') {
        collected.push(...r.value.items)
        if (r.value.hasMore) anyMore = true
        else exhausted.add(src.id)
      } else {
        const reason = r.reason
        failures.push(`${src.name}: ${reason instanceof Error ? reason.message : String(reason)}`)
      }
    })
    // 去重（跨页/跨源复合键），新批次内部按更新时间排序后追加——
    // 不重排已渲染前缀，避免滚动中已有卡片跳位
    const seen = new Set(items.value.map((it) => `${it.sourceId}:${it.animeId}`))
    const batch: AnimeSummary[] = []
    for (const it of collected) {
      const k = `${it.sourceId}:${it.animeId}`
      if (seen.has(k)) continue
      seen.add(k)
      batch.push(it)
    }
    batch.sort((a, b) => (b.updateTime ?? 0) - (a.updateTime ?? 0))
    items.value = reset ? batch : [...items.value, ...batch]
    page.value = p
    // 全部源失败视为瞬时故障：保留 hasMore 供手动重试，不误标「到底了」
    const allFailed = active.length > 0 && failures.length === active.length
    hasMore.value = allFailed ? hasMore.value : anyMore
    if (failures.length > 0 && collected.length === 0) error.value = failures.join('；')
  } finally {
    loading.value = false
    loadingQuery = null
    if (pendingReset) {
      pendingReset = false
      void loadPage(true)
    } else if (hasMore.value && items.value.length > 0) {
      // 宽屏短页：新内容渲染后 sentinel 可能仍在视口内，强制续载下一页
      await nextTick()
      recheck()
    }
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
const { recheck } = useInfiniteScroll(sentinel, () => void loadPage(false))

async function init(): Promise<void> {
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
}

onMounted(() => void init())

// KeepAlive 缓存页面：启用的分类源集合变化时（设置页启停/装卸插件）按新源集合重初始化
const sourceKey = computed(() => catalogSources.value.map((s) => s.id).join(','))
watch(sourceKey, () => {
  if (!initialized.value) return
  void init()
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
