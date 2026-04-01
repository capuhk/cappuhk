-- ─────────────────────────────────────────────
-- migration_v7: 로그인 RLS 이슈 해결
-- 일반직원(이름) 로그인 시 email 조회 RPC
-- Supabase SQL Editor에서 실행
-- ─────────────────────────────────────────────

-- 이름으로 email 조회 — 비인증(anon) 상태에서도 동작
-- SECURITY DEFINER: RLS를 우회하여 users 테이블 조회 가능
-- 활성 계정(is_active=true)만 조회
CREATE OR REPLACE FUNCTION get_internal_email_by_name(p_name TEXT)
RETURNS TEXT AS $$
  SELECT email FROM public.users
  WHERE name = p_name AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- anon 역할에 실행 권한 부여 (로그인 전 상태에서 호출 가능하도록)
GRANT EXECUTE ON FUNCTION get_internal_email_by_name(TEXT) TO anon;
