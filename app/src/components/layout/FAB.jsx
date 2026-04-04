import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Pencil } from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'

// 목록 화면별 FAB 설정 (등록 버튼)
const FAB_CONFIG = {
  '/inspection':     { to: '/inspection/new',      roles: ['admin', 'manager', 'supervisor', 'maid'] },
  '/defect':         { to: '/defect/new',           roles: ['admin', 'manager', 'supervisor', 'maid'] },
  '/facility-order': { to: '/facility-order/new',   roles: ['admin', 'manager', 'supervisor', 'facility', 'houseman', 'front'] },
  '/notice':         { to: '/notice/new',           roles: ['admin', 'manager', 'supervisor'] },
  '/staff':          { to: '/settings/users/new',   roles: ['admin', 'manager', 'supervisor'] },
}

// FAB를 표시하지 않는 경로 접두사
const NO_FAB_PREFIXES = ['/dashboard', '/settings', '/login', '/inspection-review']

// 상세 화면 판별 정규식 (/:id 패턴, /edit 제외)
const DETAIL_RE = /^\/(inspection|defect|facility-order|notice)\/[^/]+$/

// 날짜·객실별 하위 목록 → 상위 목록 FAB 경로 매핑
const SUB_TO_PARENT = {
  '/inspection/date':     '/inspection',
  '/facility-order/date': '/facility-order',
  '/defect/room':         '/defect',
}

export default function FAB() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const pathname = location.pathname

  // FAB 미표시 경로 확인
  if (NO_FAB_PREFIXES.some((p) => pathname.startsWith(p))) return null

  // 등록·수정 화면에서는 FAB 미표시
  if (pathname.endsWith('/edit') || pathname.endsWith('/new')) return null

  // 상세 화면 → 수정 연필 FAB (시설 역할은 수정 불가)
  if (DETAIL_RE.test(pathname)) {
    if (user?.role === 'facility') return null
    return (
      <button
        onClick={() => navigate(`${pathname}/edit`)}
        className="fixed right-4 z-30 w-14 h-14 rounded-full
          bg-blue-500 hover:bg-blue-400 shadow-lg
          flex items-center justify-center active:scale-95 transition-all
          lg:bottom-6"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Pencil size={20} className="text-white" />
      </button>
    )
  }

  // 날짜·객실별 하위 목록 → 상위 경로 FAB 설정 적용
  let configKey = pathname
  for (const [prefix, parent] of Object.entries(SUB_TO_PARENT)) {
    if (pathname.startsWith(prefix)) {
      configKey = parent
      break
    }
  }

  const config = FAB_CONFIG[configKey]
  if (!config) return null

  // 역할 권한 확인
  if (!config.roles.includes(user?.role)) return null

  return (
    <button
      onClick={() => navigate(config.to)}
      className="fixed right-4 z-30 w-14 h-14 rounded-full
        bg-blue-500 hover:bg-blue-400 shadow-lg
        flex items-center justify-center active:scale-95 transition-all
        lg:bottom-6"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <Plus size={26} className="text-white" />
    </button>
  )
}
