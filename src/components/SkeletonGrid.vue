<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 8 })
</script>

<template>
  <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
    <div v-for="i in count" :key="i" class="animate-pulse">
      <div class="aspect-[3/4] w-full rounded-lg bg-gray-200" />
      <div class="mt-2 h-3 w-4/5 rounded bg-gray-200" />
    </div>
  </div>
</template>
