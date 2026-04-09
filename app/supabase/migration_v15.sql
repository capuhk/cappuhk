-- ─────────────────────────────────────────────
-- migration_v15: 텔레그램 연동 컬럼 추가
-- ─────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_id      BIGINT UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- telegram_id:      텔레그램 사용자 고유 ID (WebApp.initDataUnsafe.user.id)
-- telegram_chat_id: 봇 DM 발송용 chat_id (개인 DM = telegram_id와 동일)
