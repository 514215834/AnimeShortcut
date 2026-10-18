<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { CatalogFilterDef, RankGroup } from '../plugins/host/types'
import { listSources, sources } from '../plugins/host/host'
import { useSettingsStore } from '../stores/settings'
import SkeletonList from '../components/SkeletonList.vue'
import ErrorState from '../components/ErrorState.vue'
import EmptyState from '../components/EmptyState.vue'

const settings = useSettingsStore()

const years = ref<CatalogFilterDef | null>(null)
const year = ref('all')
const groups = ref<RankGroup[]>([])
const activeGroup = ref(0)
const loading = ref(false)
const error = ref('')

const rankSource = computed(() =>
  listSources().find((s) => settings.isSourceEnabled(s.id) && s.capabilities.includes('rank')),
)

async function load(): Promise<void> {
  const src = rankSource.value
  if (!src) {
    error.value = '当前启用的数据源不支持榜单'
    return
  }
  loading.value = true
  error.value = ''
  try {
    groups.value = await sources.rank(src.id, year.value)
    if (activeGroup.value >= groups.value.length) activeGroup.value = 0
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const src = rankSource.value
  if (!src) return
  try {
    const meta = await sources.catalogMeta(src.id)
    years.value = meta.find((g) => g.key === 'year') ?? null
  } catch {
    /* 年份筛选缺失不影响默认榜单 */
  }
  await load()
})

const current = computed(() => groups.value[activeGroup.value] ?? null)

function go(animeId: string): void {
  const src = rankSource.value
  if (src) window.location.hash = `/anime/${src.id}/${animeId}`
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div class="inline-flex items-center gap-1 rounded-full border border-line bg-white/50 p-1 backdrop-blur dark:bg-white/5">
        <button
          v-for="(g, i) in groups"
          :key="g.name"
          type="button"
          class="rounded-full px-3.5 py-1.5 text-[13px] transition-all duration-200"
          :class="
            activeGroup === i
              ? 'bg-accent-600 font-medium text-white shadow-sm'
              : 'text-ink-2 hover:bg-surface-2'
          "
          @click="activeGroup = i"
        >
          {{ g.name }}
        </button>
      </div>
      <select
        v-model="year"
        class="shrink-0 rounded-xl border border-line-2 bg-surface-3 px-2.5 py-1.5 text-sm outline-none focus:border-accent-300"
        @change="load()"
      >
        <option v-for="o in years?.options ?? [{ value: 'all', label: '全部年份' }]" :key="o.value" :value="o.value">
          {{ o.label === '全部' ? '全部年份' : o.label }}
        </option>
      </select>
    </div>

    <SkeletonList v-if="loading && groups.length === 0" :count="8" />
    <ErrorState v-else-if="error && groups.length === 0" :message="error" @retry="load" />
    <EmptyState v-else-if="!loading && groups.length === 0" text="暂无榜单数据" />
    <template v-else-if="current">
      <ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface backdrop-blur">
        <li v-for="e in current.entries" :key="`${e.rankNo}:${e.animeId}`">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
            @click="go(e.animeId)"
          >
            <span
              class="w-7 shrink-0 text-center text-sm font-semibold tabular-nums"
              :class="e.rankNo <= 3 ? 'text-accent-500' : 'text-ink-4/80'"
            >
              {{ e.rankNo }}
            </span>
            <span class="min-w-0 flex-1 truncate text-[13.5px] text-ink">{{ e.title }}</span>
            <span class="shrink-0 text-xs text-ink-4">{{ e.score }}</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
