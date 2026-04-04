import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import AppHeader from './AppHeader'
import BottomTabBar from './BottomTabBar'
import SideMenu from './SideMenu'
import FAB from './FAB'
import NotificationDrawer from './NotificationDrawer'
import useAuthStore from '../../store/useAuthStore'
import useNotificationStore from '../../store/useNotificationStore'

// 메인 탭 경로 — 햄버거 버튼 표시 대상
const MAIN_TAB_PATHS = ['/inspection', '/defect', '/facility-order']

// 경로 → 화면 타이틀 매핑
const TITLE_MAP = {
  '/inspection':              '인스펙션',
  '/inspection/new':          '인스펙션 등록',
  '/inspection/settings':     '인스펙션 설정',
  '/defect':                  '객실하자',
  '/defect/new':              '객실하자 등록',
  '/defect/settings':         '객실하자 설정',
  '/facility-order':          '시설오더',
  '/facility-order/new':      '시설오더 등록',
  '/facility-order/settings': '시설오더 설정',
  '/inspection-review':       '인스펙션조회',
  '/notice':                  '게시판',
  '/notice/new':              '글 등록',
  '/staff':                   '직원목록',
  '/dashboard':               '통계/대시보드',
  '/settings':                '설정',
  '/settings/users/new':      '사용자 등록',
}

// 동적 경로 타이틀 추출
const getDynamicTitle = (pathname) => {
  if (/\/inspection\/date\/.+/.test(pathname))        return '인스펙션 날짜별'
  if (/\/inspection\/.+\/edit$/.test(pathname))       return '인스펙션 수정'
  if (/\/inspection\/.+/.test(pathname))              return '인스펙션 상세'
  if (/\/defect\/.+\/edit$/.test(pathname))           return '객실하자 수정'
  if (/\/defect\/.+/.test(pathname))                  return '객실하자 상세'
  if (/\/facility-order\/date\/.+/.test(pathname))    return '시설오더 날짜별'
  if (/\/facility-order\/.+\/edit$/.test(pathname))   return '시설오더 수정'
  if (/\/facility-order\/.+/.test(pathname))          return '시설오더 상세'
  if (/\/notice\/.+\/edit$/.test(pathname))           return '글 수정'
  if (/\/notice\/.+/.test(pathname))                  return '게시판 상세'
  if (/\/staff\/.+/.test(pathname))                   return '직원 상세'
  if (/\/settings\/users\/.+\/edit$/.test(pathname))  return '사용자 수정'
  return '하우스키핑'
}

const getTitle = (pathname) => TITLE_MAP[pathname] ?? getDynamicTitle(pathname)

// 인증된 페이지 공통 레이아웃
export default function MainLayout({ children }) {
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const location = useLocation()
  const pathname = location.pathname

  const { user, isManager } = useAuthStore()
  const initBadge = useNotificationStore((s) => s.initBadge)

  // 현재 경로가 메인 탭(목록)인지 여부
  const isMainTab = MAIN_TAB_PATHS.some((p) => pathname === p)

  // 앱 첫 마운트 시 알림 뱃지 카운트 초기화
  useEffect(() => {
    if (user?.id) {
      initBadge(user.id, isManager(), user.role)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* 사이드 메뉴 (PC: 항상 표시, 모바일: open 상태 기준) */}
      <SideMenu
        open={sideMenuOpen}
        onClose={() => setSideMenuOpen(false)}
      />

      {/* PC 사이드바(240px) 만큼 본문 밀기 */}
      <div className="lg:pl-60">
        {/* 상단 헤더 */}
        <AppHeader
          title={getTitle(pathname)}
          isMainTab={isMainTab}
          onMenuClick={() => setSideMenuOpen(true)}
        />

        {/* 본문 — 헤더(56px) + 하단탭(64px+safe-area) 높이 확보 */}
        <main className="pt-14 lg:pb-0 min-h-screen"
          style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-[680px] mx-auto lg:max-w-none">
            {children}
          </div>
        </main>
      </div>

      {/* 하단 탭바 (모바일·태블릿만) */}
      <BottomTabBar />

      {/* 플로팅 액션 버튼 */}
      <FAB />

      {/* 알림 드로어 (전역) */}
      <NotificationDrawer />
    </div>
  )
}
