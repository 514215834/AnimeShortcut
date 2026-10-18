<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 6 })
</script>

<template>
  <div class="space-y-2.5">
    <div
      v-for="i in count"
      :key="i"
      class="flex items-center justify-between rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5"
    >
      <div class="animate-pulse space-y-1.5">
        <div class="h-3.5 w-40 rounded-full bg-gray-200/80" />
        <div class="h-3 w-24 rounded-full bg-gray-100/80" />
      </div>
      <div class="h-4 w-14 animate-pulse rounded-full bg-gray-100/80" />
    </div>
  </div>
</template>
