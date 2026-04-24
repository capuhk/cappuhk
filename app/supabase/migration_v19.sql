-- migration_v19: users 테이블에 is_deleted 컬럼 추가 (소프트 삭제)
-- 실제 row 삭제 없이 is_deleted=true 로 비활성화
-- 해당 직원이 작성한 인스펙션·시설오더 등 데이터는 그대로 보존

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- 삭제된 직원은 목록에서 숨김 (is_deleted=false 인 경우만 조회)
-- RLS: 기존 정책 그대로 유지 (is_deleted 필터는 앱 레이어에서 처리)
