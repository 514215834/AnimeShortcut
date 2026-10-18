/**
 * 更新检测服务（技术架构设计 §6）：
 * 页面可见时按设置间隔抓取订阅番剧的最新剧集，与已读指针 diff → 角标 + 通知。
 * GitHub Pages 无后端，仅前台提醒。
 */
import { sources } from '../plugins/host/host'
import { readJson, writeJson } from '../core/storage/localStore'
import { newCountSince, primaryLatest } from './diff'
import { useSettingsStore } from '../stores/settings'
import { useSubscriptionStore } from '../stores/subscription'
import { useUpdateStore } from '../stores/update'

const TICK_MS = 30_000
const NOTIFIED_KEY = 'update:notified'

let started = false

export function startUpdateChecker(): void {
  if (started || typeof document === 'undefined') return
  started = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runCheck(false)
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') void runCheck(false)
  }, TICK_MS)
}

/** 执行一轮检测；force 跳过间隔限制（如手动刷新） */
export async function runCheck(force: boolean): Promise<void> {
  const settings = useSettingsStore()
  const subStore = useSubscriptionStore()
  const update = useUpdateStore()

  if (update.checking) return
  if (!subStore.loaded) await subStore.load()
  if (subStore.subs.length === 0) {
    update.lastCheckAt = Date.now()
    return
  }
  if (!force && Date.now() - update.lastCheckAt < settings.settings.fetchIntervalMin * 60_000) {
    return
  }

  update.checking = true
  try {
    const counts = { ...update.counts }
    const titles = { ...update.latestTitles }
    const statuses = { ...update.statuses }
    const notified = readJson<Record<string, number>>(NOTIFIED_KEY) ?? {}
    let failures = 0
    let checked = 0
    const toNotify: Array<{ key: string; title: string; epTitle: string; index: number }> = []

    for (const sub of subStore.subs) {
      try {
        // 绕过宿主方法缓存，保证检测拿到新数据
        const d = await sources.detail(sub.sourceId, sub.animeId, { fresh: true })
        checked += 1
        const info = primaryLatest(d)
        counts[sub.key] = info ? newCountSince(sub.lastSeenIndex, d) : 0
        statuses[sub.key] = d.status ?? 'unknown'
        if (info) titles[sub.key] = info.title
        const notifiedIdx = notified[sub.key] ?? sub.lastSeenIndex
        if (info && info.episodeIndex > notifiedIdx) {
          toNotify.push({ key: sub.key, title: sub.title, epTitle: info.title, index: info.episodeIndex })
        }
      } catch {
        failures += 1
      }
    }

    update.setResults(counts, titles, statuses)
    update.lastCheckAt = Date.now()
    update.consecutiveFailures = checked === 0 && failures > 0 ? update.consecutiveFailures + 1 : 0

    if (
      settings.settings.notificationsEnabled &&
      toNotify.length > 0 &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      for (const it of toNotify) notified[it.key] = it.index
      writeJson(NOTIFIED_KEY, notified)
      const body =
        toNotify.length === 1
          ? `《${toNotify[0].title}》更新至 ${toNotify[0].epTitle}`
          : `《${toNotify[0].title}》等 ${toNotify.length} 部有更新`
      try {
        new Notification('追番更新 📺', { body })
      } catch {
        /* 通知失败静默 */
      }
    }
  } finally {
    update.checking = false
  }
}
