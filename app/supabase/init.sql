-- =============================================
-- 하우스키핑 v3 — DB 초기 설정
-- Supabase SQL Editor에서 한 번 실행
-- =============================================

-- KST 타임존 설정
ALTER DATABASE postgres SET timezone = 'Asia/Seoul';

-- =============================================
-- 1. 헬퍼 함수 (테이블 참조 없는 것만 먼저)
-- =============================================

-- updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. 테이블 생성 (FK 의존성 순서 준수)
-- =============================================

-- 직원(사용자) 테이블
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,  -- 일반 직원은 {uuid}@hk.internal 형식
  role        TEXT NOT NULL DEFAULT 'maid'
                CHECK (role IN ('admin','manager','supervisor','maid','facility')),
  avatar_url  TEXT,
  phone       TEXT,
  pin_failed  INT NOT NULL DEFAULT 0,
  is_locked   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 관리자/소장/주임 여부 확인 (users 테이블 생성 후에 정의)
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('admin','manager','supervisor')
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 층·객실 마스터
CREATE TABLE IF NOT EXISTS public.room_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor       INT  NOT NULL,
  room_no     TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 하자 구분 마스터 (소프트 삭제만 허용)
CREATE TABLE IF NOT EXISTS public.defect_divisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 구분별 위치 마스터 (소프트 삭제만 허용)
CREATE TABLE IF NOT EXISTS public.defect_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id  UUID NOT NULL REFERENCES public.defect_divisions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sort_order   INT  NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(division_id, name)
);

-- 하자 분류 코드
CREATE TABLE IF NOT EXISTS public.defect_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 시설 종류 마스터
CREATE TABLE IF NOT EXISTS public.facility_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 시설 오더 (inspections보다 먼저 생성 — inspections에서 FK 참조)
CREATE TABLE IF NOT EXISTS public.facility_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no            TEXT NOT NULL,
  facility_type_id   UUID REFERENCES public.facility_types(id) ON DELETE SET NULL,
  facility_type_name TEXT NOT NULL,  -- 등록 시점 스냅샷 (마스터 변경 시에도 기록 보존)
  note               TEXT,
  status             TEXT NOT NULL DEFAULT '접수대기'
                       CHECK (status IN ('접수대기','접수중','완료')),  -- migration_v2에서 통일된 값
  author_id          UUID NOT NULL REFERENCES public.users(id),
  updated_by         UUID REFERENCES public.users(id),
  assigned_to        UUID REFERENCES public.users(id),
  completed_at       TIMESTAMPTZ,
  work_date          DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인스펙션 (facility_orders 이후 생성 — FK 참조)
CREATE TABLE IF NOT EXISTS public.inspections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT '진행중'
                      CHECK (status IN ('환기중','진행중','완료','시설')),
  note              TEXT,
  author_id         UUID NOT NULL REFERENCES public.users(id),
  updated_by        UUID REFERENCES public.users(id),
  facility_order_id UUID REFERENCES public.facility_orders(id) ON DELETE SET NULL,
  work_date         DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인스펙션 이미지 (thumb-inspections 버킷 / 20일 자동삭제)
CREATE TABLE IF NOT EXISTS public.inspection_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  thumb_path     TEXT,  -- 자동삭제 후 NULL 가능 (Edge Function이 Storage 삭제 후 NULL 업데이트)
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 객실 하자 (division/location/category 모두 텍스트 스냅샷 — 마스터 변경·삭제 시에도 기록 보존)
CREATE TABLE IF NOT EXISTS public.defects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no       TEXT NOT NULL,
  category      TEXT,           -- 등록 시 하자분류명 스냅샷 (division/location과 저장 방식 통일)
  division      TEXT NOT NULL,  -- 등록 시 구분명 스냅샷
  location      TEXT NOT NULL,  -- 등록 시 위치명 스냅샷
  memo          TEXT,
  status        TEXT NOT NULL DEFAULT '미완료'
                  CHECK (status IN ('미완료','처리중','완료')),
  author_id     UUID NOT NULL REFERENCES public.users(id),
  updated_by    UUID REFERENCES public.users(id),
  completed_by  UUID REFERENCES public.users(id),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 하자 이미지 (thumb-defects 버킷 / 영구보관)
CREATE TABLE IF NOT EXISTS public.defect_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_id      UUID NOT NULL REFERENCES public.defects(id) ON DELETE CASCADE,
  thumb_path     TEXT NOT NULL,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 시설오더 이미지 (thumb-facility-orders 버킷 / 60일 자동삭제)
CREATE TABLE IF NOT EXISTS public.facility_order_images (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_order_id  UUID NOT NULL REFERENCES public.facility_orders(id) ON DELETE CASCADE,
  thumb_path         TEXT,  -- 자동삭제 후 NULL 가능 (Edge Function이 Storage 삭제 후 NULL 업데이트)
  sort_order         INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 시설오더 상태 이력 로그
CREATE TABLE IF NOT EXISTS public.facility_order_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_order_id  UUID NOT NULL REFERENCES public.facility_orders(id) ON DELETE CASCADE,
  changed_by         UUID NOT NULL REFERENCES public.users(id),
  old_status         TEXT,
  new_status         TEXT,
  memo               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 게시판
CREATE TABLE IF NOT EXISTS public.notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  author_id   UUID NOT NULL REFERENCES public.users(id),
  updated_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 게시판 이미지 (thumb-notices 버킷 / 글 삭제 시 CASCADE)
CREATE TABLE IF NOT EXISTS public.notice_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id   UUID NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  thumb_path  TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 게시판 댓글
CREATE TABLE IF NOT EXISTS public.notice_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id   UUID NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 공지 확인 이력 (팝업 1회 제어용)
CREATE TABLE IF NOT EXISTS public.notice_reads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id  UUID NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(notice_id, user_id)
);

-- PWA 푸시 구독 정보
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  device_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- 페이지별 개인 설정값
-- ⚠️ 기기 간 동기화가 불필요하면 localStorage 저장으로 대체 가능 (DB 트랜잭션 절약)
--    MAU 3명 규모에서는 localStorage 이관 권장 (src/utils/pageSettings.js 참고)
CREATE TABLE IF NOT EXISTS public.page_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page        TEXT NOT NULL
                CHECK (page IN ('inspection','defect','facility_order')),
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, page, key)
);

-- =============================================
-- 3. 인덱스
-- =============================================

CREATE INDEX IF NOT EXISTS idx_inspections_work_date  ON public.inspections(work_date DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_author_id  ON public.inspections(author_id);
CREATE INDEX IF NOT EXISTS idx_inspections_room_no    ON public.inspections(room_no);
CREATE INDEX IF NOT EXISTS idx_inspections_status     ON public.inspections(status);

CREATE INDEX IF NOT EXISTS idx_defects_room_no        ON public.defects(room_no);
CREATE INDEX IF NOT EXISTS idx_defects_status         ON public.defects(status);
CREATE INDEX IF NOT EXISTS idx_defects_author         ON public.defects(author_id);

CREATE INDEX IF NOT EXISTS idx_facility_orders_date   ON public.facility_orders(work_date DESC);
CREATE INDEX IF NOT EXISTS idx_facility_orders_status ON public.facility_orders(status);

CREATE INDEX IF NOT EXISTS idx_room_master_floor      ON public.room_master(floor, sort_order);
CREATE INDEX IF NOT EXISTS idx_defect_locations_div   ON public.defect_locations(division_id, sort_order);

-- 자동삭제 Cron Edge Function 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_inspection_images_created   ON public.inspection_images(created_at);
CREATE INDEX IF NOT EXISTS idx_facility_order_img_created  ON public.facility_order_images(created_at);

-- =============================================
-- 4. updated_at 자동 갱신 트리거
-- =============================================

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inspections_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_defects_updated_at
  BEFORE UPDATE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_facility_orders_updated_at
  BEFORE UPDATE ON public.facility_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notices_updated_at
  BEFORE UPDATE ON public.notices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notice_comments_updated_at
  BEFORE UPDATE ON public.notice_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_page_settings_updated_at
  BEFORE UPDATE ON public.page_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- 5. RLS 활성화
-- =============================================

ALTER TABLE public.users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_master           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_images     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_divisions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_locations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_order_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_order_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_reads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_settings         ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 6. RLS 정책
-- =============================================

-- users (전체 조회 / 본인 또는 관리자만 수정)
CREATE POLICY "users_select" ON public.users FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (auth.uid() = id OR is_manager());
CREATE POLICY "users_delete" ON public.users FOR DELETE USING (is_manager());

-- room_master (전체 조회 / 관리자만 변경)
CREATE POLICY "room_select" ON public.room_master FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "room_insert" ON public.room_master FOR INSERT WITH CHECK (is_manager());
CREATE POLICY "room_update" ON public.room_master FOR UPDATE USING (is_manager());
CREATE POLICY "room_delete" ON public.room_master FOR DELETE USING (is_manager());

-- inspections (관리자·시설=전체 / 메이드=본인만)
CREATE POLICY "inspection_select" ON public.inspections FOR SELECT
  USING (
    is_manager()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'facility')
    OR auth.uid() = author_id
  );
CREATE POLICY "inspection_insert" ON public.inspections FOR INSERT
  WITH CHECK (
    is_manager()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'maid')
  );
CREATE POLICY "inspection_update" ON public.inspections FOR UPDATE
  USING (is_manager() OR auth.uid() = author_id);
CREATE POLICY "inspection_delete" ON public.inspections FOR DELETE USING (is_manager());

-- inspection_images
CREATE POLICY "insp_img_select" ON public.inspection_images FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "insp_img_insert" ON public.inspection_images FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "insp_img_delete" ON public.inspection_images FOR DELETE USING (is_manager());

-- defects (전체 조회 / 관리자+메이드 등록 / 관리자+작성자 수정 / 관리자만 삭제)
CREATE POLICY "defect_select" ON public.defects FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "defect_insert" ON public.defects FOR INSERT
  WITH CHECK (
    is_manager()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'maid')
  );
CREATE POLICY "defect_update" ON public.defects FOR UPDATE
  USING (is_manager() OR auth.uid() = author_id);
CREATE POLICY "defect_delete" ON public.defects FOR DELETE USING (is_manager());

-- defect_images
CREATE POLICY "defect_img_select" ON public.defect_images FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "defect_img_insert" ON public.defect_images FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "defect_img_delete" ON public.defect_images FOR DELETE USING (is_manager());

-- 마스터 데이터: 전체 조회 / 관리자만 변경 (FOR ALL = INSERT+UPDATE+DELETE)
CREATE POLICY "div_select" ON public.defect_divisions  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "div_write"  ON public.defect_divisions  FOR ALL    USING (is_manager());
CREATE POLICY "loc_select" ON public.defect_locations  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "loc_write"  ON public.defect_locations  FOR ALL    USING (is_manager());
CREATE POLICY "cat_select" ON public.defect_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cat_write"  ON public.defect_categories FOR ALL    USING (is_manager());
CREATE POLICY "ft_select"  ON public.facility_types    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ft_write"   ON public.facility_types    FOR ALL    USING (is_manager());

-- facility_orders (전체 조회 / 관리자+시설 등록·수정 / 관리자만 삭제)
CREATE POLICY "fo_select" ON public.facility_orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fo_insert" ON public.facility_orders FOR INSERT
  WITH CHECK (
    is_manager()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'facility')
  );
CREATE POLICY "fo_update" ON public.facility_orders FOR UPDATE
  USING (
    is_manager()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'facility')
  );
CREATE POLICY "fo_delete" ON public.facility_orders FOR DELETE USING (is_manager());

-- facility_order_images
CREATE POLICY "fo_img_select" ON public.facility_order_images FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fo_img_insert" ON public.facility_order_images FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "fo_img_delete" ON public.facility_order_images FOR DELETE USING (is_manager());

-- facility_order_log
CREATE POLICY "fo_log_select" ON public.facility_order_log FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fo_log_insert" ON public.facility_order_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- notices (전체 조회 / 관리자만 등록·수정·삭제)
CREATE POLICY "notice_select" ON public.notices FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "notice_insert" ON public.notices FOR INSERT WITH CHECK (is_manager());
CREATE POLICY "notice_update" ON public.notices FOR UPDATE USING (is_manager());
CREATE POLICY "notice_delete" ON public.notices FOR DELETE USING (is_manager());

-- notice_images
CREATE POLICY "notice_img_select" ON public.notice_images FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "notice_img_insert" ON public.notice_images FOR INSERT WITH CHECK (is_manager());
CREATE POLICY "notice_img_delete" ON public.notice_images FOR DELETE USING (is_manager());

-- notice_comments (전체 조회 / 전체 등록 / 본인 수정 / 본인+관리자 삭제)
CREATE POLICY "comment_select" ON public.notice_comments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comment_insert" ON public.notice_comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "comment_update" ON public.notice_comments FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "comment_delete" ON public.notice_comments FOR DELETE USING (auth.uid() = author_id OR is_manager());

-- notice_reads (본인만)
CREATE POLICY "nread_select" ON public.notice_reads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nread_insert" ON public.notice_reads FOR INSERT WITH CHECK (auth.uid() = user_id);

-- push_subscriptions (본인만)
CREATE POLICY "push_select" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_insert" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_update" ON public.push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "push_delete" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- page_settings (본인만)
CREATE POLICY "ps_select" ON public.page_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ps_insert" ON public.page_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ps_update" ON public.page_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ps_delete" ON public.page_settings FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- 7. Storage 버킷 생성 (Private / JPG 전용)
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('thumb-inspections',     'thumb-inspections',     false, 5242880, ARRAY['image/jpeg']),
  ('thumb-defects',         'thumb-defects',         false, 5242880, ARRAY['image/jpeg']),
  ('thumb-facility-orders', 'thumb-facility-orders', false, 5242880, ARRAY['image/jpeg']),
  ('thumb-notices',         'thumb-notices',         false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Storage 객체 접근 정책
-- 조회: 인증된 사용자 (Signed URL 생성용)
CREATE POLICY "storage_authenticated_select"
  ON storage.objects FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 업로드: 인증된 사용자
CREATE POLICY "storage_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 삭제: 관리자만 (Edge Function은 service_role로 RLS 우회)
CREATE POLICY "storage_manager_delete"
  ON storage.objects FOR DELETE
  USING (is_manager());

-- =============================================
-- 8. 초기 데이터 (Seed)
-- =============================================

-- 하자 구분
INSERT INTO public.defect_divisions (name, sort_order) VALUES
  ('객실', 0), ('사워부스', 1), ('화장실', 2), ('침대', 3), ('창문', 4)
ON CONFLICT (name) DO NOTHING;

-- 구분별 위치
INSERT INTO public.defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['벽','바닥','의자','천정','드라이기','세면대','찍힘','거울']),
       generate_series(0,7)
FROM public.defect_divisions WHERE name = '객실'
ON CONFLICT (division_id, name) DO NOTHING;

INSERT INTO public.defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['벽','바닥','수전','천정','찍힘']),
       generate_series(0,4)
FROM public.defect_divisions WHERE name = '사워부스'
ON CONFLICT (division_id, name) DO NOTHING;

INSERT INTO public.defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['벽','바닥','천장','비데','타일','찍힘']),
       generate_series(0,5)
FROM public.defect_divisions WHERE name = '화장실'
ON CONFLICT (division_id, name) DO NOTHING;

INSERT INTO public.defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['벽','쿠션','턱','찍힘']),
       generate_series(0,3)
FROM public.defect_divisions WHERE name = '침대'
ON CONFLICT (division_id, name) DO NOTHING;

INSERT INTO public.defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['틀','유리','블라인드']),
       generate_series(0,2)
FROM public.defect_divisions WHERE name = '창문'
ON CONFLICT (division_id, name) DO NOTHING;

-- 하자 분류
INSERT INTO public.defect_categories (name, sort_order) VALUES
  ('스크래치', 0), ('얼룩', 1), ('파손', 2),
  ('냄새', 3), ('소음', 4), ('누수', 5), ('기타', 6)
ON CONFLICT (name) DO NOTHING;

-- 시설 종류
INSERT INTO public.facility_types (name, sort_order) VALUES
  ('객실', 0), ('공용부', 1), ('시설', 2)
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- 9. 통계 집계 RPC 함수
-- =============================================

-- 직원별 인스펙션 건수
CREATE OR REPLACE FUNCTION get_staff_inspection_stats(start_date DATE, end_date DATE)
RETURNS TABLE(staff_name TEXT, cnt BIGINT) AS $$
  SELECT u.name, COUNT(i.id)
  FROM public.inspections i
  JOIN public.users u ON i.author_id = u.id
  WHERE i.work_date BETWEEN start_date AND end_date
  GROUP BY u.name
  ORDER BY COUNT(i.id) DESC;
$$ LANGUAGE SQL STABLE;

-- 당일 시설오더 현황 (KST 기준)
CREATE OR REPLACE FUNCTION get_today_facility_order_stats()
RETURNS TABLE(status TEXT, cnt BIGINT) AS $$
  SELECT status, COUNT(id)
  FROM public.facility_orders
  WHERE work_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE
  GROUP BY status;
$$ LANGUAGE SQL STABLE;

-- 미처리 현황 (최근 50일)
CREATE OR REPLACE FUNCTION get_unresolved_stats()
RETURNS TABLE(type TEXT, room_no TEXT, note TEXT, author TEXT, created_at TIMESTAMPTZ) AS $$
  SELECT '환기중', i.room_no, i.note, u.name, i.created_at
  FROM public.inspections i JOIN public.users u ON i.author_id = u.id
  WHERE i.status = '환기중' AND i.created_at >= NOW() - INTERVAL '50 days'
  UNION ALL
  SELECT '진행중', i.room_no, i.note, u.name, i.created_at
  FROM public.inspections i JOIN public.users u ON i.author_id = u.id
  WHERE i.status = '진행중' AND i.created_at >= NOW() - INTERVAL '50 days'
  UNION ALL
  SELECT '시설오더', f.room_no, f.note, u.name, f.created_at
  FROM public.facility_orders f JOIN public.users u ON f.author_id = u.id
  WHERE f.status IN ('접수대기','접수중') AND f.created_at >= NOW() - INTERVAL '50 days'
  ORDER BY created_at DESC;
$$ LANGUAGE SQL STABLE;
