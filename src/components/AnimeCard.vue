<script setup lang="ts">
import type { AnimeSummary } from '../plugins/host/types'

defineProps<{ item: AnimeSummary }>()

function go(it: AnimeSummary): void {
  window.location.hash = `/anime/${it.sourceId ?? 'unknown'}/${it.animeId}`
}
</script>

<template>
  <button
    type="button"
    class="group block w-full rounded-2xl border border-white/70 bg-white/60 p-2 text-left shadow-[0_2px_10px_rgba(30,41,59,0.04)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-[0_8px_24px_rgba(79,70,229,0.14)]"
    @click="go(item)"
  >
    <div class="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gradient-to-br from-gray-100 to-gray-200">
      <img
        v-if="item.cover"
        :src="item.cover"
        :alt="item.title"
        referrerpolicy="no-referrer"
        loading="lazy"
        class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
      />
      <span
        v-if="item.latestEpisodeTitle"
        class="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm"
      >
        {{ item.latestEpisodeTitle }}
      </span>
    </div>
    <p class="mt-2 line-clamp-2 text-[13px] leading-snug text-gray-800">{{ item.title }}</p>
    <p class="mt-0.5 pb-0.5 text-[11px] text-gray-400">{{ item.sourceId }}</p>
  </button>
</template>
