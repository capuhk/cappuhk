import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Bell, RefreshCw, Loader2, Megaphone, Wrench } from 'lucide-react'
import dayjs from 'dayjs'
import useAuthStore from '../../store/useAuthStore'
import useNotificationStore from '../../store/useNotificationStore'

// ─────────────────────────────────────────────
// NotificationDrawer — 우측 슬라이드 알림 드로어
//
// 공지사항 + 시설오더(관리자) 최근 항목 표시
// 항목 클릭 → 상세 페이지 이동 + 읽음 처리
// ─────────────────────────────────────────────

export default function NotificationDrawer() {
  const navigate    = useNavigate()
  const { user, isManager } = useAuthStore()

  const {
    drawerOpen,
    items,
    unreadCount,
    loading,
    closeDrawer,
    markRead,
    markAllRead,
    refreshItems,
  } = useNotificationStore()

  // 드로어 열릴 때 배경 스크롤 막기
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  if (!drawerOpen) return null

  const userId = user?.id

  // 현재 읽지 않은 항목 판단 (initTime 이전은 읽은 것으로 간주)
  const initTime = userId
    ? localStorage.getItem(`notif_init_${userId}`) || ''
    : ''
  const readIds = (() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`notif_read_${userId}`) || '[]'))
    } catch { return new Set() }
  })()

  const isUnread = (item) => item.created_at > initTime && !readIds.has(item.id)

  // ── 항목 클릭 → 이동 + 읽음 ──────────────────
  const handleItemClick = (item) => {
    if (userId) markRead(userId, item.id)
    closeDrawer()
    navigate(item.url)
  }

  // ── 전체 읽음 ────────────────────────────────
  const handleMarkAll = () => {
    if (userId) markAllRead(userId)
  }

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={closeDrawer}
      />

      {/* 드로어 패널 */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-sm
        bg-zinc-900 border-l border-white/10 flex flex-col
        shadow-2xl animate-slide-in-right">

        {/* 헤더 */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <Bell size={18} className="text-white/60 shrink-0" />
          <h2 className="flex-1 text-sm font-semibold text-white">알림</h2>

          {/* 전체 읽음 버튼 */}
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1"
            >
              전체 읽음
            </button>
          )}

          {/* 새로고침 */}
          <button
            onClick={() => userId && refreshItems(userId, isManager())}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
          >
            {loading
              ? <Loader2 size={15} className="animate-spin" />
              : <RefreshCw size={15} />
            }
          </button>

          {/* 닫기 */}
          <button
            onClick={closeDrawer}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* 항목 목록 */}
        <div className="flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={22} className="text-white/30 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Bell size={28} className="text-white/15" />
              <p className="text-sm text-white/30">알림이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {items.map((item) => {
                const unread = isUnread(item)
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3
                      transition-colors hover:bg-white/5 active:bg-white/8
                      ${unread ? 'bg-white/[0.03]' : ''}`}
                  >
                    {/* 아이콘 */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5
                      ${item.type === 'notice'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-blue-500/15 text-blue-400'
                      }`}
                    >
                      {item.type === 'notice'
                        ? <Megaphone size={14} />
                        : <Wrench size={14} />
                      }
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug truncate
                        ${unread ? 'text-white font-medium' : 'text-white/60'}`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-white/30 mt-0.5">
                        {dayjs(item.created_at).format('M/D HH:mm')}
                      </p>
                    </div>

                    {/* 안 읽음 점 */}
                    {unread && (
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-2" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
