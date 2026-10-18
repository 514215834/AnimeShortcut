<script setup lang="ts">
import PagePlaceholder from '../components/PagePlaceholder.vue'
</script>

<template>
  <PagePlaceholder
    title="看板"
    iteration="迭代 1 交付"
    :items="['每周更新时间表（周一至周日分组，含未定档）', '最新更新流（上拉加载）', '订阅番剧的更新角标（迭代 2）']"
  />
</template>
