-- ─────────────────────────────────────────────
-- migration_v16: 텔레그램 그룹 채팅 ID 컬럼 추가
-- telegram_group_id: 팀 공유 그룹 채팅 ID
--   같은 팀원들이 동일한 그룹 ID를 저장
--   send-push에서 고유값만 추려 그룹에 1회 발송
-- ─────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_group_id TEXT;
