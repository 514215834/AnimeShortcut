import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 部署在 GitHub Pages 仓库子路径：<user>.github.io/AnimeShortcut/
// 若改用用户根仓库（<user>.github.io），把 base 改为 '/'
export default defineConfig({
  base: '/AnimeShortcut/',
  plugins: [vue(), tailwindcss()],
})
