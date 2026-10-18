<script setup lang="ts">
import { useRoute } from 'vue-router'
import PagePlaceholder from '../components/PagePlaceholder.vue'

const route = useRoute()
const sourceId = String(route.params.sourceId)
const animeId = String(route.params.animeId)
</script>

<template>
  <PagePlaceholder
    :title="`番剧详情（${sourceId} / ${animeId}）`"
    iteration="迭代 1 交付"
    :items="['封面、简介、标签与更新状态', '剧集列表', '跳转源站播放（MVP）；站内播放在迭代 3']"
  />
</template>
