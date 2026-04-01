# Supabase 배포 가이드

## 1. Edge Function 배포

Supabase CLI 설치 후 아래 명령어 실행:

```bash
# Supabase CLI 설치 (최초 1회)
npm install -g supabase

# 로그인
supabase login

# 프로젝트 연결 (project-ref는 대시보드 URL에서 확인)
supabase link --project-ref pqvrhwlopmarhmimhjbp

# Edge Function 배포
supabase functions deploy auto-delete-images
```

## 2. Cron 등록

Supabase Dashboard > SQL Editor 에서 `cron.sql` 내용 실행

**사전 확인:**
- Dashboard > Database > Extensions > `pg_cron` ✅
- Dashboard > Database > Extensions > `pg_net` ✅

**Vault Secret 등록** (Dashboard > Settings > Vault):
- `project_url` : `https://pqvrhwlopmarhmimhjbp.supabase.co`
- `service_role_key` : Settings > API > service_role 키

## 3. 동작 확인

```sql
-- Cron 등록 확인
SELECT * FROM cron.job WHERE jobname = 'auto-delete-images';

-- 실행 이력 확인
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-delete-images')
ORDER BY start_time DESC
LIMIT 10;
```
