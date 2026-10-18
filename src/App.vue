<script setup lang="ts">
const tabs = [
  { to: '/', label: '看板' },
  { to: '/search', label: '搜索' },
  { to: '/subscriptions', label: '订阅' },
  { to: '/history', label: '历史' },
  { to: '/settings', label: '设置' },
]
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-gray-50 text-gray-900">
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div class="mx-auto flex h-12 w-full max-w-5xl items-center justify-between px-4">
        <RouterLink to="/" class="flex items-center gap-2 font-semibold">
          <span class="text-indigo-600">📺</span>
          <span>动漫更新看板</span>
        </RouterLink>
        <span class="text-xs text-gray-400">MVP · v0.1</span>
      </div>
      <nav class="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 text-sm">
        <RouterLink
          v-for="t in tabs"
          :key="t.to"
          :to="t.to"
          class="shrink-0 border-b-2 border-transparent px-3 py-2 text-gray-500 hover:text-gray-900"
          exact-active-class="border-indigo-600 font-medium text-indigo-600"
        >
          {{ t.label }}
        </RouterLink>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <RouterView />
    </main>

    <footer class="mx-auto w-full max-w-5xl px-4 py-4 text-xs text-gray-400">
      纯前端聚合工具：仅展示各数据源公开信息并跳转官方页面，不存储任何视频内容。
    </footer>
  </div>
</template>
