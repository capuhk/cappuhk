import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// TTL 상수 — 24시간 이내 캐시는 Supabase 통신 없음
// ─────────────────────────────────────────────
const TTL_MS = 24 * 60 * 60 * 1000

// ─────────────────────────────────────────────
// localStorage 캐시 키 상수
// ─────────────────────────────────────────────
export const CACHE_KEYS = {
  rooms:              'cache_room_master',
  users:              'cache_users',
  defectDivisions:    'cache_defect_divisions',
  defectLocations:    'cache_defect_locations',
  defectCategories:   'cache_defect_categories',
  facilityTypes:      'cache_facility_types',
  inspectionStatuses: 'cache_inspection_statuses',
  appPolicies:        'cache_app_policies',
}

// ─────────────────────────────────────────────
// 각 캐시 키에 대응하는 Supabase fetch 함수
// ─────────────────────────────────────────────
const FETCHERS = {
  [CACHE_KEYS.rooms]: () =>
    supabase
      .from('room_master')
      .select('id, floor, room_no, sort_order')
      .eq('is_active', true)
      .order('sort_order'),

  [CACHE_KEYS.users]: () =>
    supabase
      .from('users')
      .select('id, name, role, avatar_url, is_active')
      .eq('is_active', true)
      .order('name'),

  [CACHE_KEYS.defectDivisions]: () =>
    supabase
      .from('defect_divisions')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order'),

  [CACHE_KEYS.defectLocations]: () =>
    supabase
      .from('defect_locations')
      .select('id, division_id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order'),

  [CACHE_KEYS.defectCategories]: () =>
    supabase
      .from('defect_categories')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order'),

  [CACHE_KEYS.facilityTypes]: () =>
    supabase
      .from('facility_types')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order'),

  [CACHE_KEYS.inspectionStatuses]: () =>
    supabase
      .from('inspection_statuses')
      .select('id, name, color, sort_order')
      .order('sort_order'),

  [CACHE_KEYS.appPolicies]: () =>
    supabase
      .from('app_policies')
      .select('key, value'),
}

// ─────────────────────────────────────────────
// 캐시 읽기 — TTL 초과 시 null 반환
// 저장 포맷: { data: [...], cachedAt: timestamp }
// ─────────────────────────────────────────────
const readCache = (key) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, cachedAt } = JSON.parse(raw)
    if (Date.now() - cachedAt > TTL_MS) return null // 24시간 만료
    return data
  } catch {
    return null // 파싱 오류 시 캐시 없는 것으로 처리
  }
}

// ─────────────────────────────────────────────
// 캐시 쓰기 — 현재 시각(cachedAt)과 함께 저장
// ─────────────────────────────────────────────
const writeCache = (key, data) => {
  localStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() }))
}

// ─────────────────────────────────────────────
// Supabase fetch 후 캐시에 저장 (내부 전용)
// ─────────────────────────────────────────────
const fetchAndCache = async (key) => {
  const fetcher = FETCHERS[key]
  if (!fetcher) throw new Error(`알 수 없는 캐시 키: ${key}`)

  const { data, error } = await fetcher()
  if (error) throw error

  writeCache(key, data)
  return data
}

// ─────────────────────────────────────────────
// getMasterData — TTL 기반 캐시
//
// 동작:
//   1. 24시간 이내 캐시 있음 → 즉시 반환 (통신 0건)
//   2. 캐시 없음 or TTL 만료 → fetch 후 저장 → 반환
//
// 효과:
//   - 메이드분들이 하루 1,000번 켜도 마스터 fetch는 최대 1회
//   - 오프라인 구역에서도 24시간 이내 캐시라면 즉시 폼 열림
// ─────────────────────────────────────────────
export const getMasterData = async (key) => {
  const cached = readCache(key)
  if (cached) return cached // TTL 내: Supabase 통신 없음

  // TTL 만료 or 첫 접속: 새로 fetch
  return fetchAndCache(key)
}

// ─────────────────────────────────────────────
// invalidateCache — 관리자가 데이터 변경 시 호출
// 해당 키 캐시 삭제 후 즉시 1회 재fetch → 관리자 화면 즉시 갱신
// 다른 직원들은 다음 접속 시 TTL 만료로 자동 갱신
// ─────────────────────────────────────────────
export const invalidateCache = async (key) => {
  localStorage.removeItem(key)
  return fetchAndCache(key)
}

// ─────────────────────────────────────────────
// clearAllCache — 로그아웃 시 호출 (계정 오염 방지)
// 전체 삭제만 수행 (re-fetch 없음)
// ─────────────────────────────────────────────
export const clearAllCache = () => {
  Object.values(CACHE_KEYS).forEach((key) => {
    localStorage.removeItem(key)
  })
}
// ─────────────────────────────────────────────
// 캐시 동기 읽기 — 컴포넌트 초기 state에 활용
// TTL 이내면 즉시 데이터 반환, 아니면 null
// ─────────────────────────────────────────────
export const getCachedDataSync = (key) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, cachedAt } = JSON.parse(raw)
    if (Date.now() - cachedAt > TTL_MS) return null
    return data
  } catch { return null }
}

// ─────────────────────────────────────────────
// 정책 값 조회 헬퍼
// policies: [{key, value}, ...] 배열에서 key로 value 반환
// ─────────────────────────────────────────────
export const getPolicy = (policies, key, defaultValue = '') => {
  const found = (policies || []).find((p) => p.key === key)
  return found ? found.value : defaultValue
}
