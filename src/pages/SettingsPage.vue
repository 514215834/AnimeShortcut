<script setup lang="ts">
import PagePlaceholder from '../components/PagePlaceholder.vue'
</script>

<template>
  <PagePlaceholder
    title="设置"
    iteration="迭代 1 起交付"
    :items="['自部署代理（Cloudflare Worker）地址', '更新检测频率与通知开关', '数据源启停（迭代 3 插件管理）', '数据备份导入导出（迭代 4）']"
  />
</template>
