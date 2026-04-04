import { useNavigate } from 'react-router-dom'
import { Menu, ArrowLeft, Bell, RefreshCw } from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'
import useNotificationStore from '../../store/useNotificationStore'
import useRefreshStore from '../../store/useRefreshStore'

// ─────────────────────────────────────────────
// AppHeader — 상단 고정 헤더
//
// 좌측: 햄버거(메인탭) or 뒤로가기(하위화면)
// 중앙: 화면 타이틀
// 우측: 새로고침 🔄 → 알림 🔔(뱃지) → 로그아웃
// ─────────────────────────────────────────────
export default function AppHeader({ title, isMainTab = false, onMenuClick }) {
  const navigate = useNavigate()
  const { user, isManager, logout } = useAuthStore()

  const { unreadCount, openDrawer } = useNotificationStore()
  const triggerRefresh = useRefreshStore((s) => s.triggerRefresh)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  // 벨 클릭 → 드로어 열기 (항목 로드 포함)
  const handleBellClick = () => {
    if (user) openDrawer(user.id, isManager(), user.role)
  }

  return (
    <header className="fixed top-0 right-0 z-40 h-14 bg-zinc-900 border-b border-white/10
      flex items-center px-2 left-0 lg:left-60">

      {/* 좌측: 햄버거(메인탭) or 뒤로가기(하위화면) */}
      <button
        onClick={isMainTab ? onMenuClick : () => navigate(-1)}
        className="w-10 h-10 flex items-center justify-center rounded-lg
          text-white/70 hover:bg-white/10 active:scale-95 transition-all"
      >
        {isMainTab ? <Menu size={22} /> : <ArrowLeft size={22} />}
      </button>

      {/* 중앙: 화면 타이틀 */}
      <h1 className="flex-1 text-center text-white font-semibold text-base truncate px-2">
        {title}
      </h1>

      {/* 우측: 새로고침 + 알림 벨 + 로그아웃 */}
      <div className="flex items-center gap-0.5">
        {/* 새로고침 버튼 */}
        <button
          onClick={triggerRefresh}
          className="w-9 h-9 flex items-center justify-center rounded-lg
            text-white/40 hover:text-white/70 hover:bg-white/10 active:scale-95 transition-all"
          title="새로고침"
        >
          <RefreshCw size={16} />
        </button>

        {/* 알림 벨 */}
        <button
          onClick={handleBellClick}
          className="relative w-9 h-9 flex items-center justify-center rounded-lg
            text-white/50 hover:text-white/80 hover:bg-white/10 active:scale-95 transition-all"
          title="알림"
        >
          <Bell size={18} />
          {/* 안 읽은 알림 뱃지 */}
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1 min-w-[16px] h-4 px-0.5
              rounded-full bg-red-500 text-white text-[10px] font-bold
              flex items-center justify-center leading-none pointer-events-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* 로그아웃 */}
        <button
          onClick={handleLogout}
          className="px-2.5 h-9 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          나가기
        </button>
      </div>
    </header>
  )
}
