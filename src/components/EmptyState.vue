<script setup lang="ts">
defineProps<{ text: string; hint?: string }>()
</script>

<template>
  <div
    class="rounded-2xl border border-dashed border-gray-300/70 bg-white/50 dark:bg-white/5 p-10 text-center backdrop-blur"
  >
    <p class="text-sm text-ink-3">{{ text }}</p>
    <p v-if="hint" class="mt-1.5 text-xs text-ink-4">{{ hint }}</p>
  </div>
</template>
