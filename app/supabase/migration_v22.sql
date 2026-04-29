-- ─────────────────────────────────────────────
-- 시설오더 날짜별 건수 집계 RPC
-- work_date × status × is_urgent 조합별 cnt 반환
-- → 클라이언트에서 날짜 건수, 상태 건수, 긴급 건수 모두 도출
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_facility_order_date_counts(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (work_date DATE, status TEXT, is_urgent BOOLEAN, cnt BIGINT)
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  SELECT work_date, status, is_urgent, COUNT(*) AS cnt
  FROM public.facility_orders
  WHERE work_date >= p_from
    AND work_date <= p_to
  GROUP BY work_date, status, is_urgent
  ORDER BY work_date DESC;
$$;

-- ─────────────────────────────────────────────
-- 객실하자 객실번호별 건수 집계 RPC
-- room_no × status 조합별 cnt 반환
-- → 클라이언트에서 객실 건수, 상태 건수 모두 도출
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_defect_room_counts(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE (room_no TEXT, status TEXT, cnt BIGINT)
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  SELECT room_no, status, COUNT(*) AS cnt
  FROM public.defects
  WHERE created_at >= p_from
    AND created_at <= p_to
  GROUP BY room_no, status
  ORDER BY room_no ASC;
$$;
