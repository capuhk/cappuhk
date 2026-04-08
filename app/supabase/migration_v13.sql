-- ─────────────────────────────────────────────
-- migration_v13: FCM 토큰 테이블 + 알림 읽음 기준 컬럼
-- ─────────────────────────────────────────────

-- FCM 토큰 테이블 (기존 push_subscriptions VAPID 대체)
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL,
  device_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;

-- 본인 토큰만 등록/삭제 가능 (users.id = auth.uid() 구조)
CREATE POLICY "본인 FCM 토큰 관리" ON fcm_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 알림 마지막 읽음 시각 — 뱃지 카운트 기준점 (NULL = 첫 로그인)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notif_last_read_at TIMESTAMPTZ;

-- Realtime 활성화 — 오더/공지 INSERT 감지용
ALTER PUBLICATION supabase_realtime ADD TABLE facility_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE notices;
