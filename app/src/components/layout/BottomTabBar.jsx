import { useLocation, useNavigate } from 'react-router-dom'
import { ClipboardList, AlertTriangle, Wrench } from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'

// 탭 정의 — roles: 해당 탭이 보이는 역할 목록
const TABS = [
  {
    path: '/inspection',
    label: '인스펙션',
    Icon: ClipboardList,
    roles: ['admin', 'manager', 'supervisor', 'maid'],
  },
  {
    path: '/defect',
    label: '객실하자',
    Icon: AlertTriangle,
    roles: ['admin', 'manager', 'supervisor', 'maid', 'facility'],
  },
  {
    path: '/facility-order',
    label: '시설오더',
    Icon: Wrench,
    roles: ['admin', 'manager', 'supervisor', 'facility'],
  },
]

// 하단 탭바 — 모바일·태블릿(~lg)에서만 표시
export default function BottomTabBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  // 역할에 따라 보이는 탭 필터링
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(user?.role))

  return (
    /* safe-area-inset-bottom 로 홈 인디케이터 영역 확장 */
    <nav className="fixed bottom-0 left-0 right-0 z-40
      bg-zinc-900 border-t border-white/10 flex flex-col lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex h-16 w-full">
      {visibleTabs.map(({ path, label, Icon }) => {
        const active = location.pathname.startsWith(path)
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors
              ${active ? 'text-blue-400' : 'text-white/40 hover:text-white/60'}`}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
            <span className="text-xs font-medium">{label}</span>
          </button>
        )
      })}
      </div>
    </nav>
  )
}
