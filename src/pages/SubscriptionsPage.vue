<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSubscriptionStore } from '../stores/subscription'
import { useUpdateStore } from '../stores/update'
import { runCheck } from '../services/updateChecker'
import SubscriptionCard from '../components/SubscriptionCard.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonGrid from '../components/SkeletonGrid.vue'

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
  <div class="mb-3 flex items-center justify-between gap-3">
    <h2 class="text-[15px] font-semibold text-ink-2">
      我的追番
      <span v-if="update.totalNew > 0" class="ml-1.5 align-middle text-[11px] text-rose-500">
        {{ update.totalNew }} 集未看
      </span>
    </h2>
    <div class="flex items-center gap-2">
      <div class="flex gap-1.5">
        <button
          v-for="f in [
            { v: 'all', label: '全部' },
            { v: 'ongoing', label: '连载中' },
            { v: 'finished', label: '完结' },
          ]"
          :key="f.v"
          type="button"
          class="rounded-full border px-2.5 py-1 text-xs transition"
          :class="
            statusFilter === f.v
              ? 'border-transparent bg-accent-600 text-white'
              : 'border-transparent bg-white/60 text-ink-2 hover:bg-surface-2 dark:bg-white/5'
          "
          @click="statusFilter = f.v as 'all' | 'ongoing' | 'finished'"
        >
          {{ f.label }}
        </button>
      </div>
      <select
        v-model="sortMode"
        class="rounded-xl border border-line-2 bg-surface-3 px-2 py-1.5 text-xs outline-none focus:border-accent-300"
      >
        <option value="updated">有更新优先</option>
        <option value="added">按加入时间</option>
      </select>
    </div>
  </div>

  <p v-if="hasFailures" class="mb-3 rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
    更新检测连续失败，请到「设置」检查代理配置
  </p>
  <span v-if="update.checking" class="mb-3 block text-[11px] text-ink-4">检测更新中…</span>

  <SkeletonGrid v-if="!subStore.loaded" :count="8" />
  <EmptyState
    v-else-if="displayList.length === 0"
    text="还没有订阅"
    hint="在番剧详情页点「☆ 追番」即可加入"
  />
  <!-- 订阅卡片网格 -->
  <div v-else class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
    <SubscriptionCard
      v-for="s in displayList"
      :key="s.key"
      :sub="s"
      @remove="subStore.remove(s.key)"
    />
  </div>
</template>
