/** 本地持久化 schema（技术架构设计 §5.2，v2 追加 lastSeenIndex） */

/** 订阅（IndexedDB: subscriptions，keyPath: key = `${sourceId}:${animeId}`） */
export interface Subscription {
  key: string
  sourceId: string
  animeId: string
  title: string
  cover?: string
  createdAt: number
  /** 已读指针指向的剧集 id（`line:ep`，0-based） */
  lastSeenEpisodeId?: string
  /** 已读指针指向的剧集序号（主线路内 0-based；diff 基准） */
  lastSeenIndex: number
  notifyEnabled: boolean
}

/** 观看历史（IndexedDB: history，keyPath: key = `${sourceId}:${animeId}:${episodeId}`） */
export interface HistoryEntry {
  key: string
  sourceId: string
  animeId: string
  episodeId: string
  title: string
  episodeTitle: string
  cover?: string
  playPageUrl?: string
  watchedAt: number
}
