-- =============================================
-- Supabase Cron 설정
-- 실행 위치: Supabase Dashboard > SQL Editor
--
-- 사전 요구사항:
--   pg_cron, pg_net 익스텐션 활성화
--   Dashboard > Database > Extensions 에서 활성화
-- =============================================

-- pg_cron 익스텐션 활성화 (이미 활성화된 경우 무시됨)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────────────────────────────────────
-- 이미지 자동삭제 Cron
-- 매일 03:00 KST = 18:00 UTC
-- ─────────────────────────────────────────────
SELECT cron.schedule(
  'auto-delete-images',          -- job 이름
  '0 18 * * *',                  -- 매일 18:00 UTC (= 03:00 KST)
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'project_url') || '/functions/v1/auto-delete-images',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret
                                     FROM vault.decrypted_secrets
                                     WHERE name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ─────────────────────────────────────────────
-- Cron 등록 확인
-- ─────────────────────────────────────────────
-- SELECT * FROM cron.job WHERE jobname = 'auto-delete-images';

-- ─────────────────────────────────────────────
-- Cron 삭제 (필요 시)
-- ─────────────────────────────────────────────
-- SELECT cron.unschedule('auto-delete-images');
