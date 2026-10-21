import { describe, expect, it } from 'vitest'
import { buildAiPluginPrompt, specMarkdown } from './devPrompt'

describe('devPrompt（设置页开发者支持）', () => {
  it('规范全文内嵌且包含关键契约章节', () => {
    expect(specMarkdown.length).toBeGreaterThan(5000)
    for (const marker of ['manifest', 'PluginContext', '错误码', 'Worker']) {
      expect(specMarkdown).toContain(marker)
    }
  })

  it('提示词内嵌规范全文，未填站点时指示 AI 先询问', () => {
    const p = buildAiPluginPrompt()
    expect(p).toContain('先向用户询问')
    expect(p).toContain(specMarkdown)
    expect(p).not.toContain('目标站点：https://')
  })

  it('填入站点地址后替换占位语义', () => {
    const p = buildAiPluginPrompt('https://www.example-anime.cc')
    expect(p).toContain('目标站点：https://www.example-anime.cc')
    expect(p).not.toContain('先向用户询问')
    // 契约要点必须随提示词携带
    for (const key of ['capabilities', 'permissions.domains', 'hasMore', 'decodeEntities', 'episodeId']) {
      expect(p).toContain(key)
    }
  })
})
