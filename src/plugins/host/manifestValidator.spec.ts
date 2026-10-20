import { describe, expect, it } from 'vitest'
import {
  sha256Hex,
  validateImportedManifest,
  verifyPackageIntegrity,
} from './manifestValidator'
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

function pkg(m: PluginManifest, code = '(function(){})();'): PluginPackage {
  return { formatVersion: 1, manifest: m, code }
}

describe('validateImportedManifest', () => {
  it('合法清单通过并返回副本', () => {
    const m = manifest({})
    const r = validateImportedManifest(m, { allowMainSandbox: false })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest).toEqual(m)
      // 副本：改动结果不污染原包
      r.manifest.name = 'changed'
      expect(m.name).toBe('示例站')
    }
  })

  it('规范主版本不兼容 → 拒绝', () => {
    const r = validateImportedManifest(manifest({ manifestVersion: '2.0' }), { allowMainSandbox: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toContain('不兼容的规范版本')
  })

  it('id 非法 / 域名缺失 → 拒绝', () => {
    const r = validateImportedManifest(manifest({ id: 'Bad_ID', permissions: { domains: [] } }), {
      allowMainSandbox: false,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.join()).toContain('id 非法')
      expect(r.errors.join()).toContain('permissions.domains')
    }
  })

  it('导入包 sandbox=main → 生产环境拒绝（DEV 显式放行）', () => {
    const m = manifest({ sandbox: 'main' })
    expect(validateImportedManifest(m, { allowMainSandbox: false }).ok).toBe(false)
    expect(validateImportedManifest(m, { allowMainSandbox: true }).ok).toBe(true)
  })

  it('type=remote 强制；未知能力与非法 config 拒绝', () => {
    expect(
      validateImportedManifest(manifest({ type: 'builtin' }), { allowMainSandbox: false }).ok,
    ).toBe(false)
    const r = validateImportedManifest(
      manifest({
        capabilities: ['latest', 'nope' as PluginManifest['capabilities'][number]],
        config: [{ key: 'api', label: '接口', type: 'select' }],
      }),
      { allowMainSandbox: false },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.join()).toContain('未知能力')
      expect(r.errors.join()).toContain('config.api')
    }
  })
})

describe('verifyPackageIntegrity', () => {
  it('sha256 匹配通过；缺省时回填实算值', async () => {
    const code = 'console.log(1)'
    const sha = (await sha256Hex(code)) ?? ''
    expect(sha).not.toBe('')

    const withSha = pkg(manifest({ sha256: sha }), code)
    await expect(verifyPackageIntegrity(withSha, withSha.manifest)).resolves.toBeUndefined()

    const noSha = pkg(manifest({}), code)
    await verifyPackageIntegrity(noSha, noSha.manifest)
    expect(noSha.manifest.sha256).toBe(sha)
  })

  it('sha256 不符 → CONFIG_INVALID', async () => {
    const bad = pkg(manifest({ sha256: '0'.repeat(64) }), 'code')
    await expect(verifyPackageIntegrity(bad, bad.manifest)).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
    })
  })

  it('实算值确实是 sha256', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
