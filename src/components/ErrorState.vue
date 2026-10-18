<script setup lang="ts">
defineProps<{ message: string; hint?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    class="rounded-2xl border border-rose-100/80 bg-rose-50/50 p-8 text-center shadow-[0_2px_10px_rgba(244,63,94,0.05)] backdrop-blur"
  >
    <p class="text-sm font-medium text-rose-600">{{ message || '加载失败，请稍后重试' }}</p>
    <p v-if="hint" class="mt-1.5 text-xs text-rose-400/90">{{ hint }}</p>
    <button
      type="button"
      class="mt-4 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 px-5 py-1.5 text-sm text-white shadow-sm transition active:opacity-80"
      @click="$emit('retry')"
    >
      重试
    </button>
  </div>
</template>
