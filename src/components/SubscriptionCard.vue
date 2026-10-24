<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Subscription } from '../core/storage/schema'
import { useUpdateStore } from '../stores/update'
import { vReveal } from '../directives/reveal'

const props = defineProps<{ sub: Subscription }>()
defineEmits<{ remove: [] }>()

const update = useUpdateStore()

const newCount = computed(() => update.counts[props.sub.key] ?? 0)
const latestTitle = computed(() => update.latestTitles[props.sub.key] ?? '待检测')
const status = computed(() => update.statuses[props.sub.key] ?? 'unknown')
const statusLabel = computed(() => ({ ongoing: '连载中', finished: '完结', unknown: '' })[status.value] ?? '')
const failed = ref(false)
const imgFailed = computed(() => failed.value)

function open(): void {
  window.location.hash = `/anime/${props.sub.sourceId}/${props.sub.animeId}`
}
</script>

<template>
  <div v-reveal class="group relative">
    <button
      type="button"
      class="block w-full rounded-2xl border border-line bg-surface p-2 text-left shadow-[0_2px_10px_rgba(30,41,59,0.04)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 hover:shadow-[0_8px_24px_rgba(30,41,59,0.12)]"
      @click="open"
    >
      <div class="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-white/5 dark:to-white/10">
        <img
          v-if="sub.cover && !imgFailed"
          :src="sub.cover"
          :alt="sub.title"
          referrerpolicy="no-referrer"
          loading="lazy"
          class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          @error="failed = true"
        />
        <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-100/70 to-accent-200/50 p-2 dark:from-accent-500/15 dark:to-accent-400/10">
          <span class="line-clamp-3 text-center text-xs text-accent-600/80 dark:text-accent-300">{{ sub.title }}</span>
        </div>
        <!-- 最新一集（检测后展示） -->
        <span class="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
          {{ latestTitle }}
        </span>
      </div>
      <p class="mt-2 line-clamp-2 text-[13px] leading-snug text-ink">
        <span
          v-if="newCount > 0"
          class="mr-1 inline-block translate-y-[-1px] rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] text-white"
        >
          +{{ newCount }}
        </span>
        {{ sub.title }}
      </p>
      <p class="mt-0.5 pb-0.5 text-[11px] text-ink-4">
        {{ sub.sourceId }}<template v-if="statusLabel"> · {{ statusLabel }}</template>
      </p>
    </button>
    <!-- 取消追番（悬浮在封面右上；触屏设备常显） -->
    <button
      type="button"
      class="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-[11px] text-white backdrop-blur-sm transition hover:bg-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
      title="取消追番"
      @click.stop="$emit('remove')"
    >
      ✕
    </button>
  </div>
</template>
