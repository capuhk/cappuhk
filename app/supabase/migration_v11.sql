-- =============================================
-- migration_v11.sql
-- 변경 내용:
--   1. notices.target_roles 컬럼 추가 (공개 대상 역할 배열)
--   2. app_policies에 게시판 권한 키 초기값 추가
-- Supabase SQL Editor에서 실행
-- =============================================

-- 공개 대상 역할 배열 컬럼 추가 (빈 배열 = 전체 공개)
ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS target_roles TEXT[] NOT NULL DEFAULT '{}';

-- 운영 정책 초기값 추가
-- notice_read_roles : 게시판 접근 가능 역할
-- notice_write_roles: 게시글 작성 가능 역할
INSERT INTO app_policies (key, value) VALUES
  ('notice_read_roles',  '["admin","manager","supervisor","maid","facility"]'),
  ('notice_write_roles', '["admin","manager","supervisor","maid","facility"]')
ON CONFLICT (key) DO NOTHING;
