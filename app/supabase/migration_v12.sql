-- migration_v12: 관리자 오더 카테고리별 푸시 설정 컬럼 추가
--               + get_unresolved_stats() location_type 컬럼 추가
-- 2026-04-06

-- 1. 오더 알람 ON/OFF 컬럼
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_room_order     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS push_facility_order BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS push_common_order   BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. get_unresolved_stats() — location_type 컬럼 추가 (오더 서브필터용)
--    반환 타입 변경으로 DROP 후 재생성 필요
--    '오더' 타입 행에만 location_type 값 있음; 인스펙션 행은 NULL
DROP FUNCTION IF EXISTS get_unresolved_stats();
CREATE OR REPLACE FUNCTION get_unresolved_stats()
RETURNS TABLE(
  id            UUID,
  type          TEXT,
  room_no       TEXT,
  note          TEXT,
  author        TEXT,
  created_at    TIMESTAMPTZ,
  work_date     DATE,
  sub_label     TEXT,
  status        TEXT,
  location_type TEXT
) AS $$
  -- 환기중 (최근 50일, 미완료만)
  SELECT i.id, '환기중'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status,
         NULL::TEXT
  FROM public.inspections i JOIN public.users u ON i.author_id = u.id
  WHERE i.status = '환기중'
    AND i.created_at >= NOW() - INTERVAL '50 days'

  UNION ALL

  -- 진행중 (최근 50일, 미완료만)
  SELECT i.id, '진행중'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status,
         NULL::TEXT
  FROM public.inspections i JOIN public.users u ON i.author_id = u.id
  WHERE i.status = '진행중'
    AND i.created_at >= NOW() - INTERVAL '50 days'

  UNION ALL

  -- 오더 (접수대기·처리중, 최근 50일)
  -- room_no null 시 location_type으로 대체 표시
  SELECT f.id, '오더'::TEXT,
         COALESCE(f.room_no, f.location_type),
         f.note, u.name,
         f.created_at, f.work_date, f.facility_type_name, f.status,
         f.location_type
  FROM public.facility_orders f JOIN public.users u ON f.author_id = u.id
  WHERE f.status IN ('접수대기', '처리중')
    AND f.created_at >= NOW() - INTERVAL '50 days'

  ORDER BY created_at DESC;
$$ LANGUAGE SQL STABLE;
