-- ─────────────────────────────────────────────
-- migration_v6: 긴급오더, 이관 상태, 처리중 통일, 이관 RPC
-- Supabase SQL Editor에서 실행
-- ─────────────────────────────────────────────

-- 1. 기존 '접수중' 데이터를 '처리중'으로 통일 (코드와 일치)
UPDATE public.facility_orders
SET status = '처리중'
WHERE status = '접수중';

-- 2. 제약 조건 수정: '처리중' 사용 & '이관' 추가
ALTER TABLE public.facility_orders
  DROP CONSTRAINT IF EXISTS facility_orders_status_check;

ALTER TABLE public.facility_orders
  ADD CONSTRAINT facility_orders_status_check
  CHECK (status IN ('접수대기', '처리중', '완료', '이관'));

-- 3. 긴급오더 필드 추가
ALTER TABLE public.facility_orders
  ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false;

-- 4. 객실하자 이관 트랜잭션 RPC
--    defect 등록 + facility_order 상태 변경 + 로그 기록을 하나의 트랜잭션으로 처리
--    old_status를 내부에서 동적으로 조회하여 로그 정확도 보장
CREATE OR REPLACE FUNCTION move_facility_to_defect_v1(
  p_fo_id      UUID,
  p_room_no    TEXT,
  p_division   TEXT,
  p_location   TEXT,
  p_memo       TEXT,
  p_user_id    UUID
) RETURNS UUID AS $$
DECLARE
  v_defect_id  UUID;
  v_old_status TEXT;
BEGIN
  -- 현재 상태 조회 (로그 정확도를 위해 하드코딩 대신 동적 조회)
  SELECT status INTO v_old_status
  FROM public.facility_orders
  WHERE id = p_fo_id;

  -- 1. 객실하자 등록
  INSERT INTO public.defects (room_no, division, location, memo, status, author_id)
  VALUES (p_room_no, p_division, p_location, p_memo, '미완료', p_user_id)
  RETURNING id INTO v_defect_id;

  -- 2. 시설오더 상태를 '이관'으로 변경
  UPDATE public.facility_orders
  SET status = '이관', updated_by = p_user_id
  WHERE id = p_fo_id;

  -- 3. 이력 로그 기록
  INSERT INTO public.facility_order_log
    (facility_order_id, changed_by, old_status, new_status, memo)
  VALUES
    (p_fo_id, p_user_id, v_old_status, '이관', '객실하자로 이관됨');

  RETURN v_defect_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
