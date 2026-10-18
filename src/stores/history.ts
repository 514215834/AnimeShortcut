import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { HistoryEntry } from '../core/storage/schema'
import { idbAll, idbDelete, idbPut } from '../core/storage/idb'

export interface PlayRecordInput {
  sourceId: string
  animeId: string
  episodeId: string
  title: string
  episodeTitle: string
  cover?: string
  playPageUrl?: string
}

export const useHistoryStore = defineStore('history', () => {
  const entries = ref<HistoryEntry[]>([])
  const loaded = ref(false)

  async function load(): Promise<void> {
    entries.value = (await idbAll<HistoryEntry>('history')).sort(
      (a, b) => b.watchedAt - a.watchedAt,
    )
    loaded.value = true
  }

  /** 记录一次播放（重复播放同一集刷新时间并置顶） */
  async function record(play: PlayRecordInput): Promise<void> {
    const entry: HistoryEntry = {
      key: `${play.sourceId}:${play.animeId}:${play.episodeId}`,
      sourceId: play.sourceId,
      animeId: play.animeId,
      episodeId: play.episodeId,
      title: play.title,
      episodeTitle: play.episodeTitle,
      cover: play.cover,
      playPageUrl: play.playPageUrl,
      watchedAt: Date.now(),
    }
    await idbPut('history', entry)
    await load()
  }

  async function remove(key: string): Promise<void> {
    await idbDelete('history', key)
    await load()
  }

  async function clearAll(): Promise<void> {
    for (const e of entries.value) await idbDelete('history', e.key)
    await load()
  }

  return { entries, loaded, load, record, remove, clearAll }
})
