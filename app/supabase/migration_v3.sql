-- =============================================
-- Migration v3 — 아키텍처 리뷰 반영
-- 작성: 2026-03-28
-- Supabase Dashboard > SQL Editor 에서 실행
-- (migration_v2.sql 실행 완료 후 실행)
-- =============================================

BEGIN;

-- ─────────────────────────────────────────────
-- 1. defects.category_id (FK) → category (TEXT 스냅샷) 변환
--    division / location 과 저장 방식 통일
--    마스터 삭제·변경 시에도 기존 하자 기록의 분류명 보존
-- ─────────────────────────────────────────────

-- 1-1. 새 category 텍스트 컬럼 추가
ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 1-2. 기존 FK 데이터를 텍스트 스냅샷으로 마이그레이션
UPDATE public.defects d
SET category = (
  SELECT dc.name
  FROM public.defect_categories dc
  WHERE dc.id = d.category_id
)
WHERE d.category_id IS NOT NULL;

-- 1-3. 기존 category_id FK 컬럼 제거
ALTER TABLE public.defects
  DROP COLUMN IF EXISTS category_id;

-- ─────────────────────────────────────────────
-- 2. inspection_images.thumb_path NOT NULL 해제 확인
--    (migration_v2에서 처리됐어야 하지만 미적용 환경 대비)
-- ─────────────────────────────────────────────
ALTER TABLE public.inspection_images
  ALTER COLUMN thumb_path DROP NOT NULL;

-- ─────────────────────────────────────────────
-- 3. facility_order_images.thumb_path NOT NULL 해제 확인
-- ─────────────────────────────────────────────
ALTER TABLE public.facility_order_images
  ALTER COLUMN thumb_path DROP NOT NULL;

-- ─────────────────────────────────────────────
-- 4. facility_orders.status 값 통일 확인
--    (migration_v2에서 처리됐어야 하지만 미적용 환경 대비)
-- ─────────────────────────────────────────────
UPDATE public.facility_orders SET status = '접수대기' WHERE status = '접수';
UPDATE public.facility_orders SET status = '접수중'   WHERE status = '진행중';

ALTER TABLE public.facility_orders
  DROP CONSTRAINT IF EXISTS facility_orders_status_check;

ALTER TABLE public.facility_orders
  ADD CONSTRAINT facility_orders_status_check
  CHECK (status IN ('접수대기', '접수중', '완료'));

ALTER TABLE public.facility_orders
  ALTER COLUMN status SET DEFAULT '접수대기';

COMMIT;
