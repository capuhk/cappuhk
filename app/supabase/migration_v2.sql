-- =============================================
-- Migration v2 — 설계 변경사항 반영
-- Supabase Dashboard > SQL Editor 에서 실행
-- =============================================

BEGIN;

-- ─────────────────────────────────────────────
-- 1. facility_orders 상태값 변경
--    접수 → 접수대기 / 진행중 → 접수중
-- ─────────────────────────────────────────────

-- 기존 데이터 마이그레이션
UPDATE public.facility_orders SET status = '접수대기' WHERE status = '접수';
UPDATE public.facility_orders SET status = '접수중'   WHERE status = '진행중';

-- CHECK 제약 교체
ALTER TABLE public.facility_orders
  DROP CONSTRAINT IF EXISTS facility_orders_status_check;

ALTER TABLE public.facility_orders
  ADD CONSTRAINT facility_orders_status_check
  CHECK (status IN ('접수대기', '접수중', '완료'));

-- DEFAULT 값 변경
ALTER TABLE public.facility_orders
  ALTER COLUMN status SET DEFAULT '접수대기';

-- ─────────────────────────────────────────────
-- 2. 이미지 thumb_path NULL 허용
--    만료 후 Storage 파일 삭제 시 NULL로 업데이트
-- ─────────────────────────────────────────────
ALTER TABLE public.inspection_images
  ALTER COLUMN thumb_path DROP NOT NULL;

ALTER TABLE public.facility_order_images
  ALTER COLUMN thumb_path DROP NOT NULL;

COMMIT;
