-- =============================================
-- migration_v8.sql
-- 변경 내용:
--   get_unresolved_stats() 완료 항목 제거
--   - 완료 인스펙션 UNION 삭제 (대시보드는 미처리 현황만 표시)
--   - 시설오더 status 조건: '접수중' → '처리중' (migration_v6 반영)
-- Supabase SQL Editor에서 실행
-- =============================================

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
  SELECT f.id, '시설오더'::TEXT, f.room_no, f.note, u.name,
         f.created_at, f.work_date, f.facility_type_name, f.status
  FROM public.facility_orders f JOIN public.users u ON f.author_id = u.id
  WHERE f.status IN ('접수대기', '처리중')
    AND f.created_at >= NOW() - INTERVAL '50 days'

  ORDER BY created_at DESC;
$$ LANGUAGE SQL STABLE;
