-- migration_v18: rooms 테이블에 clean_sts_text 컬럼 추가
-- WINGS CLEAN_STS_TEXT 필드 수집 (NG=청소중, OR=청소전 등)

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS clean_sts_text VARCHAR(5);
