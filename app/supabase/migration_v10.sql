-- =============================================
-- migration_v10.sql
-- 변경 내용:
--   users.role CHECK에 houseman, front 추가
-- Supabase SQL Editor에서 실행
-- =============================================

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin','manager','supervisor','maid','facility','houseman','front'));
