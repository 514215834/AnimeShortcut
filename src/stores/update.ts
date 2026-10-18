import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/** 订阅的更新状态（services/updateChecker 写入，UI 读取） */
export const useUpdateStore = defineStore('update', () => {
  /** key（sourceId:animeId）→ 未看集数 */
  const counts = ref<Record<string, number>>({})
  /** key → 最新一集标题（来自最近一次检测） */
  const latestTitles = ref<Record<string, string>>({})
  /** key → 番剧状态（ongoing/finished/unknown，来自最近一次检测） */
  const statuses = ref<Record<string, string>>({})
  const lastCheckAt = ref(0)
  const checking = ref(false)
  const consecutiveFailures = ref(0)

  const totalNew = computed(() =>
    Object.values(counts.value).reduce((a, b) => a + (b > 0 ? b : 0), 0),
  )

  function setResults(
    countsIn: Record<string, number>,
    titlesIn: Record<string, string>,
    statusesIn?: Record<string, string>,
  ): void {
    counts.value = countsIn
    latestTitles.value = titlesIn
    if (statusesIn) statuses.value = statusesIn
  }

  function clearKey(key: string): void {
    counts.value = { ...counts.value, [key]: 0 }
  }

  return {
    counts,
    latestTitles,
    statuses,
    lastCheckAt,
    checking,
    consecutiveFailures,
    totalNew,
    setResults,
    clearKey,
  }
})
