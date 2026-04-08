import { initializeApp } from 'firebase/app'
import { getMessaging } from 'firebase/messaging'

// ─────────────────────────────────────────────
// Firebase 앱 초기화 — .env.local 값 사용
// ─────────────────────────────────────────────
// Firebase 공개 설정값 — 클라이언트 번들에 포함되는 값이므로 하드코딩 무방
const firebaseConfig = {
  apiKey:            'AIzaSyBRQ3ec21jUW8s3MJWGJKq7_EZxbXPii0o',
  authDomain:        'hk-fcm.firebaseapp.com',
  projectId:         'hk-fcm',
  storageBucket:     'hk-fcm.firebasestorage.app',
  messagingSenderId: '345097497214',
  appId:             '1:345097497214:web:c23c0c76cccd9e070f462f',
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
