import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// VAPID 공개키 — .env.local에 VITE_VAPID_PUBLIC_KEY 설정 필요
// 키 생성: npx web-push generate-vapid-keys
// ─────────────────────────────────────────────
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Base64URL → Uint8Array 변환 (Web Push 구독에 필요)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

// ─────────────────────────────────────────────
// 현재 구독 상태 반환
//   'unsupported' — 브라우저 미지원 (또는 iOS 미설치)
//   'denied'      — 권한 거부됨
//   'subscribed'  — 구독 중
//   'unsubscribed'— 지원하지만 미구독
// ─────────────────────────────────────────────
export const getPushStatus = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'

  try {
    const registration  = await navigator.serviceWorker.ready
    const subscription  = await registration.pushManager.getSubscription()
    return subscription ? 'subscribed' : 'unsubscribed'
  } catch {
    return 'unsupported'
  }
}

// ─────────────────────────────────────────────
// 푸시 구독 등록 + DB 저장
// ─────────────────────────────────────────────
export const subscribePush = async (userId) => {
  if (!VAPID_PUBLIC_KEY) throw new Error('VAPID 공개키가 설정되지 않았습니다.')
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('이 기기/브라우저는 푸시 알림을 지원하지 않습니다.')
  }

  // 알림 권한 요청
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('알림 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.')
  }

  const registration = await navigator.serviceWorker.ready

  // 기존 구독 취소 후 재구독 (키 변경 대응)
  const existing = await registration.pushManager.getSubscription()
  if (existing) await existing.unsubscribe()

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const { endpoint, keys } = subscription.toJSON()

  // DB에 구독 정보 저장 (같은 endpoint면 덮어쓰기)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id:     userId,
        endpoint,
        p256dh:      keys.p256dh,
        auth:        keys.auth,
        device_name: navigator.userAgent.includes('iPhone')  ? 'iPhone'
                   : navigator.userAgent.includes('Android') ? 'Android'
                   : 'PC',
      },
      { onConflict: 'user_id,endpoint' },
    )

  if (error) throw error
  return true
}

// ─────────────────────────────────────────────
// 푸시 구독 해제 + DB 삭제
// ─────────────────────────────────────────────
export const unsubscribePush = async (userId) => {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()

      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint)
    }
  } catch (err) {
    throw new Error('구독 해제 중 오류가 발생했습니다.')
  }
}
