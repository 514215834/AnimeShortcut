import type { PluginFactory } from '../host/types'
import { createAgedmPlugin } from './agedm'

/** 内置插件注册表：新增站点在此追加工厂即可 */
export const builtinFactories: PluginFactory[] = [createAgedmPlugin()]
