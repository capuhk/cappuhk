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

// ── 홈화면 앱 아이콘 뱃지 갱신 헬퍼 ─────────────
// Web App Badging API — 미지원 브라우저는 조용히 무시
const setNativeBadge = (count) => {
  if (!('setAppBadge' in navigator)) return
  if (count > 0) {
    navigator.setAppBadge(count).catch(() => {})
  } else {
    navigator.clearAppBadge().catch(() => {})
  }
}

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
  // notification_reads도 반영해서 개별 읽음 처리된 항목 제외
  _refreshBadge: async (userId, isManager, userRole) => {
    // notif_last_read_at + notification_reads 병렬 조회
    const [{ data: userData }, { data: readData }] = await Promise.all([
      supabase.from('users').select('notif_last_read_at').eq('id', userId).single(),
      supabase.from('notification_reads').select('item_id').eq('user_id', userId),
    ])

    const lastReadAt = userData?.notif_last_read_at

    // 첫 로그인(NULL): now()로 초기화 후 뱃지 0 (폭탄 방지)
    if (!lastReadAt) {
      await supabase
        .from('users')
        .update({ notif_last_read_at: new Date().toISOString() })
        .eq('id', userId)
      setNativeBadge(0)
      set({ unreadCount: 0 })
      return
    }

    // 이미 읽은 item_id 세트
    const readSet = new Set((readData || []).map((r) => r.item_id))

    // 공지(is_pinned=true) — lastReadAt 이후, 미읽음만 카운트
    const { data: noticeData } = await supabase
      .from('notices')
      .select('id, target_roles')
      .eq('is_pinned', true)
      .gt('created_at', lastReadAt)

    let count = 0
    for (const n of (noticeData || [])) {
      if (isManager || !n.target_roles?.length || n.target_roles.includes(userRole)) {
        if (!readSet.has(`notice_${n.id}`)) count++
      }
    }

    // 관리자: 접수대기(신규) + 완료 오더 — 미읽음만 카운트
    if (isManager) {
      const [{ data: newOrders }, { data: doneOrders }] = await Promise.all([
        supabase.from('facility_orders').select('id').eq('status', '접수대기').gt('created_at', lastReadAt),
        supabase.from('facility_orders').select('id').eq('status', '완료').gt('updated_at', lastReadAt),
      ])
      for (const o of (newOrders || [])) {
        if (!readSet.has(`fo_${o.id}_접수대기`)) count++
      }
      for (const o of (doneOrders || [])) {
        if (!readSet.has(`fo_${o.id}_완료`)) count++
      }
    }

    setNativeBadge(count)
    set({ unreadCount: count })
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
        // 완료 처리는 UPDATE 이벤트 — 뱃지 재조회
        { event: 'UPDATE', schema: 'public', table: 'facility_orders' },
        (payload) => {
          if (payload.new?.status === '완료') {
            get()._refreshBadge(userId, isManager, userRole)
          }
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

  // ── 드로어 닫기 — notif_last_read_at 갱신으로 뱃지 초기화 ──
  closeDrawer: async (userId) => {
    // 즉시 UI 닫기 (낙관적 업데이트)
    setNativeBadge(0)
    set({ drawerOpen: false, unreadCount: 0, items: [] })

    // DB 기준선 갱신 — 다음 _refreshBadge 호출 시 뱃지 0 유지
    if (userId) {
      const now = new Date().toISOString()
      await supabase
        .from('users')
        .update({ notif_last_read_at: now })
        .eq('id', userId)
      set({ lastReadAt: now })
    }
  },

  // ── 전체 읽음 처리 — 현재 목록 전체 notification_reads에 삽입 후 목록 비우기 ──
  markAllRead: async (userId) => {
    const { items } = get()
    const now = new Date().toISOString()

    // 현재 목록의 모든 항목을 읽음 처리 (upsert — 중복 무시)
    if (items.length > 0) {
      await supabase
        .from('notification_reads')
        .upsert(
          items.map((item) => ({ user_id: userId, item_id: item.id })),
          { onConflict: 'user_id,item_id' },
        )
    }

    // notif_last_read_at도 갱신 (뱃지 기준선)
    await supabase
      .from('users')
      .update({ notif_last_read_at: now })
      .eq('id', userId)

    setNativeBadge(0)
    set({ items: [], unreadCount: 0, lastReadAt: now })
  },

  // ── 드로어 항목 로드 (내부) ────────────────────
  _fetchItems: async (userId, isManager, userRole) => {
    set({ loading: true })

    // 읽음 기준점 스냅샷 + 개별 읽음 목록 — 병렬 조회
    const [{ data: userData }, { data: readData }] = await Promise.all([
      supabase.from('users').select('notif_last_read_at').eq('id', userId).single(),
      supabase.from('notification_reads').select('item_id').eq('user_id', userId),
    ])
    const lastReadAt = userData?.notif_last_read_at || null
    // 이미 읽은 item_id 세트 — 목록에서 제외
    const readSet = new Set((readData || []).map((r) => r.item_id))
    set({ lastReadAt })

    const allItems = []

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
      allItems.push({
        id:         `notice_${n.id}`,
        rawId:      n.id,
        type:       'notice',
        title:      n.title,
        url:        `/notice/${n.id}`,
        created_at: n.created_at,
      })
    }

    // 관리자: 접수대기(신규) + 완료 오더 최근 20개
    if (isManager) {
      const { data: orders } = await supabase
        .from('facility_orders')
        .select('id, room_no, location_type, facility_type_name, status, created_at, updated_at')
        .in('status', ['접수대기', '완료'])
        .order('updated_at', { ascending: false })
        .limit(20)

      for (const o of orders || []) {
        const isComplete = o.status === '완료'
        // 완료 오더는 updated_at 기준, 신규는 created_at 기준
        const eventTime = isComplete ? o.updated_at : o.created_at
        const location  = o.room_no ? `${o.room_no}호` : (o.location_type || '')
        const label     = isComplete ? `[완료] ${location} ${o.facility_type_name || ''}`.trim()
                                     : `[오더] ${location} ${o.facility_type_name || ''}`.trim()
        allItems.push({
          id:         `fo_${o.id}_${o.status}`,
          rawId:      o.id,
          type:       isComplete ? 'facility_order_complete' : 'facility_order',
          title:      label,
          url:        `/facility-order/${o.id}`,
          created_at: eventTime,
        })
      }
    }

    allItems.sort((a, b) => b.created_at.localeCompare(a.created_at))

    // 이미 읽은 항목 제외 + unreadCount를 실제 표시 항목 수로 동기화
    const items = allItems.filter((item) => !readSet.has(item.id))
    setNativeBadge(items.length)
    set({ items, loading: false, unreadCount: items.length })
  },

  // ── 개별 항목 읽음 처리 ───────────────────────
  markRead: async (userId, itemId) => {
    // DB에 읽음 기록 저장 (중복 무시)
    await supabase
      .from('notification_reads')
      .upsert({ user_id: userId, item_id: itemId }, { onConflict: 'user_id,item_id' })

    // 목록에서 즉시 제거 + 홈화면 뱃지 갱신
    set((s) => {
      const next = Math.max(0, s.unreadCount - 1)
      setNativeBadge(next)
      return { items: s.items.filter((i) => i.id !== itemId), unreadCount: next }
    })
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
