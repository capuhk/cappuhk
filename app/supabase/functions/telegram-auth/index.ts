import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────
// telegram-auth Edge Function
//
// 텔레그램 미니앱 initData 검증 → 사용자 조회 → Supabase 세션 발급
//
// 흐름:
//   1. HMAC-SHA256으로 initData 유효성 검증 (TELEGRAM_BOT_TOKEN 사용)
//   2. telegram_id로 users 테이블 조회
//   3. 찾으면: magiclink 토큰 발급 → 클라이언트에서 verifyOtp로 세션 획득
//   4. 못찾으면: { status: 'not_linked' } → 클라이언트는 PIN 로그인으로 fallback
//
// 필요 시크릿:
//   TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type',
}

// ── initData HMAC-SHA256 검증 ────────────────
// Telegram 공식 검증 방식: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData: string, botToken: string): Promise<Record<string, string> | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null

  // hash 제외한 나머지 파라미터를 key=value\n 형식으로 정렬 후 연결
  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  // secret_key = HMAC-SHA256("WebAppData", botToken)
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const secretKey = await crypto.subtle.sign('HMAC', keyMaterial, encoder.encode(botToken))

  // 실제 해시 = HMAC-SHA256(secretKey, dataCheckString)
  const signKey = await crypto.subtle.importKey(
    'raw', secretKey,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', signKey, encoder.encode(dataCheckString))
  const computedHash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (computedHash !== hash) return null

  // 검증 통과 — 파라미터 객체로 반환
  const result: Record<string, string> = {}
  params.forEach((v, k) => { result[k] = v })
  result['hash'] = hash
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) {
    return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN 미설정' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { initData } = await req.json()
  if (!initData) {
    return new Response(JSON.stringify({ error: 'initData 필수' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── initData 검증 ─────────────────────────
  const verified = await verifyInitData(initData, botToken)
  if (!verified) {
    return new Response(JSON.stringify({ error: 'initData 검증 실패' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── 텔레그램 사용자 정보 파싱 ────────────────
  let tgUser: { id: number; username?: string; first_name?: string } | null = null
  try {
    tgUser = JSON.parse(verified['user'])
  } catch {
    return new Response(JSON.stringify({ error: 'user 파싱 실패' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── telegram_id로 users 테이블 조회 ──────────
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('telegram_id', tgUser.id)
    .single()

  if (!userRow) {
    // 연동된 계정 없음 → PIN 로그인으로 fallback
    return new Response(JSON.stringify({ status: 'not_linked' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── magiclink 토큰 발급 → 클라이언트 세션 획득용 ──
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type:  'magiclink',
    email: userRow.email,
  })

  if (linkError || !linkData) {
    return new Response(JSON.stringify({ error: '세션 발급 실패' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // hashed_token 추출 (verifyOtp에서 사용)
  const url         = new URL(linkData.properties.action_link)
  const tokenHash   = url.searchParams.get('token_hash') || linkData.properties.hashed_token

  return new Response(JSON.stringify({
    status:     'ok',
    token_hash: tokenHash,
    email:      userRow.email,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
