import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Tailwind CSS v4 Vite 플러그인
    tailwindcss(),
    // PWA 설정 — injectManifest 전략 (커스텀 SW로 푸시 알림 처리)
    VitePWA({
      strategies:   'injectManifest',  // 커스텀 SW 파일 사용
      srcDir:       'src',
      filename:     'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name:             '하우스키핑 v3',
        short_name:       'HK3',
        description:      '호텔 하우스키핑 업무 관리 앱',
        theme_color:      '#1a1a2e',
        background_color: '#1a1a2e',
        display:          'standalone',
        orientation:      'portrait',
        start_url:        '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      // injectManifest 전략에서 SW 빌드 옵션
      injectManifest: {
        // workbox-routing, workbox-strategies를 sw.js 런타임 캐싱에서 사용
        rollupOptions: {},
      },
      devOptions: {
        // 개발 환경에서 SW 활성화 (푸시 알림 테스트 가능)
        enabled:   true,
        type:      'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    // @ 경로 별칭 (shadcn/ui 컴포넌트 경로에 사용)
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
