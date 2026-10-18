import { describe, expect, it } from 'vitest'
import { idbAll, idbDelete, idbGet, idbPut } from './idb'

interface Fake { key: string; v: number }

describe('idb 封装（Node 环境走内存回退）', () => {
  it('put/get/all/delete 全链路', async () => {
    await idbPut('subscriptions', { key: 'a:1', v: 1 } as Fake)
    await idbPut('subscriptions', { key: 'a:2', v: 2 } as Fake)
    expect((await idbGet<Fake>('subscriptions', 'a:1'))?.v).toBe(1)
    expect(await idbGet('subscriptions', 'nope')).toBeNull()
    expect(await idbAll<Fake>('subscriptions')).toHaveLength(2)
    await idbDelete('subscriptions', 'a:1')
    expect(await idbAll<Fake>('subscriptions')).toHaveLength(1)
  })

  it('不同 store 相互隔离', async () => {
    await idbPut('history', { key: 'h:1', v: 9 } as Fake)
    expect(await idbGet('subscriptions', 'h:1')).toBeNull()
    expect((await idbGet<Fake>('history', 'h:1'))?.v).toBe(9)
  })
})
