import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────
// auto-delete-images Edge Function
// Cron: 매일 03:00 KST (= 18:00 UTC)
//
// 정책: Storage 파일만 삭제, DB 레코드 유지
//   - inspection_images       : app_policies 에서 보존 일수 읽기 (기본 20일)
//   - facility_order_images   : app_policies 에서 보존 일수 읽기 (기본 60일)
// ─────────────────────────────────────────────

Deno.serve(async () => {
  // Service Role Key로 RLS 우회
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 운영 정책에서 보존 일수 읽기 ──────────────
  const { data: policyRows } = await supabase
    .from('app_policies')
    .select('key, value')
    .in('key', ['inspection_photo_days', 'defect_facility_photo_days'])

  const policyMap: Record<string, string> = {}
  for (const row of policyRows ?? []) policyMap[row.key] = row.value

  const inspectionDays      = parseInt(policyMap['inspection_photo_days']         ?? '20', 10)
  const defectFacilityDays  = parseInt(policyMap['defect_facility_photo_days']    ?? '60', 10)

  const results: Record<string, unknown> = {}

  // ── 인스펙션 이미지 ───────────────────────────
  results.inspections = await deleteExpiredImages(supabase, {
    table:  'inspection_images',
    bucket: 'thumb-inspections',
    days:   inspectionDays,
  })

  // ── 시설오더 이미지 ───────────────────────────
  results.facilityOrders = await deleteExpiredImages(supabase, {
    table:  'facility_order_images',
    bucket: 'thumb-facility-orders',
    days:   defectFacilityDays,
  })

  console.log('[auto-delete-images] 완료:', JSON.stringify({
    ...results,
    policy: { inspectionDays, defectFacilityDays },
  }))

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ─────────────────────────────────────────────
// 공통 삭제 처리 함수
// ─────────────────────────────────────────────
async function deleteExpiredImages(
  supabase: ReturnType<typeof createClient>,
  opts: { table: string; bucket: string; days: number },
) {
  const { table, bucket, days } = opts

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const { data: rows, error: fetchError } = await supabase
    .from(table)
    .select('id, thumb_path')
    .not('thumb_path', 'is', null)
    .lt('created_at', cutoff.toISOString())

  if (fetchError) return { error: fetchError.message }
  if (!rows || rows.length === 0) return { deleted: 0 }

  const paths = rows.map((r) => r.thumb_path as string)
  const CHUNK = 100
  let storageErrors = 0

  for (let i = 0; i < paths.length; i += CHUNK) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + CHUNK))
    if (error) storageErrors++
  }

  const ids = rows.map((r) => r.id)
  const { error: updateError } = await supabase
    .from(table)
    .update({ thumb_path: null })
    .in('id', ids)

  if (updateError) return { error: updateError.message, storageErrors }

  return { deleted: rows.length, storageErrors }
}
