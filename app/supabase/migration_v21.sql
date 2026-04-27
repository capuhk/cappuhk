-- migration_v21: 오더 접수자 컬럼 + 리마크 테이블

-- ── facility_orders.accepted_by 컬럼 추가 ────────────────────────
ALTER TABLE public.facility_orders
  ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES public.users(id);

-- ── facility_order_remarks 테이블 신규 ───────────────────────────
CREATE TABLE IF NOT EXISTS public.facility_order_remarks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_order_id UUID NOT NULL REFERENCES public.facility_orders(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES public.users(id),
  content           TEXT NOT NULL CHECK (char_length(content) > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Realtime 활성화
ALTER TABLE public.facility_order_remarks REPLICA IDENTITY FULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_fo_remarks_order_id
  ON public.facility_order_remarks(facility_order_id, created_at DESC);

-- RLS 활성화
ALTER TABLE public.facility_order_remarks ENABLE ROW LEVEL SECURITY;

-- 읽기: 로그인 사용자 전체
CREATE POLICY "remark_select" ON public.facility_order_remarks
  FOR SELECT TO authenticated USING (true);

-- 작성: 로그인 사용자 전체 (본인 author_id만)
CREATE POLICY "remark_insert" ON public.facility_order_remarks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- 삭제: 본인 또는 관리자·소장·주임
CREATE POLICY "remark_delete" ON public.facility_order_remarks
  FOR DELETE USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'supervisor')
    )
  );
