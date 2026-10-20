import {
  PluginError,
  type PluginCapability,
  type PluginManifest,
  type PluginPackage,
} from './types'

/** 宿主支持的规范主版本（次版本全兼容，接口规范 §1.3） */
const SUPPORTED_MAJOR = 1
const CAPS: readonly PluginCapability[] = ['weekly', 'latest', 'search', 'detail', 'play', 'catalog', 'rank']
const ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i
const SHA256_RE = /^[0-9a-f]{64}$/i

export type ManifestCheck = { ok: true; manifest: PluginManifest } | { ok: false; errors: string[] }

/**
 * 校验导入包内清单（设计 §6 步骤 2）：schema、规范版本兼容、能力子集、域名合法性；
 * 导入插件 type 强制 remote、sandbox 强制 worker（DEV 例外允许 main 便于调试）。
 * 返回清单副本（导入后允许宿主回填 sha256）。
 */
export function validateImportedManifest(
  raw: unknown,
  opts?: { allowMainSandbox?: boolean },
): { ok: true; manifest: PluginManifest } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const m = raw as Partial<PluginManifest> | null
  const allowMain = opts?.allowMainSandbox ?? import.meta.env.DEV

  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    return { ok: false, errors: ['清单不是对象'] }
  }

  const major = typeof m.manifestVersion === 'string' ? Number(m.manifestVersion.split('.')[0]) : NaN
  if (typeof m.manifestVersion !== 'string' || !m.manifestVersion) {
    errors.push('缺少 manifestVersion')
  } else if (major !== SUPPORTED_MAJOR) {
    errors.push(`不兼容的规范版本 ${m.manifestVersion}（宿主支持 ${SUPPORTED_MAJOR}.x）`)
  }

  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) errors.push(`id 非法: ${JSON.stringify(m.id)}（需匹配 ${ID_RE.source}）`)
  if (typeof m.name !== 'string' || !m.name.trim()) errors.push('缺少 name')
  if (typeof m.version !== 'string' || !m.version.trim()) errors.push('缺少 version')

  if (typeof m.siteUrl !== 'string' || !isHttps(m.siteUrl)) errors.push('siteUrl 必须是 https URL')
  if (m.icon !== undefined && (typeof m.icon !== 'string' || !isHttps(m.icon))) errors.push('icon 必须是 https URL')
  if (typeof m.entry !== 'string' || !m.entry.trim()) errors.push('缺少 entry')

  if (m.type !== 'remote') errors.push('导入插件 type 必须为 remote')
  if (m.sandbox !== 'worker' && !(allowMain && m.sandbox === 'main')) {
    errors.push('导入插件 sandbox 必须为 worker')
  }

  if (!Array.isArray(m.capabilities) || m.capabilities.length === 0) {
    errors.push('capabilities 必须为非空数组')
  } else {
    const unknown = m.capabilities.filter((c) => !CAPS.includes(c as PluginCapability))
    if (unknown.length > 0) errors.push(`未知能力: ${unknown.join(', ')}`)
  }

  const domains = m.permissions?.domains
  if (!Array.isArray(domains) || domains.length === 0) {
    errors.push('permissions.domains 必须为非空数组')
  } else {
    for (const d of domains) {
      if (typeof d !== 'string' || !DOMAIN_RE.test(d)) errors.push(`域名非法: ${JSON.stringify(d)}`)
    }
  }
  if (m.permissions !== undefined && typeof m.permissions !== 'object') errors.push('permissions 必须为对象')
  if (m.permissions?.storage !== undefined && typeof m.permissions.storage !== 'boolean') {
    errors.push('permissions.storage 必须为布尔值')
  }

  if (m.config !== undefined) {
    if (!Array.isArray(m.config)) {
      errors.push('config 必须为数组')
    } else {
      for (const f of m.config) {
        if (!f || typeof f.key !== 'string' || !f.key) errors.push('config 项缺少 key')
        else if (!['string', 'number', 'boolean', 'select'].includes(f.type)) errors.push(`config.${f.key}.type 非法: ${String(f.type)}`)
        else if (f.type === 'select' && !Array.isArray(f.options)) errors.push(`config.${f.key} 为 select 但缺 options`)
      }
    }
  }

  if (m.cacheHints !== undefined) {
    if (typeof m.cacheHints !== 'object' || m.cacheHints === null) {
      errors.push('cacheHints 必须为对象')
    } else {
      for (const [k, v] of Object.entries(m.cacheHints)) {
        if (!CAPS.includes(k as PluginCapability) || typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
          errors.push(`cacheHints.${k} 非法`)
        }
      }
    }
  }

  if (m.sha256 !== undefined && (typeof m.sha256 !== 'string' || !SHA256_RE.test(m.sha256))) {
    errors.push('sha256 必须为 64 位 hex')
  }

  if (errors.length > 0) return { ok: false, errors }
  // 副本回填：不让宿主写入污染调用方的原始包对象
  return { ok: true, manifest: JSON.parse(JSON.stringify(m)) as PluginManifest }
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** WebCrypto 不可用（非安全上下文）时返回 null，调用方跳过完整性校验 */
export async function sha256Hex(text: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof TextEncoder === 'undefined') return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 完整性校验（设计 §6 步骤 2/3）：manifest.sha256 存在时与 code 实算值比对；
 * 清单缺省 sha256 时把实算值回填进 manifest（启动恢复装载时沿用同一校验）。
 */
export async function verifyPackageIntegrity(pkg: PluginPackage, manifest: PluginManifest): Promise<void> {
  const actual = await sha256Hex(pkg.code)
  if (!actual) {
    console.warn('[PluginHost] WebCrypto 不可用，跳过插件包 sha256 校验')
    return
  }
  if (manifest.sha256 && manifest.sha256.toLowerCase() !== actual) {
    throw new PluginError('CONFIG_INVALID', '插件包 sha256 校验失败，文件可能被篡改或不完整')
  }
  if (!manifest.sha256) manifest.sha256 = actual
}
