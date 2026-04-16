import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  X, FileSearch, BookOpen, Users,
  BarChart2, Settings, LogOut, ChevronDown,
  ClipboardList, AlertTriangle, Wrench, Hotel,
} from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'

// 메인 업무 탭 — 역할별 표시 제어 (PC 사이드바용)
const MAIN_TABS = [
  {
    path: '/inspection',
    label: '인스펙션',
    Icon: ClipboardList,
    roles: ['admin', 'manager', 'supervisor'],
  },
  {
    path: '/defect',
    label: '객실하자',
    Icon: AlertTriangle,
    roles: ['admin', 'manager', 'supervisor', 'maid', 'facility'],
  },
  {
    path: '/facility-order',
    label: '오더',
    Icon: Wrench,
    roles: ['admin', 'manager', 'supervisor', 'maid', 'facility', 'houseman', 'front'],
  },
]

// 사이드 메뉴 항목 — managerOnly: 관리자·소장·주임만 표시
// 게시판은 noticeReadRoles 정책으로 동적 제어 (하드코딩 제거)
const MENU_ITEMS = [
  { path: '/inspection-review', label: '인스펙션조회', Icon: FileSearch, managerOnly: true },
  { path: '/notice',            label: '게시판',       Icon: BookOpen,   managerOnly: false, noticeGuard: true },
  { path: '/staff',             label: '직원목록',     Icon: Users,      managerOnly: false },
  { path: '/rooms',             label: '객실현황',     Icon: Hotel,     managerOnly: false },
  { path: '/dashboard',         label: '통계/대시보드', Icon: BarChart2,  managerOnly: true },
  { path: '/settings',          label: '설정',         Icon: Settings,   managerOnly: false, excludeRoles: ['houseman', 'front'] },
]

export default function SideMenu({ open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, isManager, noticeReadRoles } = useAuthStore()
  const [accountOpen, setAccountOpen] = useState(false)

  const handleNav = (path) => {
    navigate(path)
    onClose()
  }

  const handleLogout = async () => {
    onClose()
    await logout()
    navigate('/login', { replace: true })
  }

  // 게시판 접근 가능 여부 — 관리자급은 항상 허용, 그 외는 noticeReadRoles 정책 기준
  const canAccessNotice = isManager() ||
    (noticeReadRoles !== null && noticeReadRoles.includes(user?.role))

  // 권한별 메뉴 필터링
  const visibleTabs  = MAIN_TABS.filter((tab) => tab.roles.includes(user?.role))
  const visibleItems = MENU_ITEMS.filter((item) => {
    if (item.managerOnly && !isManager()) return false
    if (item.excludeRoles?.includes(user?.role)) return false
    if (item.noticeGuard) return canAccessNotice
    return true
  })

  return (
    <>
      {/* 배경 오버레이 — 모바일·태블릿에서만 표시 */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* 드로어 본체 — PC에서는 항상 표시 */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-60 bg-zinc-900 border-r border-white/10
          flex flex-col transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/10 shrink-0">
          <span className="text-white font-bold text-base tracking-wide">하우스키핑</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              text-white/40 hover:bg-white/10 transition-colors lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* 메뉴 목록 */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {/* 메인 업무 탭 — PC에서만 표시 (모바일은 BottomTabBar) */}
          <div className="hidden lg:block">
            <p className="px-4 pt-2 pb-1 text-xs text-white/25 uppercase tracking-wider">업무</p>
            {visibleTabs.map(({ path, label, Icon }) => {
              const active = location.pathname.startsWith(path)
              return (
                <button
                  key={path}
                  onClick={() => handleNav(path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors
                    ${active
                      ? 'bg-white/10 text-white font-semibold'
                      : 'text-white/55 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              )
            })}
            <p className="px-4 pt-3 pb-1 text-xs text-white/25 uppercase tracking-wider">메뉴</p>
          </div>

          {visibleItems.map(({ path, label, Icon }) => {
            const active = location.pathname.startsWith(path)
            return (
              <button
                key={path}
                onClick={() => handleNav(path)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors
                  ${active
                    ? 'bg-white/10 text-white font-semibold'
                    : 'text-white/55 hover:bg-white/5 hover:text-white'
                  }`}
              >
                <Icon size={18} />
                {label}
              </button>
            )
          })}
        </nav>

        {/* 하단 계정 영역 */}
        <div className="border-t border-white/10 shrink-0">
          <button
            onClick={() => setAccountOpen((prev) => !prev)}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/5 transition-colors"
          >
            {/* 이름 첫 글자 아바타 */}
            <div className="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center
              text-blue-300 font-bold text-sm shrink-0">
              {user?.name?.[0] ?? '?'}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-white/40 text-xs truncate">{user?.role}</p>
            </div>
            <ChevronDown
              size={16}
              className={`text-white/40 transition-transform duration-200 shrink-0
                ${accountOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* 계정 드롭다운 */}
          {accountOpen && (
            <div className="border-t border-white/10">
              <button
                onClick={() => handleNav('/settings')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm
                  text-white/55 hover:bg-white/5 hover:text-white transition-colors"
              >
                <Settings size={16} />
                내 정보 수정
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm
                  text-red-400 hover:bg-white/5 transition-colors"
              >
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
