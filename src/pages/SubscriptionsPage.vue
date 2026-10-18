<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSubscriptionStore } from '../stores/subscription'
import { useUpdateStore } from '../stores/update'
import { runCheck } from '../services/updateChecker'
import EmptyState from '../components/EmptyState.vue'
import SkeletonList from '../components/SkeletonList.vue'
const subStore = useSubscriptionStore()
const update = useUpdateStore()

const sortMode = ref<'updated' | 'added'>('updated')
const statusFilter = ref<'all' | 'ongoing' | 'finished'>('all')

onMounted(() => {
  void subStore.load().then(() => runCheck(true)) // 进入订阅页强制检测一轮
})

const displayList = computed(() => {
  let list = [...subStore.subs]
  if (statusFilter.value !== 'all') {
    list = list.filter((s) => update.statuses[s.key] === statusFilter.value)
  }
  if (sortMode.value === 'updated') {
    list.sort((a, b) => {
      const ca = update.counts[a.key] ?? 0
      const cb = update.counts[b.key] ?? 0
      if (ca !== cb) return cb - ca
      return b.createdAt - a.createdAt
    })
  } else {
    list.sort((a, b) => b.createdAt - a.createdAt)
  }
  return list
})

const hasFailures = computed(() => update.consecutiveFailures >= 3)
</script>

<template>
  <div class="mx-auto w-full">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-[15px] font-semibold text-ink-2">
        我的追番
        <span v-if="update.totalNew > 0" class="ml-1.5 align-middle text-[11px] text-rose-500">
          {{ update.totalNew }} 集未看
        </span>
      </h2>
      <select
        v-model="sortMode"
        class="rounded-xl border border-line-2 bg-surface-3 px-2.5 py-1.5 text-xs outline-none focus:border-accent-300"
      >
        <option value="updated">有更新优先</option>
        <option value="added">按加入时间</option>
      </select>
    </div>

    <div class="mb-3 flex gap-1.5">
      <button
        v-for="f in [
          { v: 'all', label: '全部' },
          { v: 'ongoing', label: '连载中' },
          { v: 'finished', label: '已完结' },
        ]"
        :key="f.v"
        type="button"
        class="rounded-full border px-3 py-1 text-xs transition"
        :class="
          statusFilter === f.v
            ? 'border-accent-200 bg-accent-600 text-white'
            : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2'
        "
        @click="statusFilter = f.v as 'all' | 'ongoing' | 'finished'"
      >
        {{ f.label }}
      </button>
      <span v-if="update.checking" class="ml-auto self-center text-[11px] text-ink-4">检测更新中…</span>
    </div>

    <p v-if="hasFailures" class="mb-3 rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-600">
      更新检测连续失败，请到「设置」检查代理配置
    </p>

    <SkeletonList v-if="!subStore.loaded" :count="5" />
    <EmptyState
      v-else-if="displayList.length === 0"
      text="还没有订阅"
      hint="在番剧详情页点「☆ 追番」即可加入"
    />
    <ul
      v-else
      class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface backdrop-blur"
    >
      <li v-for="s in displayList" :key="s.key">
        <div class="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
          <img
            v-if="s.cover"
            :src="s.cover"
            :alt="s.title"
            referrerpolicy="no-referrer"
            loading="lazy"
            class="h-14 w-10 shrink-0 rounded-lg object-cover"
          />
          <RouterLink
            :to="`/anime/${s.sourceId}/${s.animeId}`"
            class="min-w-0 flex-1"
          >
            <p class="flex items-center gap-1.5 truncate text-[13.5px] font-medium text-ink">
              {{ s.title }}
              <span
                v-if="(update.counts[s.key] ?? 0) > 0"
                class="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] text-white"
              >
                +{{ update.counts[s.key] }}
              </span>
            </p>
            <p class="mt-0.5 truncate text-xs text-ink-4">
              最新：{{ update.latestTitles[s.key] ?? '待检测' }}
            </p>
          </RouterLink>
          <button
            type="button"
            class="shrink-0 rounded-full px-2.5 py-1 text-[11px] text-ink-4 transition hover:bg-rose-50 hover:text-rose-500"
            title="取消追番"
            @click="subStore.remove(s.key)"
          >
            ✕
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
