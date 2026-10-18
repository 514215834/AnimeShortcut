<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 8 })
</script>

<template>
  <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
    <div v-for="i in count" :key="i" class="animate-pulse">
      <div class="aspect-[3/4] w-full rounded-2xl border border-white/70 bg-white/70" />
      <div class="mt-2 h-3 w-4/5 rounded-full bg-white/90" />
    </div>
  </div>
</template>
