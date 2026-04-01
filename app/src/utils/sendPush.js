import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// sendPush — 푸시 알림 발송 요청 (Fire & Forget)
//
// 사용법:
//   sendPush({ roles: ['admin', 'manager'], title: '[1602] 하자 완료', body: '...' })
//
// 실패 시 조용히 무시 — 메인 저장 기능에 영향 없음
// ─────────────────────────────────────────────
export const sendPush = ({ roles, title, body = '', url = '/' }) => {
  // 비동기로 시작하되 await하지 않음 (fire & forget)
  ;(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ roles, title, body, url }),
        },
      )
    } catch {
      // 푸시 발송 실패 → 조용히 무시
    }
  })()
}
