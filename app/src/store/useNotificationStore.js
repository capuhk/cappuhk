import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// useNotificationStore — 전역 알림 상태
//
// 알림 종류:
//   - 공지사항 (notices) : 최근 20개
//   - 시설오더 (facility_orders) : 접수대기 최근 20개 (관리자만)
//
// 읽음 상태:
//   - localStorage key: `notif_read_{userId}` → JSON 배열 (읽은 item id 목록)
//   - 최초 로그인 기준점: `notif_init_{userId}` → ISO 타임스탬프
//     → 이 시각 이전 항목은 처음부터 읽은 것으로 간주 (초기 뱃지 폭탄 방지)
// ─────────────────────────────────────────────

const READ_PREFIX = 'notif_read_'
const INIT_PREFIX = 'notif_init_'

// 읽은 ID Set 로드
const loadReadIds = (userId) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_PREFIX + userId) || '[]'))
  } catch { return new Set() }
}

// 읽은 ID Set 저장
const saveReadIds = (userId, ids) => {
  localStorage.setItem(READ_PREFIX + userId, JSON.stringify([...ids]))
}

// 최초 기준 시각 로드 (없으면 지금 시각으로 초기화)
const getInitTime = (userId) => {
  const key = INIT_PREFIX + userId
  let val = localStorage.getItem(key)
  if (!val) {
    val = new Date().toISOString()
    localStorage.setItem(key, val)
  }
  return val
}

// 알림 항목 구조: { id, rawId, type, title, url, created_at }
// id = 'notice_{uuid}' 또는 'fo_{uuid}' (읽음 추적용 고유 키)

const useNotificationStore = create((set, get) => ({
  items:       [],
  unreadCount: 0,
  drawerOpen:  false,
  loading:     false,

  // ── 드로어 열기 ───────────────────────────────
  openDrawer: async (userId, isManager, userRole) => {
    set({ drawerOpen: true })
    // 항목이 없으면 로드, 있으면 그대로 표시
    if (get().items.length === 0) {
      await get()._fetchItems(userId, isManager, userRole)
    }
  },

  // ── 드로어 닫기 ──────────────────────────────
  closeDrawer: () => set({ drawerOpen: false }),

  // ── 항목 새로고침 (드로어 안에서 수동 재조회) ───
  refreshItems: async (userId, isManager, userRole) => {
    await get()._fetchItems(userId, isManager, userRole)
  },

  // ── 항목 로드 (내부) ──────────────────────────
  _fetchItems: async (userId, isManager, userRole) => {
    set({ loading: true })

    const initTime = getInitTime(userId)
    const items    = []

    // 공지사항 최근 20개 — target_roles 포함 조회
    const { data: noticeData } = await supabase
      .from('notices')
      .select('id, title, target_roles, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    // 관리자는 전체, 그 외는 공개 대상 필터 적용
    const notices = (noticeData || []).filter((n) =>
      isManager || !n.target_roles?.length || n.target_roles.includes(userRole)
    )

    for (const n of notices) {
      items.push({
        id:         `notice_${n.id}`,
        rawId:      n.id,
        type:       'notice',
        title:      n.title,
        url:        `/notice/${n.id}`,
        created_at: n.created_at,
      })
    }

    // 관리자: 시설오더 접수대기 최근 20개
    if (isManager) {
      const { data: orders } = await supabase
        .from('facility_orders')
        .select('id, room_no, facility_type_name, created_at')
        .eq('status', '접수대기')
        .order('created_at', { ascending: false })
        .limit(20)

      for (const o of orders || []) {
        items.push({
          id:         `fo_${o.id}`,
          rawId:      o.id,
          type:       'facility_order',
          title:      `[시설오더] ${o.room_no}호 ${o.facility_type_name || ''}`.trim(),
          url:        `/facility-order/${o.id}`,
          created_at: o.created_at,
        })
      }
    }

    // 최신순 정렬
    items.sort((a, b) => b.created_at.localeCompare(a.created_at))

    const readIds    = loadReadIds(userId)
    // initTime 이전 항목은 자동으로 읽음 처리 (뱃지 폭탄 방지)
    // created_at이 없는 항목은 읽음 처리 (undefined 비교 오작동 방지)
    const unreadCount = items.filter(
      (i) => i.created_at && i.created_at > initTime && !readIds.has(i.id)
    ).length

    set({ items, unreadCount, loading: false })
  },

  // ── 앱 초기 뱃지 카운트만 계산 (드로어 미열어도 표시) ──
  initBadge: async (userId, isManager, userRole) => {
    const initTime = getInitTime(userId)
    const readIds  = loadReadIds(userId)
    let unread = 0

    // target_roles 포함 조회 후 클라이언트 필터
    const { data: noticeData } = await supabase
      .from('notices')
      .select('id, target_roles, created_at')
      .gt('created_at', initTime)
      .order('created_at', { ascending: false })
      .limit(20)

    const notices = (noticeData || []).filter((n) =>
      isManager || !n.target_roles?.length || n.target_roles.includes(userRole)
    )

    for (const n of notices) {
      if (!readIds.has(`notice_${n.id}`)) unread++
    }

    if (isManager) {
      const { data: orders } = await supabase
        .from('facility_orders')
        .select('id, created_at')
        .eq('status', '접수대기')
        .gt('created_at', initTime)
        .order('created_at', { ascending: false })
        .limit(20)

      for (const o of orders || []) {
        if (!readIds.has(`fo_${o.id}`)) unread++
      }
    }

    set({ unreadCount: unread })
  },

  // ── 항목 하나 읽음 처리 ───────────────────────
  markRead: (userId, itemId) => {
    const readIds = loadReadIds(userId)
    if (readIds.has(itemId)) return
    readIds.add(itemId)
    saveReadIds(userId, readIds)

    const initTime = getInitTime(userId)
    const items    = get().items
    const unreadCount = items.filter(
      (i) => i.created_at && i.created_at > initTime && !readIds.has(i.id)
    ).length
    set({ unreadCount })
  },

  // ── 전체 읽음 처리 ────────────────────────────
  markAllRead: (userId) => {
    const readIds = new Set(get().items.map((i) => i.id))
    saveReadIds(userId, readIds)
    set({ unreadCount: 0 })
  },

  // ── 로그아웃 시 상태 초기화 ───────────────────
  reset: () => set({ items: [], unreadCount: 0, drawerOpen: false, loading: false }),
}))

export default useNotificationStore
