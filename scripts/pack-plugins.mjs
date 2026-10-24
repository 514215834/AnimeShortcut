/**
 * 插件打包（docs/插件导入导出与热插拔设计.md §3 决策 D3）：
 * - src/plugins/sources/<id>/     → 内置插件（随应用注册表自动发现）
 * - src/plugins/packages/<id>/    → 仅分发的官方插件包（不内置，用户经设置页导入）
 * 两处都打成单文件插件包 public/plugins/<id>.asplugin.json
 * —— manifest 转为 remote 形态（worker 沙箱）+ IIFE 自包含 bundle 文本 + sha256 回填清单。
 * 目录支持两种形态：
 * - 标准源码形态（index.ts + manifest.ts）：入口经 rolldown 打为 IIFE 并追加 §5.1 挂载；
 * - 预构建形态（plugin.iife.js，零构建纯 JS 交付）：代码原文即为包内 code（自身挂载
 *   self.__AS_PLUGIN__，不再二次打包），manifest 自 IIFE 运行时提取（factory(dummy).manifest），
 *   保证包内清单与代码自述一致（girigirilove 即此形态），打包前做零构建禁用模式校验。
 * 产物写在 public/ 下：dev server 直接可访问（导出/导入即时可用），`vite build` 自动拷贝进 dist 随 Pages 部署。
 * `npm run build` 已串联本脚本；单独运行：npm run pack:plugins
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
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
  let code
  let manifest

  if (existsSync(path.join(dirPath, 'plugin.iife.js'))) {
    // 预构建形态：代码原文直通 + 运行时提取 manifest（零构建禁用模式校验同交付要求）
    code = readFileSync(path.join(dirPath, 'plugin.iife.js'), 'utf8')
    for (const bad of [/\bimport\s+[\w{]/, /\bexport\s+(default|const|let|var|function|\{)/, /require\(/, /import\.meta/, /window\./]) {
      if (bad.test(code)) {
        console.error(`✗ ${id}：零构建校验失败，代码包含禁止模式 ${bad}`)
        process.exit(1)
      }
    }
    manifest = await extractPrebuiltManifest(code, id)
  } else {
    // 标准源码形态：入口打包为 IIFE，并按规范 §5.1 挂载 self.__AS_PLUGIN__（default 导出优先，否则取首个函数导出）
    const js = await bundleToIife(path.join(dirPath, 'index.ts'), '__AS_MOD__')
    code = [
      js,
      ";self.__AS_PLUGIN__ = __AS_MOD__.default || (function (m) {",
      "  for (var k in m) { if (typeof m[k] === 'function') return m[k]; }",
      "  return null;",
      "})(__AS_MOD__);",
    ].join('\n')

    // 求值 manifest：TS 内存打包后经沙箱函数执行取得清单对象
    const mjs = await bundleToIife(path.join(dirPath, 'manifest.ts'), '__AS_MANIFEST__')
    manifest = new Function(`${mjs}\n;return __AS_MANIFEST__.manifest;`)()
  }

  // 转 remote 分发形态：worker 沙箱 + 完整性摘要
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

/** 预构建形态的 manifest 提取：沙箱求值 IIFE → 工厂 dummy ctx 构造（不触网）→ plugin.manifest */
async function extractPrebuiltManifest(code, id) {
  const fakeSelf = {}
  const sandbox = { self: fakeSelf, console }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox, { filename: 'plugin.iife.js' })
  const factory = fakeSelf.__AS_PLUGIN__
  if (typeof factory !== 'function') {
    throw new Error(`${id}：预构建 IIFE 未挂载 self.__AS_PLUGIN__ 工厂（规范 §5.1）`)
  }
  const dummy = {
    env: { hostVersion: '0.0.0', specVersion: '1.0', locale: 'zh-CN', timezone: 'UTC', mode: 'production' },
    http: {}, dom: {}, storage: {}, log: console, utils: {},
  }
  const plugin = await factory(dummy)
  if (!plugin?.manifest) {
    throw new Error(`${id}：工厂产物缺少 manifest，无法提取清单`)
  }
  return JSON.parse(JSON.stringify(plugin.manifest))
}
