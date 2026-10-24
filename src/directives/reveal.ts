import type { Directive } from 'vue'

/**
 * 视口显现动画（v-reveal）：元素进入视口时以「淡入 + 上浮」显现，同帧进入视口的元素
 * 依序错峰（类似 ani.girigirilove 列表的动态加载效果）；视口外元素保持隐藏，
 * 配合图片 loading="lazy" 形成视口区域优先加载策略。
 * 尊重系统「减弱动态效果」设置；不支持 IntersectionObserver 的环境直接可见。
 */

const REVEAL_PENDING = 'reveal-pending'
const REVEAL_ANIM = 'reveal-anim'
const STEP_MS = 60
const MAX_STEPS = 8

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

// 同帧进入视口的元素共享一个错峰批次（rAF 边界重置计数），新追加入列表的批次自动从 0 起排
let burstCount = 0
let burstResetQueued = false

function nextDelayMs(): number {
  const delay = Math.min(burstCount, MAX_STEPS) * STEP_MS
  burstCount++
  if (!burstResetQueued && typeof requestAnimationFrame === 'function') {
    burstResetQueued = true
    requestAnimationFrame(() => {
      burstCount = 0
      burstResetQueued = false
    })
  }
  return delay
}

export const vReveal: Directive<HTMLElement> = {
  created(el) {
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') return
    el.classList.add(REVEAL_PENDING)
  },
  mounted(el) {
    if (!el.classList.contains(REVEAL_PENDING)) return
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      el.classList.remove(REVEAL_PENDING)
      el.style.animationDelay = `${nextDelayMs()}ms`
      el.classList.add(REVEAL_ANIM)
      const onEnd = (e: Event): void => {
        if (e.target !== el) return
        el.removeEventListener('animationend', onEnd)
        // 动画结束即还原：不残留 transform/opacity 类，避免与卡片的 hover 位移样式互相覆盖
        el.classList.remove(REVEAL_ANIM)
        el.style.animationDelay = ''
      }
      el.addEventListener('animationend', onEnd)
    })
    io.observe(el)
    ;(el as HTMLElement & { __revealIO?: IntersectionObserver }).__revealIO = io
  },
  unmounted(el) {
    ;(el as HTMLElement & { __revealIO?: IntersectionObserver }).__revealIO?.disconnect()
  },
}
