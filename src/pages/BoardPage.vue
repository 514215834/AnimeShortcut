<script setup lang="ts">
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import { useBoardStore } from '../stores/board'
import { useSettingsStore } from '../stores/settings'
import { useUpdateStore } from '../stores/update'
import { useInfiniteScroll } from '../composables/useInfiniteScroll'
import AnimeCard from '../components/AnimeCard.vue'
import SkeletonGrid from '../components/SkeletonGrid.vue'
import ErrorState from '../components/ErrorState.vue'
import EmptyState from '../components/EmptyState.vue'

const board = useBoardStore()
const settings = useSettingsStore()
const updateStore = useUpdateStore()

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


/** 视图首次切换到时触发对应数据加载 */
function ensureViewData(): void {
  if (board.activeView === 'weekly' && Object.keys(board.weekly).length === 0 && !board.weeklyLoading) {
    void board.loadWeekly()
  }
  if (board.activeView === 'latest' && board.latestPage === 0 && !board.latestLoading) {
    void board.loadMoreLatest()
  }
}

watch(
  () => board.activeView,
  () => ensureViewData(),
)

onMounted(() => ensureViewData())

// 代理地址/数据源启停在设置页变更后，自动重新拉取两个视图
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
  <RouterLink
    v-if="updateStore.totalNew > 0"
    to="/subscriptions"
    class="mb-5 flex items-center gap-2 rounded-2xl border border-rose-100/90 bg-gradient-to-br from-rose-50/80 to-amber-50/50 dark:border-rose-500/20 dark:from-rose-500/10 dark:to-amber-500/10 px-4 py-3 text-[13px] text-rose-600 backdrop-blur transition hover:from-rose-100/70"
  >
    ⭐ 你的追番有 {{ updateStore.totalNew }} 集更新，去看看
    <span class="ml-auto">→</span>
  </RouterLink>

  <!-- 看板视图切换：每周更新 / 最新更新 -->
  <div class="mb-5 inline-flex items-center gap-1 rounded-full border border-line bg-white/50 dark:bg-white/5 p-1 backdrop-blur">
    <button
      type="button"
      class="rounded-full px-4 py-1.5 text-[13px] transition-all duration-200"
      :class="
        board.activeView === 'weekly'
          ? 'bg-accent-600 font-medium text-white shadow-sm'
          : 'text-ink-2 hover:bg-surface-2'
      "
      @click="board.activeView = 'weekly'"
    >
      🗓️ 每周更新
    </button>
    <button
      type="button"
      class="rounded-full px-4 py-1.5 text-[13px] transition-all duration-200"
      :class="
        board.activeView === 'latest'
          ? 'bg-accent-600 font-medium text-white shadow-sm'
          : 'text-ink-2 hover:bg-surface-2'
      "
      @click="board.activeView = 'latest'"
    >
      ⚡ 最新更新
    </button>
  </div>

  <!-- ============ 每周更新视图 ============ -->
  <section v-if="board.activeView === 'weekly'">
    <div class="mb-3 flex items-baseline justify-between">
      <h2 class="text-[15px] font-semibold text-ink-2">
        {{ dayLabels[board.activeDay >= 0 ? board.activeDay : 0] ?? '' }}{{ board.activeDay >= 0 ? '' : '未定档' }}更新
      </h2>
      <span class="text-xs text-ink-4">共 {{ currentList.length }} 部</span>
    </div>

    <SkeletonGrid v-if="board.weeklyLoading" :count="12" />
    <ErrorState
      v-else-if="board.weeklyError && Object.keys(board.weekly).length === 0"
      :message="board.weeklyError"
      hint="可到「设置」检查代理配置后重试"
      @retry="board.loadWeekly()"
    />
    <template v-else>
      <p v-if="board.weeklyError" class="mb-2 text-xs text-amber-600 dark:text-amber-400">{{ board.weeklyError }}</p>

      <!-- 分段式玻璃胶囊：周日~周六 + 未定档 -->
      <div
        class="mb-4 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-white/50 dark:bg-white/5 p-1 backdrop-blur"
      >
        <button
          v-for="t in dayTabs"
          :key="t.day"
          type="button"
          class="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition-all duration-200"
          :class="
            board.activeDay === t.day
              ? 'bg-accent-600 font-medium text-white shadow-sm'
              : 'text-ink-2 hover:bg-surface-2'
          "
          @click="board.activeDay = t.day"
        >
          {{ t.label }}
          <span class="ml-0.5 text-[10px]" :class="board.activeDay === t.day ? 'opacity-80' : 'text-ink-4'">
            {{ t.count }}
          </span>
        </button>
      </div>

      <EmptyState v-if="currentList.length === 0" text="这一天暂无更新记录" />
      <!-- 周更卡片网格（封面按番剧 ID 构造，加载失败自动回退占位） -->
      <div v-else class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        <AnimeCard v-for="it in currentList" :key="`${it.sourceId}:${it.animeId}`" :item="it" />
      </div>
    </template>
  </section>

  <!-- ============ 最新更新视图 ============ -->
  <section v-else>
    <div class="mb-3 flex items-baseline justify-between">
      <h2 class="text-[15px] font-semibold text-ink-2">最新更新</h2>
      <span class="text-xs text-ink-4">已收录 {{ board.latest.length }} 条</span>
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
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        <AnimeCard v-for="it in board.latest" :key="`${it.sourceId}:${it.animeId}`" :item="it" />
      </div>
      <div ref="sentinel" class="py-8 text-center text-xs text-ink-4">
        <template v-if="board.latestLoading">
          <span class="inline-flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400" />
            加载中…
          </span>
        </template>
        <template v-else-if="board.latestHasMore">
          <button
            type="button"
            class="rounded-full px-4 py-1.5 text-accent-500 transition hover:bg-accent-50/70"
            @click="board.loadMoreLatest()"
          >
            加载更多
          </button>
        </template>
        <template v-else>已经到底啦</template>
      </div>
    </template>
  </section>
</template>
