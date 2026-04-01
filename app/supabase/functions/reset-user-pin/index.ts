import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────
// reset-user-pin Edge Function
// POST /functions/v1/reset-user-pin
//
// 관리자가 다른 직원의 PIN 재설정
// 호출 권한: 관리자·소장·주임만
// ─────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  // ── 호출자 인증 및 권한 검증 ─────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '인증이 필요합니다.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAnon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser()
  if (authError || !caller) {
    return new Response(JSON.stringify({ error: '인증이 필요합니다.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: callerProfile } = await supabaseAnon
    .from('users')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (!['admin', 'manager', 'supervisor'].includes(callerProfile?.role)) {
    return new Response(JSON.stringify({ error: '권한이 없습니다.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── 요청 파싱 ─────────────────────────────────
  const { userId, pin } = await req.json()

  if (!userId) {
    return new Response(JSON.stringify({ error: '대상 직원 ID가 필요합니다.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!pin || String(pin).length < 6) {
    return new Response(JSON.stringify({ error: 'PIN은 6자리 이상이어야 합니다.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Service Role로 비밀번호 변경 ─────────────
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: String(pin),
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // PIN 재설정 시 잠금도 함께 해제
  await supabaseAdmin
    .from('users')
    .update({ is_locked: false, pin_failed: 0 })
    .eq('id', userId)

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
