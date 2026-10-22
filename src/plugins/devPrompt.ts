/**
 * 插件开发者支持：内嵌《数据源插件接口规范》全文 + AI 开发提示词生成。
 * 规范以 ?raw 随包内嵌（单一事实来源是 docs/ 数据源插件接口规范.md，改文档即随版本更新）。
 */
import specMd from '../../docs/数据源插件接口规范.md?raw'

export const specMarkdown: string = specMd

/** 复制文本：clipboard API 优先，降级 execCommand（非安全上下文可用） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 降级 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/** 下载文本为文件（规范 .md 离线交给 AI 或人阅读） */
export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 生成「让 AI 按规范开发插件」的提示词：角色 + 目标站点 + 工作步骤 + 自检清单 + 规范全文。
 * 交付物约定为单文件 .asplugin.json 插件包（manifest + IIFE code，sha256 缺省由宿主实算回填），
 * 用户零构建即可在设置页导入安装。
 * siteUrl 缺省时提示词指示 AI 先向用户询问，避免凭空编造站点。
 */
export function buildAiPluginPrompt(siteUrl?: string): string {
  const site = siteUrl?.trim()
  const target = site
    ? `目标站点：${site}（先探测确认其架构：JSON API 优先，如苹果CMS maccms 的 api.php/provide/vod；否则解析 HTML 页面）`
    : `目标站点：未提供——请先向用户询问站点首页 URL 与展示名，拿到后再继续，不要凭空假设站点结构`
  return `你是资深前端工程师，为「动漫更新看板」（纯前端动漫聚合看板）开发一个新的数据源插件。

${target}

下面的《数据源插件接口规范》是 normative 契约，产出必须严格符合它；只用规范定义的宿主上下文（ctx.http / ctx.dom / ctx.utils / ctx.storage / ctx.log）访问外部世界，禁止 import.meta.env 等构建时 API（分发形态要求）。

工作步骤：
1. 探测站点：确定每个能力（weekly/latest/search/detail/play，可选 catalog/rank）的数据端点与页面结构，列出字段映射；请求须遵守频率礼貌（规范 §8.8）。
2. 产出 manifest（JSON，规范 §4）：id 建议含站点域名词根；capabilities 只声明站点真实具备且你会实现的能力（声明即必须实现）；permissions.domains 覆盖接口与页面域名（后缀匹配）；remote 插件 sandbox 固定 "worker"。
3. 实现代码（纯 JavaScript IIFE 脚本，零构建：不写 TypeScript 语法、不用 import/export/require，定义工厂函数 (ctx: PluginContext) => AnimeSourcePlugin 并挂到 self.__AS_PLUGIN__ —— Worker 沙箱没有 window，一律用 self）：
   - 只实现声明的能力方法，方法无状态、可并发重入；init 幂等且不做网络请求；
   - 失败必须 throw { code, message }（错误码 §9），不得用空结果伪装成功；"查无结果"返回 { items: [], hasMore: false }；
   - 分页 page 从 1 起，hasMore 准确；单次能力调用上游请求 ≤ 3 个；
   - 所有 URL 仅 https；文本字段纯文本（utils.decodeEntities 解实体并剥 HTML 标签）；
   - weekday 按日本时间 UTC+9 档期，无把握缺省不猜；
   - ctx 全部方法（含 utils.decodeEntities / utils.absUrl）一律 await：worker 沙箱下是异步 RPC，main 形态虽是同步实现但不得依赖——漏 await 的插件在 remote 分发下会以 "TypeError: s.replace is not a function" 炸穿全部能力（规范 §6 跨沙箱 await 纪律，yinhuadm/dmmiku 两例前车之鉴）；
   - 多线路站点 episodeId 用 "线路序号:集序号"（均 0-based），并填充 line / lineIndex / episodeIndex 便于详情页线路分组；
   - 源站无稳定 id 时用 utils.hashId(稳定字符串) 生成且必须长期稳定（换 id 等于订阅失效）。
4. 产出测试夹具清单（§13 最少用例集）：每个能力 1 个成功样本 + 1 个空结果 + 1 个异常样本（断言错误码），并说明夹具命名；自检/回归必须以「ctx 全方法 Promise 化」的桩运行（§13 第 5 条，main 同步桩锁不住漏 await）。
5. 交付前自检表：capabilities 与方法一一对应 / 域名白名单覆盖全部请求 / 错误码正确 / 分页与预算 / https-only / 实体解码 / id 稳定性 / ctx 方法全部 await / 单文件包结构（formatVersion 为 1、code 为 IIFE 全文、sha256 缺省）。
6. 最终交付物（唯一交付形态）= 单个 .asplugin.json 文件：JSON 结构 { formatVersion: 1, manifest, code }——manifest 用第 2 步产出（type: "remote"、sandbox: "worker"、entry 填名义值如 "index.js"，宿主不按 entry 取文件）；code 为第 3 步 IIFE 脚本全文（作为 JSON 字符串嵌入，注意转义）；manifest.sha256 必须缺省（宿主导入时会实算回填，自行估算几乎必错、会让导入被拒）。文件名建议 <id>-v<version>.asplugin.json，用户在设置页导入该文件即完成安装。除这一个 JSON 文件外，不要输出多文件工程、package.json、构建配置或安装步骤说明。

《数据源插件接口规范》全文如下：

${specMarkdown}`
}
