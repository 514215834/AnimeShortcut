<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 6 })
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="i in count"
      :key="i"
      class="flex items-center justify-between rounded-lg bg-white px-3 py-3"
    >
      <div class="animate-pulse">
        <div class="h-3.5 w-40 rounded bg-gray-200" />
        <div class="mt-1.5 h-3 w-24 rounded bg-gray-100" />
      </div>
      <div class="h-3 w-16 animate-pulse rounded bg-gray-100" />
    </div>
  </div>
</template>
