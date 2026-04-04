-- =============================================
-- migration_v9.sql
-- 변경 내용:
--   1. facility_orders.room_no NOT NULL → nullable
--   2. facility_orders.location_type 컬럼 추가 (객실/공용부/시설)
--      - 기존 데이터는 모두 '객실' 로 기본값 설정
-- Supabase SQL Editor에서 실행
-- =============================================

-- 1. room_no NOT NULL 제약 해제
ALTER TABLE facility_orders
  ALTER COLUMN room_no DROP NOT NULL;

-- 2. location_type 컬럼 추가
--    기존 레코드는 모두 '객실' 로 채움
ALTER TABLE facility_orders
  ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT '객실'
    CHECK (location_type IN ('객실', '공용부', '시설'));

-- 3. get_unresolved_stats() 업데이트
--    room_no가 null일 수 있으므로 COALESCE로 location_type 대체
CREATE OR REPLACE FUNCTION get_unresolved_stats()
RETURNS TABLE(
  id          UUID,
  type        TEXT,
  room_no     TEXT,
  note        TEXT,
  author      TEXT,
  created_at  TIMESTAMPTZ,
  work_date   DATE,
  sub_label   TEXT,
  status      TEXT
) AS $$
  -- 환기중 (최근 50일, 미완료만)
  SELECT i.id, '환기중'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status
  FROM public.inspections i JOIN public.users u ON i.author_id = u.id
  WHERE i.status = '환기중'
    AND i.created_at >= NOW() - INTERVAL '50 days'

  UNION ALL

  -- 진행중 (최근 50일, 미완료만)
  SELECT i.id, '진행중'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status
  FROM public.inspections i JOIN public.users u ON i.author_id = u.id
  WHERE i.status = '진행중'
    AND i.created_at >= NOW() - INTERVAL '50 days'

  UNION ALL

  -- 시설오더 (접수대기·처리중, 최근 50일)
  -- room_no null 시 location_type으로 대체 표시
  SELECT f.id, '시설오더'::TEXT,
         COALESCE(f.room_no, f.location_type),
         f.note, u.name,
         f.created_at, f.work_date, f.facility_type_name, f.status
  FROM public.facility_orders f JOIN public.users u ON f.author_id = u.id
  WHERE f.status IN ('접수대기', '처리중')
    AND f.created_at >= NOW() - INTERVAL '50 days'

  ORDER BY created_at DESC;
$$ LANGUAGE SQL STABLE;
