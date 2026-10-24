import { onUnmounted, watch, type Ref } from 'vue'

/**
 * 感应目标元素进入视口时触发回调（用于上拉加载更多）。
 * 返回 recheck：加载完成后若 sentinel 仍在视口内（宽屏短页），IntersectionObserver
 * 不会因「持续相交」再次触发——unobserve + observe 强制重报当前相交状态以续载。
 */
export function useInfiniteScroll(
  target: Ref<HTMLElement | null>,
  onHit: () => void,
): { recheck: () => void } {
  let io: IntersectionObserver | null = null

  function attach(el: HTMLElement | null): void {
    io?.disconnect()
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) onHit()
        },
        { rootMargin: '400px 0px' },
      )
      io.observe(el)
    }
  }

  function recheck(): void {
    const el = target.value
    if (!el || !io) return
    io.unobserve(el)
    io.observe(el)
  }

  watch(target, (el) => attach(el), { immediate: true })
  onUnmounted(() => {
    io?.disconnect()
    io = null
  })

  return { recheck }
}
