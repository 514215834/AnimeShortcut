// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, withDirectives, type Directive } from 'vue'
import { vReveal } from './reveal'

/**
 * 回归背景：指令 created 钩子先于模板 class 应用（mountElement 先 invoke created 后
 * hostPatchProp），在 created 里加的 reveal-pending 被 patchClass 整体覆写抹掉，
 * mounted 里 contains 检查失败 → IntersectionObserver 永不建立 → 动画完全无效。
 * 修复后 pending 类与观察器都在 mounted 里建立。
 */

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed: Element[] = []
  disconnected = false
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element): void {
    this.observed.push(el)
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

async function mountCard(reducedMotion: boolean): Promise<{ el: HTMLElement; unmount: () => Promise<void> }> {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: reducedMotion }))
  const host = document.createElement('div')
  document.body.appendChild(host)
  const Comp = defineComponent({
    setup() {
      return () =>
        withDirectives(
          h('button', { class: 'card-static', type: 'button' }, 'x'),
          [[vReveal as Directive<HTMLElement>]],
        )
    },
  })
  const app = createApp(Comp)
  app.mount(host)
  await nextTick() // 指令 mounted 钩子在 post 渲染队列（微任务），须等 flush
  const el = host.querySelector('button') as HTMLElement
  return { el, unmount: async () => { app.unmount(); await nextTick() } }
}

function intersected(el: HTMLElement, isIntersecting: boolean): IntersectionObserverEntry {
  return { isIntersecting, target: el } as unknown as IntersectionObserverEntry
}

describe('v-reveal 视口显现指令', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as unknown as typeof IntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('挂载后带 reveal-pending 且被观察（created 钩子覆写回归）', async () => {
    const { el } = await mountCard(false)
    expect(el.className).toContain('card-static') // 模板 class 正常应用
    expect(el.className).toContain('reveal-pending') // 指令类不被覆写（旧实现此处失败）
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
    expect(FakeIntersectionObserver.instances[0]!.observed).toEqual([el])
  })

  it('进入视口切动画类并错峰，动画结束后清理还原', async () => {
    const { el } = await mountCard(false)
    const io = FakeIntersectionObserver.instances[0]!
    io.callback([intersected(el, true)], io as unknown as IntersectionObserver)
    expect(el.className).toContain('reveal-anim')
    expect(el.className).not.toContain('reveal-pending')
    expect(el.style.animationDelay.endsWith('ms')).toBe(true)
    el.dispatchEvent(new Event('animationend'))
    expect(el.className).not.toContain('reveal-anim')
    expect(el.style.animationDelay).toBe('')
  })

  it('prefers-reduced-motion 时不隐藏不观察', async () => {
    const { el } = await mountCard(true)
    expect(el.className).not.toContain('reveal-pending')
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
  })

  it('未进入视口保持隐藏；卸载时断开观察器', async () => {
    const { el, unmount } = await mountCard(false)
    const io = FakeIntersectionObserver.instances[0]!
    io.callback([intersected(el, false)], io as unknown as IntersectionObserver)
    expect(el.className).toContain('reveal-pending')
    await unmount()
    expect(io.disconnected).toBe(true)
  })
})
