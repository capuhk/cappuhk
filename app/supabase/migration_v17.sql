-- ─────────────────────────────────────────────
-- migration_v17: WINGS PMS 객실 현황 테이블 (카푸치노 전용)
-- 스크래퍼(Python+Playwright)가 5분마다 upsert
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
  id                  SERIAL PRIMARY KEY,
  room_no             VARCHAR(10) UNIQUE NOT NULL,  -- 객실번호 (0301 등)
  floor_code          VARCHAR(5),                   -- 층 코드 (03, 04 ... 16)
  room_type_code      VARCHAR(10),                  -- 객실 타입 (BAK, CAK, SUT, QUA, DIS 등)
  room_sts_text       VARCHAR(5),                   -- 청소 상태 (VD/VI/VC/OO/OC/OD/OI)
  room_status         VARCHAR(5),                   -- 예약 상태 (RR/CI/OO/BK)
  inroom_status       VARCHAR(5),                   -- 객실 내 재실 여부 (V/I)
  -- inhs_gest_name 수집 제외 — 투숙객 이름은 개인정보
  arrv_date           DATE,                         -- 체크인 날짜
  dept_date           DATE,                         -- 체크아웃 날짜
  arrv_plan_time      VARCHAR(10),                  -- 체크인 예정 시간
  dept_plan_time      VARCHAR(10),                  -- 체크아웃 예정 시간
  nights              VARCHAR(5),                   -- 숙박일수
  balance_amt         BIGINT,                       -- 잔액
  lsos_code           VARCHAR(5),                   -- LS 등 특이사항 코드
  room_sales_sts_text VARCHAR(5),                   -- 판매상태
  updated_at          TIMESTAMPTZ DEFAULT NOW()     -- 마지막 업데이트 시각
);

-- Realtime 활성화 — 스크래퍼 upsert 시 앱에 즉시 반영
ALTER TABLE rooms REPLICA IDENTITY FULL;

-- RLS 활성화
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- 로그인한 사용자 누구나 읽기 가능
CREATE POLICY "rooms_authenticated_read"
  ON rooms FOR SELECT
  TO authenticated
  USING (true);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_rooms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rooms_updated_at_trigger
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_rooms_updated_at();
