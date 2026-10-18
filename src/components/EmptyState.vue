<script setup lang="ts">
defineProps<{ text: string; hint?: string }>()
</script>

<template>
  <div
    class="rounded-2xl border border-dashed border-gray-300/70 bg-white/50 p-10 text-center backdrop-blur"
  >
    <p class="text-sm text-gray-500">{{ text }}</p>
    <p v-if="hint" class="mt-1.5 text-xs text-gray-400">{{ hint }}</p>
  </div>
</template>
