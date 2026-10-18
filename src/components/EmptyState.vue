<script setup lang="ts">
defineProps<{ text: string; hint?: string }>()
</script>

<template>
  <div class="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
    <p class="text-sm text-gray-500">{{ text }}</p>
    <p v-if="hint" class="mt-1 text-xs text-gray-400">{{ hint }}</p>
  </div>
</template>
