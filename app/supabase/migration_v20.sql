-- migration_v20: 인스펙션 날짜별 건수 집계 RPC 함수
-- Phase 1 조회 시 Supabase max-rows 제한 우회용

CREATE OR REPLACE FUNCTION get_inspection_date_counts(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (work_date DATE, cnt BIGINT)
LANGUAGE SQL
STABLE
SECURITY INVOKER  -- 호출자 RLS 정책 그대로 적용 (관리자는 전체, 일반직원은 본인 것만)
AS $$
  SELECT work_date, COUNT(*) AS cnt
  FROM public.inspections
  WHERE work_date >= p_from
    AND work_date <= p_to
  GROUP BY work_date
  ORDER BY work_date DESC;
$$;
