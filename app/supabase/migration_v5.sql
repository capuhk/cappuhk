-- =============================================
-- migration_v5.sql
-- 변경 내용:
--   get_unresolved_stats() 함수 확장
--   - id 컬럼 추가 (상세 페이지 이동용)
--   - 완료 상태 인스펙션 추가 (당일만)
--   - sub_label 컬럼 추가 (시설오더의 facility_type_name)
--   - work_date 컬럼 추가
--   - status 컬럼 추가 (시설오더 접수대기/접수중 구분용)
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
  -- 환기중 (최근 50일)
  SELECT i.id, '환기중'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status
  FROM public.inspections i JOIN public.users u ON i.author_id = u.id
  WHERE i.status = '환기중'
    AND i.created_at >= NOW() - INTERVAL '50 days'

  UNION ALL

  -- 진행중 (최근 50일)
  SELECT i.id, '진행중'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status
  FROM public.inspections i JOIN public.users u ON i.author_id = u.id
  WHERE i.status = '진행중'
    AND i.created_at >= NOW() - INTERVAL '50 days'

  UNION ALL

  -- 시설오더 (접수대기·접수중, 최근 50일)
  SELECT f.id, '시설오더'::TEXT, f.room_no, f.note, u.name,
         f.created_at, f.work_date, f.facility_type_name, f.status
  FROM public.facility_orders f JOIN public.users u ON f.author_id = u.id
  WHERE f.status IN ('접수대기', '접수중')
    AND f.created_at >= NOW() - INTERVAL '50 days'

  UNION ALL

  -- 완료 (당일만)
  SELECT i.id, '완료'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status
  FROM public.inspections i JOIN public.users u ON i.author_id = u.id
  WHERE i.status = '완료'
    AND i.work_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE

  ORDER BY created_at DESC;
$$ LANGUAGE SQL STABLE;
