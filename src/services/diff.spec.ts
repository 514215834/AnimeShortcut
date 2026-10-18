import { describe, expect, it } from 'vitest'
import { newCountSince, primaryLatest } from './diff'
import type { AnimeDetail } from '../plugins/host/types'

function makeDetail(episodes: Array<[number, number, string]>): AnimeDetail {
  return {
    animeId: '1',
    title: 't',
    genres: [],
    status: 'ongoing',
    episodes: episodes.map(([li, ei, title]) => ({
      episodeId: `${li}:${ei}`,
      title,
      line: `线${li + 1}`,
      lineIndex: li,
      episodeIndex: ei,
    })),
  }
}

describe('primaryLatest', () => {
  it('取第一个非空线路的最新一集', () => {
    const d = makeDetail([
      [1, 0, '第01集(线2)'],
      [1, 1, '第02集(线2)'],
      [0, 0, '第01集'],
      [0, 2, '第03集'],
    ])
    const l = primaryLatest(d)
    expect(l).toEqual({ lineIndex: 0, episodeIndex: 2, episodeId: '0:2', title: '第03集' })
  })

  it('空剧集返回 null', () => {
    expect(primaryLatest(makeDetail([]))).toBeNull()
  })
})

describe('newCountSince', () => {
  it('新集数 = 最新序号 - 已读序号（0-based，已读第01集=0）', () => {
    expect(newCountSince(0, makeDetail([[0, 3, '第04集']]))).toBe(3)
    expect(newCountSince(2, makeDetail([[0, 2, '第03集']]))).toBe(0)
  })
  it('回退/结构变化时保守返回 0', () => {
    expect(newCountSince(5, makeDetail([[0, 1, '第02集']]))).toBe(0)
  })
})
