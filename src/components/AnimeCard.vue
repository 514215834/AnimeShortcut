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
    class="group block w-full text-left"
    @click="go(item)"
  >
    <div class="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-gray-200">
      <img
        v-if="item.cover"
        :src="item.cover"
        :alt="item.title"
        referrerpolicy="no-referrer"
        loading="lazy"
        class="h-full w-full object-cover transition group-hover:opacity-90"
      />
      <span
        v-if="item.latestEpisodeTitle"
        class="absolute bottom-1 left-1 max-w-full truncate rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white"
      >
        {{ item.latestEpisodeTitle }}
      </span>
    </div>
    <p class="mt-1.5 line-clamp-2 text-sm leading-snug text-gray-800">{{ item.title }}</p>
    <p v-if="item.sourceId" class="mt-0.5 text-[11px] text-gray-400">{{ item.sourceId }}</p>
  </button>
</template>
