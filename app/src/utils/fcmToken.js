import { getToken, deleteToken } from 'firebase/messaging'
import { getFirebaseMessaging } from '../lib/firebase'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// FCM 토큰 관리 — VAPID pushSubscription.js 대체
//
// push_subscriptions (VAPID) 대신 fcm_tokens 테이블 사용
// ─────────────────────────────────────────────

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY

// ── 현재 FCM 구독 상태 반환 ───────────────────
//   'unsupported' — 브라우저 미지원
//   'denied'      — 알림 권한 거부
//   'subscribed'  — DB에 토큰 존재
//   'unsubscribed'— 지원하지만 미구독
export const getFcmStatus = async (userId) => {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'

  try {
    const { data } = await supabase
      .from('fcm_tokens')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
    return data?.length > 0 ? 'subscribed' : 'unsubscribed'
  } catch {
    return 'unsubscribed'
  }
}

// ── FCM 토큰 발급 + DB 저장 ───────────────────
export const subscribeFcm = async (userId) => {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('알림 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.')
  }

  const registration = await navigator.serviceWorker.ready
  const messaging    = getFirebaseMessaging()

  const token = await getToken(messaging, {
    vapidKey:                  VAPID_KEY,
    serviceWorkerRegistration: registration,
  })
  if (!token) throw new Error('FCM 토큰 발급에 실패했습니다.')

  const deviceName = navigator.userAgent.includes('iPhone')  ? 'iPhone'
                   : navigator.userAgent.includes('Android') ? 'Android'
                   : 'PC'

  // 같은 user_id + token 이면 덮어쓰기 (중복 등록 방지)
  const { error } = await supabase
    .from('fcm_tokens')
    .upsert(
      { user_id: userId, token, device_name: deviceName },
      { onConflict: 'user_id,token' },
    )
  if (error) throw error

  return true
}

// ── FCM 토큰 삭제 + DB 제거 ───────────────────
export const unsubscribeFcm = async (userId) => {
  try {
    const registration = await navigator.serviceWorker.ready
    const messaging    = getFirebaseMessaging()

    const token = await getToken(messaging, {
      vapidKey:                  VAPID_KEY,
      serviceWorkerRegistration: registration,
    })

    if (token) {
      await deleteToken(messaging)
      await supabase
        .from('fcm_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('token', token)
    }
  } catch {
    throw new Error('구독 해제 중 오류가 발생했습니다.')
  }
}
