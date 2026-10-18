import { onUnmounted, watch, type Ref } from 'vue'

/** 感应目标元素进入视口时触发回调（用于上拉加载更多） */
export function useInfiniteScroll(target: Ref<HTMLElement | null>, onHit: () => void): void {
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

  watch(target, (el) => attach(el), { immediate: true })
  onUnmounted(() => {
    io?.disconnect()
    io = null
  })
}
