/**
 * 主题系统：
 * - 主题色预设：改写 Tailwind @theme 生成的 --color-accent-* 变量，全局换色
 * - 明暗模式：light / dark / system（跟随系统），类名 .dark 驱动
 * - 背景光斑开关：html.bg-plain-off
 * settings store 的动作在变更时调用 applyTheme。
 */

export const ACCENT_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700'] as const
export type AccentShade = (typeof ACCENT_SHADES)[number]

export interface AccentPreset {
  id: string
  name: string
  shades: Record<AccentShade, string>
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'indigo',
    name: '静夜靛',
    shades: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
  },
  {
    id: 'sky',
    name: '晴空蓝',
    shades: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1' },
  },
  {
    id: 'emerald',
    name: '薄荷翠',
    shades: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857' },
  },
  {
    id: 'violet',
    name: '幻夜紫',
    shades: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
  },
  {
    id: 'rose',
    name: '晚樱粉',
    shades: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c' },
  },
  {
    id: 'amber',
    name: '麦浪金',
    shades: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
  },
]

export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_MODES: Array<{ id: ThemeMode; name: string }> = [
  { id: 'light', name: '浅色' },
  { id: 'dark', name: '深色' },
  { id: 'system', name: '跟随系统' },
]

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

let mediaBound = false
let lastArgs: { accent: string; glow: boolean; mode: ThemeMode } | null = null

function render(accentId: string, bgGlow: boolean, mode: ThemeMode): void {
  const preset = ACCENT_PRESETS.find((p) => p.id === accentId) ?? ACCENT_PRESETS[0]
  for (const shade of ACCENT_SHADES) {
    document.documentElement.style.setProperty(`--color-accent-${shade}`, preset.shades[shade])
  }
  document.documentElement.classList.toggle('dark', resolveDark(mode))
  document.documentElement.classList.toggle('bg-plain-off', !bgGlow)
}

export function applyTheme(accentId: string, bgGlow: boolean, mode: ThemeMode = 'light'): void {
  lastArgs = { accent: accentId, glow: bgGlow, mode }
  render(accentId, bgGlow, mode)

  // system 模式下监听系统明暗变化，即时跟随
  if (!mediaBound && typeof matchMedia !== 'undefined') {
    mediaBound = true
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (lastArgs) render(lastArgs.accent, lastArgs.glow, lastArgs.mode)
    })
  }
}
