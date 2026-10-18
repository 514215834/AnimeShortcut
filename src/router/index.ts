import { createRouter, createWebHashHistory } from 'vue-router'
import BoardPage from '../pages/BoardPage.vue'
import SearchPage from '../pages/SearchPage.vue'
import AnimeDetailPage from '../pages/AnimeDetailPage.vue'
import SubscriptionsPage from '../pages/SubscriptionsPage.vue'
import HistoryPage from '../pages/HistoryPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'board', component: BoardPage },
    { path: '/search', name: 'search', component: SearchPage },
    { path: '/anime/:sourceId/:animeId', name: 'anime-detail', component: AnimeDetailPage },
    { path: '/subscriptions', name: 'subscriptions', component: SubscriptionsPage },
    { path: '/history', name: 'history', component: HistoryPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
