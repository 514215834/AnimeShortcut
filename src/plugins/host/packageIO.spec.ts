import { describe, expect, it, vi } from 'vitest'
import { fetchPackageFromUrl, PACKAGE_EXT, readPackageFromFile } from './packageIO'
import type { PluginManifest, PluginPackage } from './types'

function manifest(over: Partial<PluginManifest>): PluginManifest {
  return {
    manifestVersion: '1.0',
    id: 'example',
    name: '示例站',
    version: '1.0.0',
    siteUrl: 'https://example.com',
    type: 'remote',
    entry: 'index.js',
    sandbox: 'worker',
    capabilities: ['latest'],
    permissions: { domains: ['example.com'] },
    ...over,
  }
}

function pkg(m: PluginManifest): PluginPackage {
  return { formatVersion: 1, manifest: m, code: '(function(){})();' }
}

describe('包解析与文件导入', () => {
  it('文件 round-trip：导出结构 → 文件 → 再导入一致', async () => {
    const p = pkg(manifest({}))
    const file = new File([JSON.stringify(p)], `example-v1.0.0${PACKAGE_EXT}`, { type: 'application/json' })
    const read = await readPackageFromFile(file)
    expect(read).toEqual(p)
  })

  it('非法 JSON → PARSE', async () => {
    const file = new File(['not json'], 'x.json')
    await expect(readPackageFromFile(file)).rejects.toMatchObject({ code: 'PARSE' })
  })

  it('formatVersion 不支持 → CONFIG_INVALID', async () => {
    const file = new File([JSON.stringify({ ...pkg(manifest({})), formatVersion: 2 })], 'x.json')
    await expect(readPackageFromFile(file)).rejects.toMatchObject({ code: 'CONFIG_INVALID' })
  })

  it('缺 code → PARSE', async () => {
    const { code: _code, ...rest } = pkg(manifest({}))
    const file = new File([JSON.stringify(rest)], 'x.json')
    await expect(readPackageFromFile(file)).rejects.toMatchObject({ code: 'PARSE' })
  })
})

describe('URL 导入（清单 + entry 组包）', () => {
  it('整包 URL（.asplugin.json，formatVersion）直接采用不二次拉取', async () => {
    const p = pkg(manifest({ sha256: 'a'.repeat(64) }))
    const fetchStub = vi.fn(async (): Promise<Response> => new Response(JSON.stringify(p)))
    vi.stubGlobal('fetch', fetchStub)
    try {
      const read = await fetchPackageFromUrl('https://cdn.example.com/yinhuadm.asplugin.json')
      expect(read.formatVersion).toBe(1)
      expect(read.manifest.id).toBe('example')
      expect(read.code).toBe(p.code)
      expect(fetchStub).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('相对 entry 按清单 URL 解析并拉取脚本文本', async () => {
    const m = manifest({})
    const fetchStub = vi.fn(async (url: string | URL): Promise<Response> => {
      const u = String(url)
      if (u.endsWith('/plugin.json')) return new Response(JSON.stringify(m))
      if (u === 'https://cdn.example.com/p/example/1.0.0/index.js') return new Response('console.log(1)')
      throw new Error(`unexpected fetch: ${u}`)
    })
    vi.stubGlobal('fetch', fetchStub)
    try {
      const read = await fetchPackageFromUrl('https://cdn.example.com/p/example/1.0.0/plugin.json')
      expect(read.formatVersion).toBe(1)
      expect(read.manifest.id).toBe('example')
      expect(read.code).toBe('console.log(1)')
      expect(fetchStub).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('清单缺 entry → PARSE；entry 拉取失败 → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    try {
      await expect(fetchPackageFromUrl('https://cdn.example.com/plugin.json')).rejects.toMatchObject({
        code: 'PARSE',
      })
    } finally {
      vi.unstubAllGlobals()
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL): Promise<Response> => {
        if (String(url).endsWith('plugin.json')) return new Response(JSON.stringify(manifest({})))
        throw new TypeError('network fail')
      }),
    )
    try {
      await expect(fetchPackageFromUrl('https://cdn.example.com/plugin.json')).rejects.toMatchObject({
        code: 'NETWORK',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
