import { PluginError, type PluginManifest, type PluginPackage } from './types'

export const PACKAGE_FORMAT_VERSION = 1
export const PACKAGE_EXT = '.asplugin.json'

function parsePackageText(text: string): PluginPackage {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch (e) {
    throw new PluginError('PARSE', `插件包不是合法 JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  const pkg = obj as Partial<PluginPackage> | null
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new PluginError('PARSE', '插件包结构非法：应为 { formatVersion, manifest, code }')
  }
  if (pkg.formatVersion !== PACKAGE_FORMAT_VERSION) {
    throw new PluginError('CONFIG_INVALID', `不支持的插件包版本: ${String(pkg.formatVersion)}（当前 ${PACKAGE_FORMAT_VERSION}）`)
  }
  if (!pkg.manifest || typeof pkg.manifest !== 'object') {
    throw new PluginError('PARSE', '插件包缺少 manifest')
  }
  if (typeof pkg.code !== 'string' || !pkg.code.trim()) {
    throw new PluginError('PARSE', '插件包缺少 code（插件脚本文本）')
  }
  return { formatVersion: PACKAGE_FORMAT_VERSION, manifest: pkg.manifest as PluginManifest, code: pkg.code }
}

/** 从 .asplugin.json 文件导入（设置页文件选择器） */
export async function readPackageFromFile(file: File): Promise<PluginPackage> {
  let text: string
  try {
    text = await file.text()
  } catch (e) {
    throw new PluginError('NETWORK', `读取文件失败: ${e instanceof Error ? e.message : String(e)}`)
  }
  return parsePackageText(text)
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
    if (!res.ok) throw new PluginError('NETWORK', `HTTP ${res.status}: ${url}`)
    return await res.text()
  } catch (e) {
    if (e instanceof PluginError) throw e
    // 浏览器把跨域失败统一归并为 TypeError，这里按 CORS/网络问题提示
    throw new PluginError(
      'NETWORK',
      `拉取失败（需托管源允许跨域，见接口规范 §12）: ${url}`,
      { cause: e },
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 从 URL 导入（规范 §11 步骤 1 / §12）：URL 可指向
 * ① 单文件插件包（.asplugin.json，formatVersion 标记）——整包直接采用；
 * ② 插件清单 —— 由 entry 字段解析脚本地址（相对 entry 按清单 URL 解析）→ fetch 脚本 → 组包。
 */
export async function fetchPackageFromUrl(manifestUrl: string): Promise<PluginPackage> {
  const text = await fetchTextWithTimeout(manifestUrl, 15_000)
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new PluginError('PARSE', `清单不是合法 JSON: ${manifestUrl}`)
  }
  if (obj && typeof obj === 'object' && 'formatVersion' in (obj as Record<string, unknown>)) {
    return parsePackageText(text)
  }
  const manifest = obj as PluginManifest
  if (typeof manifest.entry !== 'string' || !manifest.entry.trim()) {
    throw new PluginError('PARSE', '清单缺少 entry（入口脚本地址）')
  }
  let entryUrl: string
  try {
    entryUrl = new URL(manifest.entry, manifestUrl).href
  } catch {
    throw new PluginError('PARSE', `entry 地址非法: ${manifest.entry}`)
  }
  if (!entryUrl.startsWith('https://') && !import.meta.env.DEV) {
    throw new PluginError('CONFIG_INVALID', 'entry 必须是 https 地址')
  }
  const code = await fetchTextWithTimeout(entryUrl, 20_000)
  return { formatVersion: PACKAGE_FORMAT_VERSION, manifest, code }
}

/** 导出插件包为文件下载 */
export function downloadPackage(pkg: PluginPackage): void {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${pkg.manifest.id}-v${pkg.manifest.version}${PACKAGE_EXT}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/**
 * 获取内置插件的可分发产物（设计 §2 D3）：`npm run pack:plugins` 的构建产物写在与 public/（随 Pages 部署），
 * 导出按钮直接取用。
 */
export async function fetchBuiltinPackage(id: string): Promise<PluginPackage> {
  const url = import.meta.env.BASE_URL + 'plugins/' + id + PACKAGE_EXT
  const text = await fetchTextWithTimeout(url, 15_000)
  if (text.trimStart().startsWith('<')) {
    // dev：产物未生成时 vite 会回落 index.html；prod：部署产物缺失
    throw new PluginError(
      'PARSE',
      import.meta.env.DEV
        ? `内置插件「${id}」的导出产物不存在：请先运行 npm run pack:plugins 生成（dev 下 public/plugins/ 即时生效）`
        : `内置插件「${id}」的导出产物未随站点部署（构建流程需包含 pack:plugins）`,
    )
  }
  return parsePackageText(text)
}
