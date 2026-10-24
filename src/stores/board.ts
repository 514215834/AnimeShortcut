import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { AnimeSummary } from '../plugins/host/types'
import { listSources, sources } from '../plugins/host/host'
import { mergeByTitle, type MergedCard } from '../services/merge'
import { useSettingsStore } from './settings'

export type WeeklyGroups = Partial<Record<number, MergedCard[]>> & { unset?: MergedCard[] }

export const useBoardStore = defineStore('board', () => {
  const settings = useSettingsStore()

  // ========= 周更表 =========
  const weekly = ref<WeeklyGroups>({})
  const weeklyLoading = ref(false)
  const weeklyError = ref('')
  /** 并发重拉时仅最后一次生效 */
  let weeklyRev = 0
  const activeDay = ref<number>(new Date().getDay()) // 默认今天（0=周日）
  /** 看板视图拆分：weekly=每周更新（卡片网格）/ latest=最新更新（信息流） */
  const activeView = ref<'weekly' | 'latest'>('weekly')

  async function loadWeekly(): Promise<void> {
    // 串扰防护：仅让最后一次 loadWeekly 的结果生效（配置变更会并发触发重拉）
    const myRev = ++weeklyRev
    weeklyLoading.value = true
    weeklyError.value = ''
    try {
      const srcs = listSources().filter((s) => settings.isSourceEnabled(s.id))
      const settled = await Promise.allSettled(srcs.map((s) => sources.weekly(s.id)))
      if (myRev !== weeklyRev) return
      const raw: Partial<Record<number | 'unset', AnimeSummary[]>> = {}
      const failures: string[] = []
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          for (const it of r.value.items) {
            const wd = it.weekday
            const slot = wd === undefined || wd < 0 || wd > 6 ? 'unset' : wd
            ;(raw[slot] ??= []).push(it)
          }
        } else {
          const reason = r.reason
          failures.push(`${srcs[i].name}: ${reason instanceof Error ? reason.message : String(reason)}`)
        }
      })
      const groups: WeeklyGroups = {}
      for (const [slotKey, items] of Object.entries(raw)) {
        if (!items?.length) continue
        groups[slotKey === 'unset' ? 'unset' : Number(slotKey)] = mergeByTitle(items)
      }
      weekly.value = groups
      weeklyError.value = failures.join('；')
    } finally {
      if (myRev === weeklyRev) weeklyLoading.value = false
    }
  }

  // ========= 最新更新流 =========
  const latest = ref<MergedCard[]>([])
  const latestPage = ref(0)
  const latestHasMore = ref(true)
  const latestLoading = ref(false)
  const latestError = ref('')
  /** 已无更多分页的源：后续页不再对其发起注定为空的请求 */
  const latestExhausted = new Set<string>()
  /** 版本号：resetLatest（配置变更）作废在途分页结果，避免旧页数据拼到清空后的列表 */
  let latestRev = 0

  async function loadMoreLatest(): Promise<void> {
    if (latestLoading.value || !latestHasMore.value) return
    latestLoading.value = true
    latestError.value = ''
    const myRev = latestRev
    const page = latestPage.value + 1
    const active = listSources().filter(
      (s) => settings.isSourceEnabled(s.id) && !latestExhausted.has(s.id),
    )
    try {
      const settled = await Promise.allSettled(active.map((s) => sources.latest(s.id, page)))
      if (myRev !== latestRev) return // 加载期间列表被重置：作废本次结果
      let collected: AnimeSummary[] = []
      let anyMore = false
      const failures: string[] = []
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          collected.push(...r.value.items)
          if (r.value.hasMore) anyMore = true
          else latestExhausted.add(active[i].id)
        } else {
          const reason = r.reason
          failures.push(`${active[i].name}: ${reason instanceof Error ? reason.message : String(reason)}`)
        }
      })
      // 归并去重（跨源同名 + 同源复合键重复），保留新页与旧页的全量
      latest.value = mergeByTitle([...latest.value.map((c) => c.primary), ...collected])
      latestPage.value = page
      // 全部源失败视为瞬时故障：保留 hasMore 供手动重试，不误标「到底了」
      const allFailed = active.length > 0 && failures.length === active.length
      latestHasMore.value = allFailed ? latestHasMore.value : anyMore
      if (failures.length > 0 && collected.length === 0) latestError.value = failures.join('；')
    } finally {
      if (myRev === latestRev) latestLoading.value = false
    }
  }

  const latestEmpty = computed(
    () => !latestLoading.value && latestPage.value > 0 && latest.value.length === 0,
  )

  /** 配置（代理/数据源）变更后重置最新流，供下次从头拉取；作废在途分页结果 */
  function resetLatest(): void {
    latestRev++
    latest.value = []
    latestPage.value = 0
    latestHasMore.value = true
    latestError.value = ''
    latestLoading.value = false
    latestExhausted.clear()
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
