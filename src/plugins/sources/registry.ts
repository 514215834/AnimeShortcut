import type { PluginFactory } from '../host/types'

/**
 * 内置插件注册表（零适配）：自动发现 src/plugins/sources/<id>/index.ts。
 * 新增数据源 = 新建一个插件目录（按《数据源插件接口规范》默认导出工厂函数），
 * 宿主其余代码零改动。
 */
const mods = import.meta.glob<PluginFactory>('./*/index.ts', {
  eager: true,
  import: 'default',
})

/** 目录名排序保证加载顺序稳定（agedm → yinhuadm） */
export const builtinFactories: PluginFactory[] = Object.entries(mods)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, factory]) => factory)
