import { describe, expect, it } from 'vitest'
import { mergeByTitle, normalizeTitle } from './merge'
import type { AnimeSummary } from '../plugins/host/types'

function sum(sourceId: string, animeId: string, title: string, updateTime?: number): AnimeSummary {
  return { sourceId, animeId, title, updateTime }
}

describe('normalizeTitle', () => {
  it('归一空白/全半角/大小写与装饰符', () => {
    expect(normalizeTitle('咒术回战 第二季')).toBe(normalizeTitle('咒 术 回 战：第二季！'))
    expect(normalizeTitle('「Re:Zero」')).toBe(normalizeTitle('re zero'))
    expect(normalizeTitle('ＡＴＴＡＣＫ')).toBe(normalizeTitle('attack'))
  })
})

describe('mergeByTitle', () => {
  it('跨源同名归并：主条目取最新更新，来源去重', () => {
    const cards = mergeByTitle([
      sum('agedm', '101', '葬送的芙莉莲', 1700000000000),
      sum('other', 'A9', '葬送的芙莉莲', 1700001000000),
      sum('third', 'x7', '葬送的芙莉莲'),
    ])
    expect(cards).toHaveLength(1)
    expect(cards[0]?.primary.animeId).toBe('A9') // updateTime 最新
    expect(cards[0]?.sourceIds).toEqual(['agedm', 'other', 'third'])
  })

  it('同源复合键重复去重，不同番不误并', () => {
    const cards = mergeByTitle([
      sum('agedm', '101', '葬送的芙莉莲'),
      sum('agedm', '101', '葬送的芙莉莲'),
      sum('agedm', '102', '葬送的芙莉莲 第二季'),
    ])
    expect(cards).toHaveLength(2)
  })

  it('结果按主条目 updateTime 降序；无 updateTime 保持稳定在前', () => {
    const cards = mergeByTitle([
      sum('a', '1', '番A'),
      sum('a', '2', '番B', 100),
      sum('a', '3', '番C', 200),
    ])
    expect(cards.map((c) => c.primary.animeId)).toEqual(['3', '2', '1'])
  })

  it('缺 sourceId 的条目归入空串来源组，不抛错', () => {
    const cards = mergeByTitle([{ animeId: '1', title: '无源番' }])
    expect(cards).toHaveLength(1)
    expect(cards[0]?.sourceIds).toEqual([''])
  })
})
