import type { AnimeDetail } from '../plugins/host/types'

export interface LatestInfo {
  lineIndex: number
  episodeIndex: number
  episodeId: string
  title: string
}

/**
 * 取番剧的「最新一集」：以第一个非空线路（lineIndex 最小）为基准，
 * 该线路内 episodeIndex 最大者为最新。多线路间不交叉比较。
 */
export function primaryLatest(detail: AnimeDetail): LatestInfo | null {
  const eps = detail.episodes
  if (eps.length === 0) return null
  let minLine = Infinity
  for (const e of eps) {
    const li = e.lineIndex ?? 0
    if (li < minLine) minLine = li
  }
  let last: { episodeIndex: number; episodeId: string; title: string } | null = null
  for (const e of eps) {
    if ((e.lineIndex ?? 0) !== minLine) continue
    const ei = e.episodeIndex ?? 0
    if (!last || ei >= last.episodeIndex) {
      last = { episodeIndex: ei, episodeId: e.episodeId, title: e.title }
    }
  }
  if (!last) return null
  return { lineIndex: minLine, episodeIndex: last.episodeIndex, episodeId: last.episodeId, title: last.title }
}

/** 与已读指针 diff 出未看集数（源站结构变化导致回退时保守返回 0） */
export function newCountSince(lastSeenIndex: number, detail: AnimeDetail): number {
  const latest = primaryLatest(detail)
  if (!latest) return 0
  return Math.max(0, latest.episodeIndex - lastSeenIndex)
}
