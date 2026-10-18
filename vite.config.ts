import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 部署在 GitHub Pages 仓库子路径：<user>.github.io/AnimeShortcut/
// 若改用用户根仓库（<user>.github.io），把 base 改为 '/'
export default defineConfig({
  base: '/AnimeShortcut/',
  plugins: [vue(), tailwindcss()],
  // 本地开发的同源代理：开发时免部署 CORS 代理即可取到 agedm 真实数据
  server: {
    proxy: {
      '/agedm-api': {
        target: 'https://api.agedm.io',
        // 该站证书链 node 无法验证（node fetch 报 UNABLE_TO_GET_ISSUER_CERT_LOCALLY），
        // 本地开发代理关闭上游证书校验；生产走 Worker 代理不受影响
        secure: false,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/agedm-api/, '/v2'),
      },
    },
  },
})
