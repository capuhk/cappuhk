import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// useNotificationStore — 전역 알림 상태
//
// 설계 원칙:
//   - 뱃지 카운트는 항상 DB 기준 (localStorage 사용 안 함)
//   - React는 표시만, FCM은 알림만
//   - Supabase Realtime으로 새 오더/공지 즉시 감지 → 뱃지 자동 갱신
//
// 읽음 기준:
//   - users.notif_last_read_at — 마지막으로 드로어를 닫은 시각
//   - NULL이면 첫 로그인 → now()로 초기화 (뱃지 폭탄 방지)
// ─────────────────────────────────────────────

const useNotificationStore = create((set, get) => ({
  items:       [],
  unreadCount: 0,
  drawerOpen:  false,
  loading:     false,
  lastReadAt:  null,  // 드로어 열릴 때 스냅샷 — 읽음 기준선
  _channel:    null,  // Realtime 채널 ref

  // ── 앱 마운트 시 초기화 — 뱃지 카운트 + Realtime 구독 ──
  init: async (userId, isManager, userRole) => {
    await get()._refreshBadge(userId, isManager, userRole)
    get()._subscribeRealtime(userId, isManager, userRole)
  },

  // ── DB에서 뱃지 카운트 재조회 ──────────────────
  _refreshBadge: async (userId, isManager, userRole) => {
    // users.notif_last_read_at 조회
    const { data: userData } = await supabase
      .from('users')
      .select('notif_last_read_at')
      .eq('id', userId)
      .single()

    const lastReadAt = userData?.notif_last_read_at

    // 첫 로그인(NULL): now()로 초기화 후 뱃지 0 (폭탄 방지)
    if (!lastReadAt) {
      await supabase
        .from('users')
        .update({ notif_last_read_at: new Date().toISOString() })
        .eq('id', userId)
      set({ unreadCount: 0 })
      return
    }

    // 공지(is_pinned=true) — lastReadAt 이후 등록된 것만 카운트
    const { data: noticeData } = await supabase
      .from('notices')
      .select('id, target_roles')
      .eq('is_pinned', true)
      .gt('created_at', lastReadAt)

    // 역할에 따라 볼 수 있는 공지만 필터
    const noticeCount = (noticeData || []).filter((n) =>
      isManager || !n.target_roles?.length || n.target_roles.includes(userRole)
    ).length

    // 관리자: 접수대기 오더 카운트
    let orderCount = 0
    if (isManager) {
      const { count } = await supabase
        .from('facility_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', '접수대기')
        .gt('created_at', lastReadAt)
      orderCount = count || 0
    }

    set({ unreadCount: noticeCount + orderCount })
  },

  // ── Supabase Realtime 구독 ─────────────────────
  // 새 오더/공지 INSERT 감지 → 뱃지 즉시 갱신
  _subscribeRealtime: (userId, isManager, userRole) => {
    // 기존 채널 정리 후 재구독
    const existing = get()._channel
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel('notif-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'facility_orders' },
        () => {
          // 새 오더 등록 → 뱃지 재조회
          get()._refreshBadge(userId, isManager, userRole)
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notices' },
        (payload) => {
          // 공지(is_pinned=true)만 뱃지 갱신
          if (payload.new?.is_pinned) {
            get()._refreshBadge(userId, isManager, userRole)
          }
        },
      )
      .subscribe()

    set({ _channel: channel })
  },

  // ── 드로어 열기 ───────────────────────────────
  openDrawer: async (userId, isManager, userRole) => {
    set({ drawerOpen: true })
    await get()._fetchItems(userId, isManager, userRole)
  },

  // ── 드로어 닫기 ──────────────────────────────
  closeDrawer: () => set({ drawerOpen: false }),

  // ── 전체 읽음 처리 — notif_last_read_at 업데이트 ──
  markAllRead: async (userId) => {
    const now = new Date().toISOString()
    await supabase
      .from('users')
      .update({ notif_last_read_at: now })
      .eq('id', userId)
    set({ unreadCount: 0, lastReadAt: now })
  },

  // ── 드로어 항목 로드 (내부) ────────────────────
  _fetchItems: async (userId, isManager, userRole) => {
    set({ loading: true })

    // 읽음 기준점 스냅샷 — 드로어 열릴 때 조회
    const { data: userData } = await supabase
      .from('users')
      .select('notif_last_read_at')
      .eq('id', userId)
      .single()
    const lastReadAt = userData?.notif_last_read_at || null
    set({ lastReadAt })

    const items = []

    // 공지(is_pinned=true) 최근 20개
    const { data: noticeData } = await supabase
      .from('notices')
      .select('id, title, target_roles, created_at')
      .eq('is_pinned', true)
      .order('created_at', { ascending: false })
      .limit(20)

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

    // 관리자: 접수대기 오더 최근 20개
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
          title:      `[오더] ${o.room_no ? o.room_no + '호 ' : ''}${o.facility_type_name || ''}`.trim(),
          url:        `/facility-order/${o.id}`,
          created_at: o.created_at,
        })
      }
    }

    items.sort((a, b) => b.created_at.localeCompare(a.created_at))
    set({ items, loading: false })
  },

  // ── 항목 새로고침 ─────────────────────────────
  refreshItems: async (userId, isManager, userRole) => {
    await get()._fetchItems(userId, isManager, userRole)
  },

  // ── 로그아웃 시 정리 ─────────────────────────
  reset: () => {
    const ch = get()._channel
    if (ch) supabase.removeChannel(ch)
    set({ items: [], unreadCount: 0, drawerOpen: false, loading: false, lastReadAt: null, _channel: null })
  },
}))

export default useNotificationStore
