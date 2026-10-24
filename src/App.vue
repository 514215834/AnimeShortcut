<script setup lang="ts">
import { useUpdateStore } from './stores/update'

const tabs = [
  { to: '/', label: '看板', icon: '🗓️' },
  { to: '/catalog', label: '分类', icon: '🗂️' },
  { to: '/rank', label: '榜单', icon: '🏆' },
  { to: '/search', label: '搜索', icon: '🔍' },
  { to: '/subscriptions', label: '订阅', icon: '⭐' },
  { to: '/history', label: '历史', icon: '🕘' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

const updateStore = useUpdateStore()
</script>

<template>
  <div class="page-bg flex min-h-dvh flex-col text-ink">
    <header
      class="sticky top-0 z-40 border-b border-line bg-surface shadow-[0_1px_16px_rgba(30,41,59,0.06)] backdrop-blur-xl"
    >
      <div class="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6">
        <RouterLink to="/" class="shrink-0 text-[15px] font-semibold tracking-wide">
          动漫更新看板
        </RouterLink>

        <!-- 桌面端：玻璃胶囊导航 -->
        <nav class="hidden items-center gap-1 rounded-full border border-line bg-white/50 dark:bg-white/5 p-1 backdrop-blur sm:flex">
          <RouterLink
            v-for="t in tabs"
            :key="t.to"
            :to="t.to"
            class="relative rounded-full px-3.5 py-1.5 text-sm text-ink-2 transition hover:text-ink"
            exact-active-class="bg-accent-600 font-medium text-white shadow-sm hover:text-white"
          >
            {{ t.label }}
            <span
              v-if="t.to === '/subscriptions' && updateStore.totalNew > 0"
              class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] text-white"
            >
              {{ updateStore.totalNew }}
            </span>
          </RouterLink>
        </nav>

        <span
          class="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-4 backdrop-blur sm:hidden"
        >
          MVP
        </span>
      </div>
    </header>

    <main class="w-full flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pb-8">
      <!-- KeepAlive：分类/榜单/搜索列表状态在切页间保留（源变化由各页 watch 处理）；
           详情/播放页依赖路由参数必须重挂载，故不缓存 -->
      <RouterView v-slot="{ Component }">
        <KeepAlive include="CatalogPage,RankPage,SearchPage">
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>

    <!-- 移动端：毛玻璃底部导航 -->
    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
    >
      <div class="grid w-full grid-cols-7">
        <RouterLink
          v-for="t in tabs"
          :key="t.to"
          :to="t.to"
          class="relative flex flex-col items-center gap-0.5 py-2 text-[10px] text-ink-3 transition"
          exact-active-class="text-accent-600"
        >
          <span class="relative text-base leading-none">
            {{ t.icon }}
            <span
              v-if="t.to === '/subscriptions' && updateStore.totalNew > 0"
              class="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] text-white"
            >
              {{ updateStore.totalNew }}
            </span>
          </span>
          {{ t.label }}
        </RouterLink>
      </div>
    </nav>

    <footer class="hidden pb-5 text-center text-[11px] text-ink-4/90 sm:block">
      纯前端聚合工具：仅展示各数据源公开信息并跳转官方页面，不存储任何视频内容。
    </footer>
  </div>
</template>
