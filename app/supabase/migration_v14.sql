-- ─────────────────────────────────────────────
-- migration_v14: 알림 개별 읽음 테이블
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_reads (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    TEXT        NOT NULL,  -- 'notice_{uuid}' or 'fo_{uuid}_접수대기'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, item_id)
);

ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

-- 본인 읽음 데이터만 관리 가능
CREATE POLICY "본인 알림 읽음 관리" ON notification_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
