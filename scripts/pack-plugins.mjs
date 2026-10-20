/**
 * 插件打包（docs/插件导入导出与热插拔设计.md §3 决策 D3）：
 * - src/plugins/sources/<id>/     → 内置插件（随应用注册表自动发现）
 * - src/plugins/packages/<id>/    → 仅分发的官方插件包（不内置，用户经设置页导入）
 * 两处都打成单文件插件包 public/plugins/<id>.asplugin.json
 * —— manifest 转为 remote 形态（worker 沙箱）+ IIFE 自包含 bundle 文本 + sha256 回填清单。
 * 产物写在 public/ 下：dev server 直接可访问（导出/导入即时可用），`vite build` 自动拷贝进 dist 随 Pages 部署。
 * `npm run build` 已串联本脚本；单独运行：npm run pack:plugins
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const sourcesDir = path.join(root, 'src/plugins/sources')
const packagesDir = path.join(root, 'src/plugins/packages')
const outDir = path.join(root, 'public/plugins')

async function bundleToIife(entry, globalName) {
  const bundle = await rolldown({ input: entry, platform: 'browser' })
  const { output } = await bundle.generate({ format: 'iife', name: globalName, exports: 'named' })
  await bundle.close()
  return output[0].code
}

const scan = (base) =>
  existsSync(base)
    ? readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ id: d.name, dirPath: path.join(base, d.name) }))
    : []
const dirs = [...scan(sourcesDir), ...scan(packagesDir)]
if (dirs.length === 0) {
  console.error('src/plugins/sources 与 src/plugins/packages 下都没有插件目录')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

for (const { id, dirPath } of dirs) {

  // 1) 入口打包为 IIFE，并按规范 §5.1 挂 self.__AS_PLUGIN__（default 导出优先，否则取首个函数导出）
  const js = await bundleToIife(path.join(dirPath, 'index.ts'), '__AS_MOD__')
  const code = [
    js,
    ";self.__AS_PLUGIN__ = __AS_MOD__.default || (function (m) {",
    "  for (var k in m) { if (typeof m[k] === 'function') return m[k]; }",
    "  return null;",
    "})(__AS_MOD__);",
  ].join('\n')

  // 2) 求值 manifest：TS 内存打包后经沙箱函数执行取得清单对象
  const mjs = await bundleToIife(path.join(dirPath, 'manifest.ts'), '__AS_MANIFEST__')
  const manifest = new Function(`${mjs}\n;return __AS_MANIFEST__.manifest;`)()

  // 3) 转 remote 分发形态：worker 沙箱 + 完整性摘要
  const sha256 = createHash('sha256').update(code, 'utf8').digest('hex')
  const pkg = {
    formatVersion: 1,
    manifest: { ...manifest, type: 'remote', entry: 'index.js', sandbox: 'worker', sha256 },
    code,
  }

  const outFile = path.join(outDir, `${id}.asplugin.json`)
  writeFileSync(outFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log(
    `✓ ${id} v${manifest.version} → ${path.relative(root, outFile)}（${(code.length / 1024).toFixed(1)} KiB）`,
  )
}
