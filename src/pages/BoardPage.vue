<script setup lang="ts">
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import { useBoardStore } from '../stores/board'
import { useSettingsStore } from '../stores/settings'
import { useInfiniteScroll } from '../composables/useInfiniteScroll'
import AnimeCard from '../components/AnimeCard.vue'
import SkeletonGrid from '../components/SkeletonGrid.vue'
import SkeletonList from '../components/SkeletonList.vue'
import ErrorState from '../components/ErrorState.vue'
import EmptyState from '../components/EmptyState.vue'

const board = useBoardStore()

const sentinel = useTemplateRef<HTMLElement | null>('sentinel')
useInfiniteScroll(sentinel, () => void board.loadMoreLatest())

const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const dayTabs = computed(() => {
  const tabs: { day: number; label: string; count: number }[] = []
  for (let d = 0; d <= 6; d++) {
    tabs.push({ day: d, label: dayLabels[d] ?? String(d), count: board.weekly[d]?.length ?? 0 })
  }
  const unset = board.weekly.unset?.length ?? 0
  if (unset > 0) tabs.push({ day: -1, label: '未定档', count: unset })
  return tabs
})

const currentList = computed(() =>
  board.activeDay < 0 ? (board.weekly.unset ?? []) : (board.weekly[board.activeDay] ?? []),
)

const activeDayLabel = computed(
  () => (dayTabs.value.find((t) => t.day === board.activeDay)?.label ?? '') + '更新',
)

onMounted(() => {
  void board.loadWeekly()
  void board.loadMoreLatest()
})

// 代理地址/数据源启停在设置页变更后，回到看板自动重新拉取
const settings = useSettingsStore()
watch(
  () => settings.configRev,
  () => {
    board.resetLatest()
    void board.loadWeekly()
    void board.loadMoreLatest()
  },
)
</script>

<template>
  <section>
    <div class="mb-3 flex items-baseline justify-between">
      <h2 class="text-[15px] font-semibold text-gray-700">每周更新时间表</h2>
      <span class="text-xs text-gray-400">{{ activeDayLabel }}</span>
    </div>

    <SkeletonList v-if="board.weeklyLoading" :count="6" />
    <ErrorState
      v-else-if="board.weeklyError && Object.keys(board.weekly).length === 0"
      :message="board.weeklyError"
      hint="可到「设置」检查代理配置后重试"
      @retry="board.loadWeekly()"
    />
    <template v-else>
      <p v-if="board.weeklyError" class="mb-2 text-xs text-amber-600">{{ board.weeklyError }}</p>

      <!-- 分段式玻璃胶囊：周一~周日 + 未定档 -->
      <div
        class="mb-3 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/70 bg-white/50 p-1 backdrop-blur"
      >
        <button
          v-for="t in dayTabs"
          :key="t.day"
          type="button"
          class="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition-all duration-200"
          :class="
            board.activeDay === t.day
              ? 'bg-indigo-600 font-medium text-white shadow-sm'
              : 'text-gray-600 hover:bg-white/80'
          "
          @click="board.activeDay = t.day"
        >
          {{ t.label }}
          <span class="ml-0.5 text-[10px]" :class="board.activeDay === t.day ? 'opacity-80' : 'text-gray-400'">
            {{ t.count }}
          </span>
        </button>
      </div>

      <EmptyState v-if="currentList.length === 0" text="这一天暂无更新记录" />
      <ul
        v-else
        class="divide-y divide-white/70 overflow-hidden rounded-2xl border border-white/70 bg-white/60 backdrop-blur"
      >
        <li v-for="it in currentList" :key="`${it.sourceId}:${it.animeId}`">
          <RouterLink
            :to="`/anime/${it.sourceId}/${it.animeId}`"
            class="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/80"
          >
            <div class="min-w-0">
              <p class="truncate text-[13.5px] font-medium text-gray-800">{{ it.title }}</p>
              <p class="mt-0.5 truncate text-xs text-gray-400">
                {{ it.latestEpisodeTitle ?? '暂无更新信息' }}
              </p>
            </div>
            <span
              class="shrink-0 rounded-full bg-indigo-50/90 px-2 py-0.5 text-[10px] text-indigo-500"
            >
              {{ it.sourceId }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>

  <section class="mt-9">
    <div class="mb-3 flex items-baseline justify-between">
      <h2 class="text-[15px] font-semibold text-gray-700">最新更新</h2>
      <span class="text-xs text-gray-400">已收录 {{ board.latest.length }} 条</span>
    </div>

    <SkeletonGrid v-if="board.latestPage === 0 && board.latestLoading" :count="12" />
    <ErrorState
      v-else-if="board.latestError && board.latest.length === 0"
      :message="board.latestError"
      hint="可到「设置」检查代理配置后重试"
      @retry="board.loadMoreLatest()"
    />
    <EmptyState v-else-if="board.latestEmpty" text="没有拉到更新数据" hint="请检查代理设置" />
    <template v-else>
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        <AnimeCard v-for="it in board.latest" :key="`${it.sourceId}:${it.animeId}`" :item="it" />
      </div>
      <div ref="sentinel" class="py-8 text-center text-xs text-gray-400">
        <template v-if="board.latestLoading">
          <span class="inline-flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
            加载中…
          </span>
        </template>
        <template v-else-if="board.latestHasMore">
          <button type="button" class="rounded-full px-4 py-1.5 text-indigo-500 transition hover:bg-indigo-50/70" @click="board.loadMoreLatest()">
            加载更多
          </button>
        </template>
        <template v-else>已经到底啦</template>
      </div>
    </template>
  </section>
</template>
