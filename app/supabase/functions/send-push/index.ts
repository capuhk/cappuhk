import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────
// send-push Edge Function (FCM HTTP v1 API)
//
// 역할(roles) 기반으로 fcm_tokens 조회 후 FCM 발송
// Supabase 프로젝트 시크릿 필요:
//   FCM_SERVICE_ACCOUNT_JSON — Firebase 서비스 계정 JSON 전체
// ─────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ── 서비스 계정 JSON으로 FCM OAuth2 액세스 토큰 발급 ──
async function getFcmAccessToken(serviceAccountJson: string): Promise<string> {
  const sa  = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)

  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }

  // 객체 → Base64URL 인코딩
  const toB64 = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const header64  = toB64(header)
  const payload64 = toB64(payload)
  const sigInput  = `${header64}.${payload64}`

  // PEM 비공개 키 → ArrayBuffer 변환
  const pemBody   = sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
  const binaryStr = atob(pemBody)
  const keyBytes  = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) keyBytes[i] = binaryStr.charCodeAt(i)

  const privateKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  )

  // JWT 서명
  const sig    = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(sigInput))
  const sig64  = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${sigInput}.${sig64}`

  // JWT → OAuth2 액세스 토큰 교환
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  const { access_token } = await tokenRes.json()
  return access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  // FCM 서비스 계정 JSON (없으면 FCM 발송 건너뜀 — 텔레그램은 독립 실행)
  const serviceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')

  // ── 호출자 인증 ───────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '인증 필요' }), {
      status: 401, headers: corsHeaders,
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
      status: 401, headers: corsHeaders,
    })
  }

  // ── 요청 파싱 ─────────────────────────────────
  const { roles, title, body, url, orderType } = await req.json()
  if (!roles?.length || !title) {
    return new Response(JSON.stringify({ error: 'roles, title 필수' }), {
      status: 400, headers: corsHeaders,
    })
  }

  // ── Service Role 클라이언트 ───────────────────
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── orderType별 관리자 알람 설정 컬럼 매핑 ─────
  const MANAGER_ROLES = ['admin', 'manager', 'supervisor']
  const PREF_COL: Record<string, string> = {
    '객실':  'push_room_order',
    '시설':  'push_facility_order',
    '공용부': 'push_common_order',
  }
  const prefCol = orderType ? PREF_COL[orderType] : null

  // ── 대상 FCM 토큰 조회 (역할 + 활성 계정) ────────
  const { data: tokens, error: tokenErr } = await supabaseAdmin
    .from('fcm_tokens')
    .select('token, user_id')
    .in(
      'user_id',
      supabaseAdmin.from('users').select('id').in('role', roles).eq('is_active', true),
    )

  // ── FCM 발송 (serviceAccountJson 있을 때만) ──────
  let sent = 0, failed = 0

  if (serviceAccountJson && !tokenErr && tokens?.length) {
    // 관리자 알람 OFF인 토큰 제외
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filteredTokens: any[] = tokens
    if (prefCol && filteredTokens.length > 0) {
      const managerIds = filteredTokens.map((t: { user_id: string }) => t.user_id)
      const { data: prefs } = await supabaseAdmin
        .from('users')
        .select(`id, ${prefCol}`)
        .in('id', managerIds)
        .in('role', MANAGER_ROLES)
      if (prefs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const disabledIds = new Set(prefs.filter((u: any) => u[prefCol] === false).map((u: any) => u.id as string))
        if (disabledIds.size > 0) {
          filteredTokens = filteredTokens.filter((t: { user_id: string }) => !disabledIds.has(t.user_id))
        }
      }
    }

    const accessToken = await getFcmAccessToken(serviceAccountJson)
    const projectId   = JSON.parse(serviceAccountJson).project_id
    const fcmUrl      = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

    const results = await Promise.allSettled(
      filteredTokens.map(async (sub: { token: string; user_id: string }) => {
        const res = await fetch(fcmUrl, {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: sub.token,
              notification: { title, body: body || '' },
              webpush: {
                fcm_options:  { link: url || '/' },
                notification: { icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' },
              },
            },
          }),
        })

        if (!res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errData: any = await res.json()
          // 토큰 만료(NOT_FOUND) → DB에서 삭제
          if (res.status === 404 || errData?.error?.status === 'NOT_FOUND') {
            await supabaseAdmin.from('fcm_tokens').delete().eq('token', sub.token)
          }
          throw new Error(`FCM error: ${JSON.stringify(errData)}`)
        }
        return res.json()
      }),
    )

    sent   = results.filter((r) => r.status === 'fulfilled').length
    failed = results.filter((r) => r.status === 'rejected').length
    console.log(`[send-push] FCM sent=${sent}, failed=${failed}`)
  } else {
    console.log('[send-push] FCM 건너뜀 (서비스 계정 미설정 또는 토큰 없음)')
  }

  // ── 텔레그램 병행 발송 (FCM 여부와 독립 실행) ────
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const appUrl   = Deno.env.get('APP_URL') || ''

  if (botToken) {
    // 대상 역할 중 telegram_chat_id 있는 사용자 조회
    const { data: tgUsers } = await supabaseAdmin
      .from('users')
      .select('telegram_chat_id')
      .in('role', roles)
      .eq('is_active', true)
      .not('telegram_chat_id', 'is', null)

    if (tgUsers?.length) {
      const tgApi = `https://api.telegram.org/bot${botToken}/sendMessage`
      const msgText = `🔔 ${title}${body ? `\n${body}` : ''}`

      await Promise.allSettled(
        tgUsers.map(({ telegram_chat_id }: { telegram_chat_id: string }) =>
          fetch(tgApi, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id:      telegram_chat_id,
              text:         msgText,
              // 앱에서 확인 버튼 — url이 있을 때만 표시
              ...(url && appUrl ? {
                reply_markup: {
                  inline_keyboard: [[{
                    text:    '앱에서 확인',
                    web_app: { url: `${appUrl}${url}` },
                  }]],
                },
              } : {}),
            }),
          })
        ),
      )
      console.log(`[send-push] Telegram sent=${tgUsers.length}`)
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
