import { initializeApp } from 'firebase/app'
import { getMessaging } from 'firebase/messaging'

// ─────────────────────────────────────────────
// Firebase 앱 초기화 — .env.local 값 사용
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseApp = initializeApp(firebaseConfig)

// messaging 인스턴스 — 브라우저 컨텍스트에서만 사용 (SW는 별도 초기화)
// 지연 초기화로 SSR/SW 환경에서 충돌 방지
let _messaging = null
export const getFirebaseMessaging = () => {
  if (!_messaging) {
    _messaging = getMessaging(firebaseApp)
  }
  return _messaging
}
