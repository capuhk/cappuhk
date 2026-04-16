import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'
import LoginPage from '../pages/LoginPage'
import MainLayout from '../components/layout/MainLayout'
import InspectionListPage   from '../pages/inspection/InspectionListPage'
import InspectionFormPage   from '../pages/inspection/InspectionFormPage'
import InspectionDetailPage from '../pages/inspection/InspectionDetailPage'
import DefectListPage   from '../pages/defect/DefectListPage'
import DefectFormPage   from '../pages/defect/DefectFormPage'
import DefectDetailPage from '../pages/defect/DefectDetailPage'
import FacilityOrderListPage   from '../pages/facilityOrder/FacilityOrderListPage'
import FacilityOrderFormPage   from '../pages/facilityOrder/FacilityOrderFormPage'
import FacilityOrderDetailPage from '../pages/facilityOrder/FacilityOrderDetailPage'
import InspectionReviewPage    from '../pages/InspectionReviewPage'
import NoticeListPage   from '../pages/notice/NoticeListPage'
import NoticeFormPage   from '../pages/notice/NoticeFormPage'
import NoticeDetailPage from '../pages/notice/NoticeDetailPage'
import StaffListPage   from '../pages/staff/StaffListPage'
import StaffDetailPage from '../pages/staff/StaffDetailPage'
import DashboardPage   from '../pages/DashboardPage'
import SettingsPage    from '../pages/SettingsPage'
import UserFormPage    from '../pages/settings/UserFormPage'
import RoomDashboard   from '../pages/rooms/RoomDashboard'

// 역할별 기본 홈 경로 반환
function DefaultRedirect() {
  const { user, session } = useAuthStore()
  if (!session) return <Navigate to="/login" replace />
  const homePath = user?.role === 'maid' ? '/facility-order' : '/inspection'
  return <Navigate to={homePath} replace />
}

// 미로그인 시 /login 리다이렉트 + MainLayout 래핑
// noticeGuard: true이면 noticeReadRoles 정책 기반으로 접근 제어
function ProtectedRoute({ children, excludeRoles = [], noticeGuard = false }) {
  const { session, loading, user, noticeReadRoles, isManager } = useAuthStore()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!loading) return
    const id = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(id)
  }, [loading])

  if (loading && !timedOut) return null
  if (!session) return <Navigate to="/login" replace />

  // 역할별 기본 홈 경로 — 메이드는 오더 페이지로
  const homePath = user?.role === 'maid' ? '/facility-order' : '/inspection'

  // 특정 역할 하드코딩 차단 (설정 페이지 등)
  if (excludeRoles.includes(user?.role)) return <Navigate to={homePath} replace />

  // 게시판 접근 — 정책 로드 대기 후 판단
  if (noticeGuard && !isManager()) {
    // 정책 아직 로드 안 됨 → 대기 (null 상태)
    if (noticeReadRoles === null) return null
    // 정책 로드 완료 → 허용 여부 판단
    if (!noticeReadRoles.includes(user?.role)) return <Navigate to={homePath} replace />
  }

  return <MainLayout>{children}</MainLayout>
}

function AppRouter() {
  return (
    <Routes>
      {/* 인증 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 인스펙션 — 메이드 접근 불가 */}
      <Route path="/inspection"            element={<ProtectedRoute excludeRoles={['maid']}><InspectionListPage /></ProtectedRoute>} />
      <Route path="/inspection/new"        element={<ProtectedRoute excludeRoles={['maid']}><InspectionFormPage /></ProtectedRoute>} />
      <Route path="/inspection/settings"   element={<Navigate to="/settings" replace />} />
      <Route path="/inspection/date/:date" element={<ProtectedRoute excludeRoles={['maid']}><InspectionListPage /></ProtectedRoute>} />
      <Route path="/inspection/:id"        element={<ProtectedRoute excludeRoles={['maid']}><InspectionDetailPage /></ProtectedRoute>} />
      <Route path="/inspection/:id/edit"   element={<ProtectedRoute excludeRoles={['maid']}><InspectionFormPage /></ProtectedRoute>} />

      {/* 객실하자 */}
      <Route path="/defect"               element={<ProtectedRoute><DefectListPage /></ProtectedRoute>} />
      <Route path="/defect/new"           element={<ProtectedRoute><DefectFormPage /></ProtectedRoute>} />
      <Route path="/defect/settings"      element={<Navigate to="/settings" replace />} />
      <Route path="/defect/:id"           element={<ProtectedRoute><DefectDetailPage /></ProtectedRoute>} />
      <Route path="/defect/:id/edit"      element={<ProtectedRoute><DefectFormPage /></ProtectedRoute>} />

      {/* 시설오더 */}
      <Route path="/facility-order"              element={<ProtectedRoute><FacilityOrderListPage /></ProtectedRoute>} />
      <Route path="/facility-order/new"          element={<ProtectedRoute><FacilityOrderFormPage /></ProtectedRoute>} />
      <Route path="/facility-order/settings"     element={<Navigate to="/settings" replace />} />
      <Route path="/facility-order/date/:date"   element={<ProtectedRoute><FacilityOrderListPage /></ProtectedRoute>} />
      <Route path="/facility-order/:id"          element={<ProtectedRoute><FacilityOrderDetailPage /></ProtectedRoute>} />
      <Route path="/facility-order/:id/edit"     element={<ProtectedRoute><FacilityOrderFormPage /></ProtectedRoute>} />

      {/* 사이드메뉴 */}
      <Route path="/inspection-review"    element={<ProtectedRoute><InspectionReviewPage /></ProtectedRoute>} />
      <Route path="/notice"               element={<ProtectedRoute noticeGuard><NoticeListPage /></ProtectedRoute>} />
      <Route path="/notice/new"           element={<ProtectedRoute noticeGuard><NoticeFormPage /></ProtectedRoute>} />
      <Route path="/notice/:id"           element={<ProtectedRoute noticeGuard><NoticeDetailPage /></ProtectedRoute>} />
      <Route path="/notice/:id/edit"      element={<ProtectedRoute noticeGuard><NoticeFormPage /></ProtectedRoute>} />
      <Route path="/staff"                element={<ProtectedRoute><StaffListPage /></ProtectedRoute>} />
      <Route path="/staff/:id"            element={<ProtectedRoute><StaffDetailPage /></ProtectedRoute>} />
      <Route path="/dashboard"            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

      {/* 객실현황 (카푸치노 전용 — WINGS PMS 연동) */}
      <Route path="/rooms" element={<ProtectedRoute><RoomDashboard /></ProtectedRoute>} />

      {/* 설정 */}
      <Route path="/settings"                    element={<ProtectedRoute excludeRoles={['houseman','front']}><SettingsPage /></ProtectedRoute>} />
      <Route path="/settings/users/new"          element={<ProtectedRoute><UserFormPage /></ProtectedRoute>} />
      <Route path="/settings/users/:id/edit"     element={<ProtectedRoute><UserFormPage /></ProtectedRoute>} />

      {/* 기본 경로 — 역할별 홈으로 리다이렉트 */}
      <Route path="/" element={<DefaultRedirect />} />
      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  )
}

export default AppRouter
