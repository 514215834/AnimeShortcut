import type { AnimeSummary } from '../plugins/host/types'

/**
 * 多源归并（迭代 3 功能点 3-3）：
 * 多个数据源返回的同一部番（标题归一化后一致）合并为一张卡片，
 * 保留最新更新的条目为主条目，并记录全部来源供徽标与「换源查看」使用。
 */

/** 归并后的一张卡片：primary 用于展示与跳转，sourceIds 为该标题下的去重来源列表 */
export interface MergedCard {
  primary: AnimeSummary
  sourceIds: string[]
}

/** 标题归一化：全半角/大小写/空白与常见装饰符归一，仅用于同名归并（保守，不合并「第N季」差异） */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s:：·・~～~\-—_（）() [\]【】《》〈〉「」『』'"'"、,，.。!！?？*]+/gu, '')
}

/** 按 normalizedTitle 分组；组内主条目取 updateTime 最新（缺省视为 0，保持先出现者优先） */
export function mergeByTitle(items: AnimeSummary[]): MergedCard[] {
  const groups = new Map<string, AnimeSummary[]>()
  for (const it of items) {
    if (!it.title) continue
    const key = normalizeTitle(it.title)
    const bucket = groups.get(key)
    if (bucket) {
      // 同源同番去重（复合键重复，如周更表与更新流重叠）
      if (!bucket.some((b) => b.sourceId === it.sourceId && b.animeId === it.animeId)) {
        bucket.push(it)
      }
    } else {
      groups.set(key, [it])
    }
  }
  const out: MergedCard[] = []
  for (const members of groups.values()) {
    const sourceIds = Array.from(new Set(members.map((m) => m.sourceId ?? '')))
    const primary = members.reduce((best, cur) =>
      (cur.updateTime ?? 0) > (best.updateTime ?? 0) ? cur : best,
    )
    out.push({ primary, sourceIds })
  }
  return out.sort((a, b) => (b.primary.updateTime ?? 0) - (a.primary.updateTime ?? 0))
}

/** 从归并结果取展平后的主条目列表（供卡片网格直接渲染） */
export function flattenMerged(cards: MergedCard[]): AnimeSummary[] {
  return cards.map((c) => c.primary)
}
