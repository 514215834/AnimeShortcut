<script setup lang="ts">
import { useUpdateStore } from './stores/update'

const tabs = [
  { to: '/', label: '看板', icon: '🗓️' },
  { to: '/search', label: '搜索', icon: '🔍' },
  { to: '/subscriptions', label: '订阅', icon: '⭐' },
  { to: '/history', label: '历史', icon: '🕘' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

const updateStore = useUpdateStore()
</script>

<template>
  <div class="page-bg flex min-h-dvh flex-col text-gray-900">
    <header
      class="sticky top-0 z-40 border-b border-white/50 bg-white/60 shadow-[0_1px_16px_rgba(30,41,59,0.06)] backdrop-blur-xl"
    >
      <div class="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6">
        <RouterLink to="/" class="flex shrink-0 items-center gap-2.5">
          <span
            class="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 text-sm shadow-sm"
          >
            📺
          </span>
          <span class="text-[15px] font-semibold tracking-wide">动漫更新看板</span>
        </RouterLink>

        <!-- 桌面端：玻璃胶囊导航 -->
        <nav class="hidden items-center gap-1 rounded-full border border-white/70 bg-white/50 p-1 backdrop-blur sm:flex">
          <RouterLink
            v-for="t in tabs"
            :key="t.to"
            :to="t.to"
            class="relative rounded-full px-3.5 py-1.5 text-sm text-gray-600 transition hover:text-gray-900"
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
          class="rounded-full border border-white/70 bg-white/60 px-2.5 py-1 text-[11px] text-gray-400 backdrop-blur sm:hidden"
        >
          MVP
        </span>
      </div>
    </header>

    <main class="w-full flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pb-8">
      <RouterView />
    </main>

    <!-- 移动端：毛玻璃底部导航 -->
    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-white/50 bg-white/70 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
    >
      <div class="grid w-full grid-cols-5">
        <RouterLink
          v-for="t in tabs"
          :key="t.to"
          :to="t.to"
          class="relative flex flex-col items-center gap-0.5 py-2 text-[10px] text-gray-500 transition"
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

    <footer class="hidden pb-5 text-center text-[11px] text-gray-400/90 sm:block">
      纯前端聚合工具：仅展示各数据源公开信息并跳转官方页面，不存储任何视频内容。
    </footer>
  </div>
</template>
