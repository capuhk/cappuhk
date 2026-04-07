import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute }    from 'workbox-routing'
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { initializeApp }        from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

// ─────────────────────────────────────────────
// Workbox 프리캐시 — Vite 빌드 시 __WB_MANIFEST 자동 주입
// ─────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST)

// ─────────────────────────────────────────────
// [1] Supabase REST API — NetworkOnly
//   캐시 없이 직접 네트워크 요청 — SW 개입 시 iOS Safari에서
//   AbortController 신호 전파 문제로 무한 스피닝 발생하므로 캐시 비활성화
// ─────────────────────────────────────────────
registerRoute(
  ({ url }) =>
    url.hostname.includes('supabase.co') &&
    url.pathname.startsWith('/rest/v1/'),
  new NetworkOnly(),
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
// FCM 초기화 — 백그라운드 푸시 수신
//   vite-plugin-pwa injectManifest 전략으로 빌드 시 환경변수 인라인
// ─────────────────────────────────────────────
const firebaseApp = initializeApp({
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
})

const messaging = getMessaging(firebaseApp)

// 백그라운드 메시지 수신 — 앱이 포그라운드가 아닐 때 FCM이 여기로 전달
onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title || payload.data?.title || '알림'
  const body  = payload.notification?.body  || payload.data?.body  || ''
  const url   = payload.data?.url || payload.fcmOptions?.link || '/'

  self.registration.showNotification(title, {
    body,
    icon:  '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data:  { url },
  })
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
