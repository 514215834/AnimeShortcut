import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { AnimeSummary } from '../plugins/host/types'
import { listSources, sources } from '../plugins/host/host'
import { mergeByTitle, type MergedCard } from '../services/merge'
import { useSettingsStore } from './settings'

export type WeeklyGroups = Partial<Record<number, MergedCard[]>> & { unset?: MergedCard[] }

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
  /** 看板视图拆分：weekly=每周更新（卡片网格）/ latest=最新更新（信息流） */
  const activeView = ref<'weekly' | 'latest'>('weekly')

  async function loadWeekly(): Promise<void> {
    weeklyLoading.value = true
    weeklyError.value = ''
    try {
      const raw: Partial<Record<number | 'unset', AnimeSummary[]>> = {}
      const failures: string[] = []
      for (const src of listSources()) {
        if (!settings.isSourceEnabled(src.id)) continue
        try {
          const r = await sources.weekly(src.id)
          for (const it of r.items) {
            const wd = it.weekday
            const slot = wd === undefined || wd < 0 || wd > 6 ? 'unset' : wd
            ;(raw[slot] ??= []).push(it)
          }
        } catch (e) {
          failures.push(`${src.name}: ${errMessage(e)}`)
        }
      }
      const groups: WeeklyGroups = {}
      for (const [slotKey, items] of Object.entries(raw)) {
        if (!items?.length) continue
        groups[slotKey === 'unset' ? 'unset' : Number(slotKey)] = mergeByTitle(items)
      }
      weekly.value = groups
      weeklyError.value = failures.join('；')
    } finally {
      weeklyLoading.value = false
    }
  }

  // ========= 最新更新流 =========
  const latest = ref<MergedCard[]>([])
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
      // 归并去重（跨源同名 + 同源复合键重复），保留新页与旧页的全量
      latest.value = mergeByTitle([...latest.value.map((c) => c.primary), ...collected])
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

  /** 配置（代理/数据源）变更后重置最新流，供下次从头拉取 */
  function resetLatest(): void {
    latest.value = []
    latestPage.value = 0
    latestHasMore.value = true
    latestError.value = ''
  }

  // 配置（代理地址/数据源启停/插件装卸）变更后全局重拉——
  // 放在 store 而非页面：用户在设置页改动后，看板数据立即剔除/纳入对应源（3-1 验收语义）
  watch(
    () => settings.configRev,
    () => {
      resetLatest()
      void loadWeekly()
      void loadMoreLatest()
    },
  )

  return {
    weekly,
    weeklyLoading,
    weeklyError,
    activeDay,
    activeView,
    loadWeekly,
    resetLatest,
    latest,
    latestPage,
    latestHasMore,
    latestLoading,
    latestError,
    latestEmpty,
    loadMoreLatest,
  }
})
