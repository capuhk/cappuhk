-- =============================================
-- migration_v4.sql
-- 적용 대상: 이미 배포된 DB (init.sql + migration_v2 + migration_v3 적용 완료 가정)
--
-- 변경 내용:
--   1. is_manager() — is_active = true 조건 추가
--   2. is_active_user() — 신규 헬퍼 함수 (활성 계정 여부 확인)
--   3. 전체 RLS 정책 — auth.uid() IS NOT NULL → is_active_user() 로 교체
--      → 비활성 계정의 기존 세션 토큰이 만료되기 전에도 데이터 접근 차단
-- =============================================

-- ── 1. is_manager() 갱신 — is_active 조건 추가 ──────────────────────────────
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id   = auth.uid()
      AND role IN ('admin', 'manager', 'supervisor')
      AND is_active = true   -- 비활성 계정은 관리자 권한 없음
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 2. is_active_user() 신규 헬퍼 ───────────────────────────────────────────
-- 현재 JWT 사용자가 is_active = true 인지 확인
-- SECURITY DEFINER: 내부 users 테이블 조회 시 RLS 우회 (재귀 방지)
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id        = auth.uid()
      AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 3. RLS 정책 갱신 ─────────────────────────────────────────────────────────
-- 기존 정책 DROP 후 재생성 (ALTER POLICY 미지원)

-- ── users ──────────────────────────────────
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;

-- 조회: 활성 계정만 가능 (단, 관리자는 비활성 계정도 조회 가능 — 재활성화 목적)
CREATE POLICY "users_select" ON public.users FOR SELECT
  USING (is_active_user() OR is_manager());

-- 수정: 본인(활성)이거나 관리자 (관리자는 비활성 계정도 수정 가능 — 잠금해제 등)
CREATE POLICY "users_update" ON public.users FOR UPDATE
  USING ((is_active_user() AND auth.uid() = id) OR is_manager());

-- ── room_master ────────────────────────────
DROP POLICY IF EXISTS "room_select" ON public.room_master;
CREATE POLICY "room_select" ON public.room_master FOR SELECT USING (is_active_user());

-- ── inspections ────────────────────────────
DROP POLICY IF EXISTS "inspection_select" ON public.inspections;
DROP POLICY IF EXISTS "inspection_insert" ON public.inspections;
DROP POLICY IF EXISTS "inspection_update" ON public.inspections;

CREATE POLICY "inspection_select" ON public.inspections FOR SELECT
  USING (
    is_manager()
    OR (is_active_user() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'facility'
    ))
    OR (is_active_user() AND auth.uid() = author_id)
  );

CREATE POLICY "inspection_insert" ON public.inspections FOR INSERT
  WITH CHECK (
    is_manager()
    OR (is_active_user() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'maid'
    ))
  );

CREATE POLICY "inspection_update" ON public.inspections FOR UPDATE
  USING (is_manager() OR (is_active_user() AND auth.uid() = author_id));

-- ── inspection_images ──────────────────────
DROP POLICY IF EXISTS "insp_img_select" ON public.inspection_images;
DROP POLICY IF EXISTS "insp_img_insert" ON public.inspection_images;
CREATE POLICY "insp_img_select" ON public.inspection_images FOR SELECT USING (is_active_user());
CREATE POLICY "insp_img_insert" ON public.inspection_images FOR INSERT WITH CHECK (is_active_user());

-- ── defects ────────────────────────────────
DROP POLICY IF EXISTS "defect_select" ON public.defects;
DROP POLICY IF EXISTS "defect_insert" ON public.defects;
DROP POLICY IF EXISTS "defect_update" ON public.defects;

CREATE POLICY "defect_select" ON public.defects FOR SELECT USING (is_active_user());

CREATE POLICY "defect_insert" ON public.defects FOR INSERT
  WITH CHECK (
    is_manager()
    OR (is_active_user() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'maid'
    ))
  );

CREATE POLICY "defect_update" ON public.defects FOR UPDATE
  USING (is_manager() OR (is_active_user() AND auth.uid() = author_id));

-- ── defect_images ──────────────────────────
DROP POLICY IF EXISTS "defect_img_select" ON public.defect_images;
DROP POLICY IF EXISTS "defect_img_insert" ON public.defect_images;
CREATE POLICY "defect_img_select" ON public.defect_images FOR SELECT USING (is_active_user());
CREATE POLICY "defect_img_insert" ON public.defect_images FOR INSERT WITH CHECK (is_active_user());

-- ── 마스터 데이터 (divisions / locations / categories / facility_types) ────────
DROP POLICY IF EXISTS "div_select" ON public.defect_divisions;
DROP POLICY IF EXISTS "loc_select" ON public.defect_locations;
DROP POLICY IF EXISTS "cat_select" ON public.defect_categories;
DROP POLICY IF EXISTS "ft_select"  ON public.facility_types;
CREATE POLICY "div_select" ON public.defect_divisions  FOR SELECT USING (is_active_user());
CREATE POLICY "loc_select" ON public.defect_locations  FOR SELECT USING (is_active_user());
CREATE POLICY "cat_select" ON public.defect_categories FOR SELECT USING (is_active_user());
CREATE POLICY "ft_select"  ON public.facility_types    FOR SELECT USING (is_active_user());

-- ── facility_orders ────────────────────────
DROP POLICY IF EXISTS "fo_select" ON public.facility_orders;
DROP POLICY IF EXISTS "fo_insert" ON public.facility_orders;
DROP POLICY IF EXISTS "fo_update" ON public.facility_orders;

CREATE POLICY "fo_select" ON public.facility_orders FOR SELECT USING (is_active_user());

CREATE POLICY "fo_insert" ON public.facility_orders FOR INSERT
  WITH CHECK (
    is_manager()
    OR (is_active_user() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'facility'
    ))
  );

CREATE POLICY "fo_update" ON public.facility_orders FOR UPDATE
  USING (
    is_manager()
    OR (is_active_user() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'facility'
    ))
  );

-- ── facility_order_images ──────────────────
DROP POLICY IF EXISTS "fo_img_select" ON public.facility_order_images;
DROP POLICY IF EXISTS "fo_img_insert" ON public.facility_order_images;
CREATE POLICY "fo_img_select" ON public.facility_order_images FOR SELECT USING (is_active_user());
CREATE POLICY "fo_img_insert" ON public.facility_order_images FOR INSERT WITH CHECK (is_active_user());

-- ── facility_order_log ─────────────────────
DROP POLICY IF EXISTS "fo_log_select" ON public.facility_order_log;
DROP POLICY IF EXISTS "fo_log_insert" ON public.facility_order_log;
CREATE POLICY "fo_log_select" ON public.facility_order_log FOR SELECT USING (is_active_user());
CREATE POLICY "fo_log_insert" ON public.facility_order_log FOR INSERT WITH CHECK (is_active_user());

-- ── notices ────────────────────────────────
DROP POLICY IF EXISTS "notice_select" ON public.notices;
CREATE POLICY "notice_select" ON public.notices FOR SELECT USING (is_active_user());

-- ── notice_images ──────────────────────────
DROP POLICY IF EXISTS "notice_img_select" ON public.notice_images;
CREATE POLICY "notice_img_select" ON public.notice_images FOR SELECT USING (is_active_user());

-- ── notice_comments ────────────────────────
DROP POLICY IF EXISTS "comment_select" ON public.notice_comments;
DROP POLICY IF EXISTS "comment_insert" ON public.notice_comments;
DROP POLICY IF EXISTS "comment_update" ON public.notice_comments;
DROP POLICY IF EXISTS "comment_delete" ON public.notice_comments;
CREATE POLICY "comment_select" ON public.notice_comments FOR SELECT USING (is_active_user());
CREATE POLICY "comment_insert" ON public.notice_comments FOR INSERT WITH CHECK (is_active_user());
CREATE POLICY "comment_update" ON public.notice_comments FOR UPDATE
  USING (is_active_user() AND auth.uid() = author_id);
CREATE POLICY "comment_delete" ON public.notice_comments FOR DELETE
  USING ((is_active_user() AND auth.uid() = author_id) OR is_manager());

-- ── notice_reads ───────────────────────────
DROP POLICY IF EXISTS "nread_select" ON public.notice_reads;
DROP POLICY IF EXISTS "nread_insert" ON public.notice_reads;
CREATE POLICY "nread_select" ON public.notice_reads FOR SELECT
  USING (is_active_user() AND auth.uid() = user_id);
CREATE POLICY "nread_insert" ON public.notice_reads FOR INSERT
  WITH CHECK (is_active_user() AND auth.uid() = user_id);

-- ── push_subscriptions ─────────────────────
DROP POLICY IF EXISTS "push_select" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_insert" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_update" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_delete" ON public.push_subscriptions;
CREATE POLICY "push_select" ON public.push_subscriptions FOR SELECT
  USING (is_active_user() AND auth.uid() = user_id);
CREATE POLICY "push_insert" ON public.push_subscriptions FOR INSERT
  WITH CHECK (is_active_user() AND auth.uid() = user_id);
CREATE POLICY "push_update" ON public.push_subscriptions FOR UPDATE
  USING (is_active_user() AND auth.uid() = user_id);
CREATE POLICY "push_delete" ON public.push_subscriptions FOR DELETE
  USING (is_active_user() AND auth.uid() = user_id);

-- ── page_settings ──────────────────────────
DROP POLICY IF EXISTS "ps_select" ON public.page_settings;
DROP POLICY IF EXISTS "ps_insert" ON public.page_settings;
DROP POLICY IF EXISTS "ps_update" ON public.page_settings;
DROP POLICY IF EXISTS "ps_delete" ON public.page_settings;
CREATE POLICY "ps_select" ON public.page_settings FOR SELECT
  USING (is_active_user() AND auth.uid() = user_id);
CREATE POLICY "ps_insert" ON public.page_settings FOR INSERT
  WITH CHECK (is_active_user() AND auth.uid() = user_id);
CREATE POLICY "ps_update" ON public.page_settings FOR UPDATE
  USING (is_active_user() AND auth.uid() = user_id);
CREATE POLICY "ps_delete" ON public.page_settings FOR DELETE
  USING (is_active_user() AND auth.uid() = user_id);

-- =============================================
-- 완료
-- 이 마이그레이션 적용 후:
--   - is_manager() : is_active=true 계정만 관리자 권한 획득
--   - is_active_user() : 모든 데이터 조회/삽입 게이트 역할
--   - 비활성(is_active=false) 계정의 기존 세션은 데이터 접근 즉시 차단
-- =============================================
