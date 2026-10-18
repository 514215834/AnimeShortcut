import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AnimeSummary } from '../plugins/host/types'
import type { Subscription } from '../core/storage/schema'
import { idbAll, idbDelete, idbGet, idbPut } from '../core/storage/idb'

export const useSubscriptionStore = defineStore('subscription', () => {
  const subs = ref<Subscription[]>([])
  const loaded = ref(false)

  const subSet = ref(new Set<string>())

  async function load(): Promise<void> {
    subs.value = (await idbAll<Subscription>('subscriptions')).sort(
      (a, b) => b.createdAt - a.createdAt,
    )
    subSet.value = new Set(subs.value.map((s) => s.key))
    loaded.value = true
  }

  function isSubscribed(sourceId: string, animeId: string): boolean {
    return subSet.value.has(`${sourceId}:${animeId}`)
  }

  async function add(anime: AnimeSummary): Promise<void> {
    const sourceId = anime.sourceId
    if (!sourceId) return
    const key = `${sourceId}:${anime.animeId}`
    if (subSet.value.has(key)) return
    const sub: Subscription = {
      key,
      sourceId,
      animeId: anime.animeId,
      title: anime.title,
      cover: anime.cover,
      createdAt: Date.now(),
      lastSeenIndex: 0,
      notifyEnabled: true,
    }
    await idbPut('subscriptions', sub)
    await load()
  }

  async function remove(key: string): Promise<void> {
    await idbDelete('subscriptions', key)
    await load()
  }

  /** 更新已读指针（进入详情/播放后调用，红点清除） */
  async function markSeen(key: string, latestIndex: number, latestEpisodeId: string): Promise<void> {
    const sub = await idbGet<Subscription>('subscriptions', key)
    if (!sub) return
    sub.lastSeenIndex = Math.max(sub.lastSeenIndex, latestIndex)
    sub.lastSeenEpisodeId = latestEpisodeId
    await idbPut('subscriptions', sub)
  }

  return { subs, loaded, load, isSubscribed, add, remove, markSeen }
})
