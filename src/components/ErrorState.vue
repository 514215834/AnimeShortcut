<script setup lang="ts">
defineProps<{ message: string; hint?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="rounded-xl border border-red-100 bg-red-50/60 p-6 text-center">
    <p class="text-sm font-medium text-red-600">{{ message || '加载失败，请稍后重试' }}</p>
    <p v-if="hint" class="mt-1 text-xs text-red-400">{{ hint }}</p>
    <button
      type="button"
      class="mt-3 rounded-lg bg-red-500 px-4 py-1.5 text-sm text-white active:opacity-80"
      @click="$emit('retry')"
    >
      重试
    </button>
  </div>
</template>
