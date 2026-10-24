<script setup lang="ts">
import { ref } from 'vue'
import type { AnimeSummary } from '../plugins/host/types'
import { vReveal } from '../directives/reveal'

defineProps<{ item: AnimeSummary; /** 归并后的来源列表（多源同名时 >1，展示徽标） */ sourceIds?: string[] }>()

const imgFailed = ref(false)

function go(it: AnimeSummary): void {
  window.location.hash = `/anime/${it.sourceId ?? 'unknown'}/${it.animeId}`
}
</script>

<template>
  <button
    v-reveal
    type="button"
    class="group block w-full rounded-2xl border border-line bg-surface p-2 text-left shadow-[0_2px_10px_rgba(30,41,59,0.04)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 hover:shadow-[0_8px_24px_rgba(30,41,59,0.12)]"
    @click="go(item)"
  >
    <div class="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gradient-to-br from-gray-100 to-gray-200">
      <img
        v-if="item.cover && !imgFailed"
        :src="item.cover"
        :alt="item.title"
        referrerpolicy="no-referrer"
        loading="lazy"
        decoding="async"
        class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
        @error="imgFailed = true"
      />
      <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-100/70 to-accent-200/50 dark:from-accent-500/15 dark:to-accent-400/10 p-2">
        <span class="line-clamp-3 text-center text-xs text-accent-600/80 dark:text-accent-300">{{ item.title }}</span>
      </div>
      <span
        v-if="item.latestEpisodeTitle"
        class="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm"
      >
        {{ item.latestEpisodeTitle }}
      </span>
      <span
        v-if="sourceIds && sourceIds.length > 1"
        class="absolute right-1.5 top-1.5 rounded-full bg-accent-600/90 px-1.5 py-0.5 text-[10px] text-white shadow-sm backdrop-blur-sm"
        :title="`共 ${sourceIds.length} 个来源`"
      >
        {{ sourceIds.length }}源
      </span>
    </div>
    <p class="mt-2 line-clamp-2 text-[13px] leading-snug text-ink">{{ item.title }}</p>
    <p class="mt-0.5 pb-0.5 truncate text-[11px] text-ink-4">
      {{ sourceIds && sourceIds.length > 1 ? sourceIds.join(' · ') : item.sourceId }}
    </p>
  </button>
</template>
