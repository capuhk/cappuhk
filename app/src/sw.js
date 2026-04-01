import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute }    from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

// ─────────────────────────────────────────────
// Workbox 프리캐시 — Vite 빌드 시 __WB_MANIFEST 자동 주입
// ─────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST)

// ─────────────────────────────────────────────
// [1] Supabase REST API — NetworkFirst
//   네트워크 응답 우선, 3초 내 무응답 시 캐시로 대체 (오프라인 대응)
// ─────────────────────────────────────────────
registerRoute(
  ({ url }) =>
    url.hostname.includes('supabase.co') &&
    url.pathname.startsWith('/rest/v1/'),
  new NetworkFirst({
    cacheName:            'supabase-api-cache',
    networkTimeoutSeconds: 3,
  }),
)

// ─────────────────────────────────────────────
// [2] Supabase Storage 이미지 — StaleWhileRevalidate
//   캐시를 즉시 반환하고 백그라운드에서 최신본으로 갱신 (SWR)
// ─────────────────────────────────────────────
registerRoute(
  ({ url }) =>
    url.hostname.includes('supabase.co') &&
    url.pathname.includes('/storage/v1/'),
  new StaleWhileRevalidate({
    cacheName: 'supabase-image-cache',
  }),
)

// ─────────────────────────────────────────────
// 푸시 알림 수신 — Web Push API
//   tag를 사용하지 않아 알림이 덮어씌워지지 않고 차곡차곡 쌓임
// ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  const { title, body, url } = event.data.json()

  event.waitUntil(
    self.registration.showNotification(title, {
      body:  body  || '',
      icon:  '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data:  { url: url || '/' },
      // tag 없음 — 알림마다 별도 표시 (카카오톡처럼 쌓임)
    }),
  )
})

// ─────────────────────────────────────────────
// 알림 클릭 → 앱 내 해당 경로로 이동
// ─────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 이미 열린 탭이 있으면 포커스 후 이동
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          client.navigate(targetUrl)
          return
        }
      }
      // 열린 탭 없으면 새 탭 열기
      return clients.openWindow(targetUrl)
    }),
  )
})
