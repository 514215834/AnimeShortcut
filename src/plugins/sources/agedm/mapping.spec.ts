import { describe, expect, it } from 'vitest'
import {
  parseSiteTime,
  playPageUrl,
  toDetail,
  unwrap,
  updateToSummary,
  weekToSummary,
  type AgedmDetailResponse,
  type AgedmItem,
  type AgedmWeekItem,
} from './mapping'
import { PluginError } from '../../host/types'

describe('unwrap 包裹处理', () => {
  it('信封结构 code=200 取 data', () => {
    expect(unwrap<{ a: number }>({ code: 200, message: '', data: { a: 1 } }, 't')).toEqual({ a: 1 })
  })
  it('信封结构 code!=200 抛错', () => {
    expect(() => unwrap({ code: 40050, message: '参数错误！' }, 'search')).toThrow(PluginError)
  })
  it('裸结构原样返回', () => {
    expect(unwrap({ total: '5' }, 'update')).toEqual({ total: '5' })
  })
})

describe('字段映射', () => {
  const item: AgedmItem = {
    AID: 20260293,
    Href: '/detail/20260293',
    NewTitle: '第3集',
    PicSmall: 'https://example.com/c.jpg',
    Title: '脑洞学生会',
  }

  it('update 列表项 → 摘要', () => {
    const s = updateToSummary(item)
    expect(s.animeId).toBe('20260293')
    expect(s.title).toBe('脑洞学生会')
    expect(s.latestEpisodeTitle).toBe('第3集')
    expect(s.playPageUrl).toBe('https://m.agedm.io/#/detail/20260293')
    expect(s.sourceId).toBeUndefined()
  })

  it('week_list 项 → 摘要（weekday 取 wd，时间按 UTC+8）', () => {
    const w: AgedmWeekItem = {
      id: 20260330,
      wd: 0,
      name: '魔法★探险家',
      mtime: '2026-10-18 01:02:53',
      namefornew: '00:30 第4集',
    }
    const s = weekToSummary(w)
    expect(s.weekday).toBe(0)
    expect(s.updateTime).toBe(parseSiteTime('2026-10-18 01:02:53'))
    expect(parseSiteTime('2026-10-18 01:02:53')).toBe(
      Date.parse('2026-10-18T01:02:53+08:00'),
    )
    expect(s.latestEpisodeTitle).toBe('00:30 第4集')
  })

  it('非法时间返回 undefined 而不虚构', () => {
    expect(parseSiteTime(undefined)).toBeUndefined()
    expect(parseSiteTime('not-a-date')).toBeUndefined()
  })
})

describe('toDetail 剧集展开', () => {
  const resp: AgedmDetailResponse = {
    video: {
      id: 20260293,
      name: '脑洞学生会',
      cover: 'https://example.com/c.jpg',
      intro: '简介',
      area: '日本',
      year: '2026',
      status: '连载',
      uptodate: '01:00 第3集',
      tags_arr: ['搞笑', '日常'],
      playlists: {
        xigua: [['第01集', 'age_x1'], ['第02集', 'age_x2']],
        ffm3u8: [['第01集', 'age_f1']],
        empty: [],
      },
    },
    player_label_arr: { xigua: '西瓜', ffm3u8: '非凡' },
  }

  it('跳过空线路并保留线路名与序号', () => {
    const d = toDetail(resp)
    expect(d.episodes).toHaveLength(3)
    expect(d.status).toBe('ongoing')
    expect(d.region).toBe('日本 / 2026')
    expect(d.episodes[0]).toMatchObject({
      episodeId: '0:0',
      title: '第01集',
      line: '西瓜',
      lineIndex: 0,
      episodeIndex: 0,
    })
  })

  it('播放 URL 为 1-based 线路/集序号（源站语义）', () => {
    const d = toDetail(resp)
    expect(d.episodes[2]?.playPageUrl).toBe('https://m.agedm.io/#/play/20260293/2/1')
    expect(playPageUrl(20260293, 1, 2)).toBe('https://m.agedm.io/#/play/20260293/2/3')
  })
})
