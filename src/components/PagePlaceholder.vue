<script setup lang="ts">
defineProps<{
  title: string
  iteration: string
  items: string[]
}>()
</script>

<template>
  <section class="rounded-xl border border-dashed border-gray-300 bg-white p-6">
    <div class="flex items-center gap-2">
      <h1 class="text-lg font-semibold">{{ title }}</h1>
      <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">{{ iteration }}</span>
    </div>
    <p class="mt-2 text-sm text-gray-500">迭代 0 的路由占位，功能按《功能迭代计划》逐期交付：</p>
    <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
      <li v-for="item in items" :key="item">{{ item }}</li>
    </ul>
  </section>
</template>
