import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

// ─────────────────────────────────────────────
// send-push Edge Function
// POST /functions/v1/send-push
//
// 역할(roles) 기반으로 해당 직원의 push_subscriptions에 알림 발송
// Supabase 프로젝트 시크릿 필요:
//   VAPID_PUBLIC_KEY   — web-push generate-vapid-keys 결과
//   VAPID_PRIVATE_KEY  —
//   VAPID_SUBJECT      — mailto:admin@example.com 형식
// ─────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  // OPTIONS preflight — 모듈 초기화 에러 없이 항상 응답
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // VAPID 초기화 — 요청 처리 시점에 수행 (초기화 실패 시 함수 crash 방지)
  const vapidSubject    = Deno.env.get('VAPID_SUBJECT')
  const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'VAPID 환경 변수 미설정' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  // ── 호출자 인증 ───────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '인증 필요' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAnon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: '인증 실패' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── 요청 파싱 ─────────────────────────────────
  const { roles, title, body, url } = await req.json()

  if (!roles?.length || !title) {
    return new Response(JSON.stringify({ error: 'roles, title 필수' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Service Role 클라이언트 ───────────────────
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 대상 구독 조회 (역할 + 활성 계정만) ─────────
  const { data: subscriptions, error: subErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in(
      'user_id',
      supabaseAdmin
        .from('users')
        .select('id')
        .in('role', roles)
        .eq('is_active', true),
    )

  if (subErr) {
    console.error('[send-push] 구독 조회 오류:', subErr.message)
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── 발송 페이로드 ────────────────────────────
  const payload = JSON.stringify({
    title,
    body:  body  || '',
    url:   url   || '/',
  })

  // ── 각 구독에 발송 (실패한 구독은 만료로 간주, DB 삭제) ──
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ).catch(async (err) => {
        // 410 Gone: 만료된 구독 → DB에서 삭제
        if (err.statusCode === 410) {
          await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint)
        }
        throw err
      }),
    ),
  )

  const sent   = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  console.log(`[send-push] sent=${sent}, failed=${failed}`)

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
