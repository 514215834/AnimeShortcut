<script setup lang="ts">
defineProps<{
  title: string
  iteration: string
  items: string[]
}>()
</script>

<template>
  <section
    class="rounded-2xl border border-white/70 bg-white/60 p-6 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
  >
    <div class="flex items-center gap-2.5">
      <h1 class="text-[15px] font-semibold text-gray-800">{{ title }}</h1>
      <span
        class="rounded-full border border-accent-100/80 bg-accent-50/80 px-2 py-0.5 text-[11px] text-accent-500"
      >
        {{ iteration }}
      </span>
    </div>
    <p class="mt-2 text-xs text-gray-400">按《功能迭代计划》逐期交付，规划内容：</p>
    <ul class="mt-3 space-y-1.5 text-[13px] text-gray-600">
      <li v-for="item in items" :key="item" class="flex gap-2">
        <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-300" />
        {{ item }}
      </li>
    </ul>
  </section>
</template>
