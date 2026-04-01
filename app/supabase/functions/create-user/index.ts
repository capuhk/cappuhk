import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────
// create-user Edge Function
// POST /functions/v1/create-user
//
// 신규 직원 계정 생성 (service_role 키 필요)
// 호출 권한: 관리자·소장·주임만 (JWT role 검증)
// ─────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  // CORS preflight 처리
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

  // anon 클라이언트로 호출자 신원 확인
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

  // 호출자 역할 확인
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

  // ── 요청 파싱 및 유효성 검사 ─────────────────
  const { name, pin, role, phone } = await req.json()

  if (!name?.trim()) {
    return new Response(JSON.stringify({ error: '이름을 입력해주세요.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!pin || String(pin).length < 4) {
    return new Response(JSON.stringify({ error: 'PIN은 4자리 이상이어야 합니다.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Service Role 클라이언트 (RLS 우회) ────────
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 동명이인 확인
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('name', name.trim())
    .maybeSingle()

  if (existing) {
    return new Response(JSON.stringify({ error: '동일한 이름의 직원이 이미 존재합니다.' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Auth 사용자 생성 ──────────────────────────
  const internalEmail = `${crypto.randomUUID()}@hk.internal`

  const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email:          internalEmail,
    password:       String(pin),
    email_confirm:  true,  // 이메일 인증 없이 즉시 활성화
  })

  if (createError || !authData.user) {
    return new Response(JSON.stringify({ error: createError?.message || '계정 생성 실패' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── public.users 프로필 생성 ──────────────────
  const { error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id:    authData.user.id,
      name:  name.trim(),
      email: internalEmail,
      role:  role || 'maid',
      phone: phone?.trim() || null,
    })

  if (profileError) {
    // 프로필 생성 실패 시 auth 사용자 롤백 삭제
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      id:    authData.user.id,
      name:  name.trim(),
      email: internalEmail,
      role:  role || 'maid',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
