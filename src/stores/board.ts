import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AnimeSummary } from '../plugins/host/types'
import { listSources, sources } from '../plugins/host/host'
import { useSettingsStore } from './settings'

export type WeeklyGroups = Partial<Record<number, AnimeSummary[]>> & { unset?: AnimeSummary[] }

/** 多源合并：按复合键去重 + updateTime 降序 */
function merge(items: AnimeSummary[]): AnimeSummary[] {
  const seen = new Set<string>()
  const out: AnimeSummary[] = []
  for (const it of items) {
    const key = `${it.sourceId}:${it.animeId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out.sort((a, b) => (b.updateTime ?? 0) - (a.updateTime ?? 0))
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export const useBoardStore = defineStore('board', () => {
  const settings = useSettingsStore()

  // ========= 周更表 =========
  const weekly = ref<WeeklyGroups>({})
  const weeklyLoading = ref(false)
  const weeklyError = ref('')
  const activeDay = ref<number>(new Date().getDay()) // 默认今天（0=周日）

  async function loadWeekly(): Promise<void> {
    weeklyLoading.value = true
    weeklyError.value = ''
    try {
      const groups: WeeklyGroups = {}
      const failures: string[] = []
      for (const src of listSources()) {
        if (!settings.isSourceEnabled(src.id)) continue
        try {
          const r = await sources.weekly(src.id)
          for (const it of r.items) {
            const wd = it.weekday
            if (wd === undefined || wd < 0 || wd > 6) {
              ;(groups.unset ??= []).push(it)
            } else {
              ;(groups[wd] ??= []).push(it)
            }
          }
        } catch (e) {
          failures.push(`${src.name}: ${errMessage(e)}`)
        }
      }
      for (const day of [0, 1, 2, 3, 4, 5, 6]) {
        if (groups[day]?.length) groups[day] = merge(groups[day] ?? [])
      }
      if (groups.unset?.length) groups.unset = merge(groups.unset)
      weekly.value = groups
      weeklyError.value = failures.join('；')
    } finally {
      weeklyLoading.value = false
    }
  }

  // ========= 最新更新流 =========
  const latest = ref<AnimeSummary[]>([])
  const latestPage = ref(0)
  const latestHasMore = ref(true)
  const latestLoading = ref(false)
  const latestError = ref('')

  async function loadMoreLatest(): Promise<void> {
    if (latestLoading.value || !latestHasMore.value) return
    latestLoading.value = true
    latestError.value = ''
    try {
      const page = latestPage.value + 1
      let collected: AnimeSummary[] = []
      let anyMore = false
      const failures: string[] = []
      for (const src of listSources()) {
        if (!settings.isSourceEnabled(src.id)) continue
        try {
          const r = await sources.latest(src.id, page)
          collected = collected.concat(r.items)
          if (r.hasMore) anyMore = true
        } catch (e) {
          failures.push(`${src.name}: ${errMessage(e)}`)
        }
      }
      latest.value = merge(latest.value.concat(collected))
      latestPage.value = page
      latestHasMore.value = anyMore
      if (failures.length > 0 && collected.length === 0) latestError.value = failures.join('；')
    } finally {
      latestLoading.value = false
    }
  }

  const latestEmpty = computed(
    () => !latestLoading.value && latestPage.value > 0 && latest.value.length === 0,
  )

  return {
    weekly,
    weeklyLoading,
    weeklyError,
    activeDay,
    loadWeekly,
    latest,
    latestPage,
    latestHasMore,
    latestLoading,
    latestError,
    latestEmpty,
    loadMoreLatest,
  }
})
