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

// 임시 플레이스홀더 — 각 페이지 구현 시 교체
const Placeholder = ({ name }) => (
  <div className="flex items-center justify-center h-64 text-white/50">
    <p>{name} 페이지 준비 중</p>
  </div>
)

// 미로그인 시 /login 리다이렉트 + MainLayout 래핑
// loadingTimeout: init()이 8초 이상 걸리면 강제로 loading 해제 (무한 스피닝 방지)
// 특정 역할 제외 라우트 — facility는 게시판 접근 불가
function ProtectedRoute({ children, excludeRoles = [] }) {
  const { session, loading, user } = useAuthStore()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!loading) return
    const id = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(id)
  }, [loading])

  if (loading && !timedOut) return null
  if (!session) return <Navigate to="/login" replace />
  // 접근 제한 역할이면 인스펙션 목록으로 리다이렉트
  if (excludeRoles.includes(user?.role)) return <Navigate to="/inspection" replace />
  return <MainLayout>{children}</MainLayout>
}

function AppRouter() {
  return (
    <Routes>
      {/* 인증 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 인스펙션 */}
      <Route path="/inspection"            element={<ProtectedRoute><InspectionListPage /></ProtectedRoute>} />
      <Route path="/inspection/new"        element={<ProtectedRoute><InspectionFormPage /></ProtectedRoute>} />
      <Route path="/inspection/settings"   element={<Navigate to="/settings" replace />} />
      <Route path="/inspection/date/:date" element={<ProtectedRoute><InspectionListPage /></ProtectedRoute>} />
      <Route path="/inspection/:id"        element={<ProtectedRoute><InspectionDetailPage /></ProtectedRoute>} />
      <Route path="/inspection/:id/edit"   element={<ProtectedRoute><InspectionFormPage /></ProtectedRoute>} />

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
      <Route path="/notice"               element={<ProtectedRoute><NoticeListPage /></ProtectedRoute>} />
      <Route path="/notice/new"           element={<ProtectedRoute><NoticeFormPage /></ProtectedRoute>} />
      <Route path="/notice/:id"           element={<ProtectedRoute><NoticeDetailPage /></ProtectedRoute>} />
      <Route path="/notice/:id/edit"      element={<ProtectedRoute><NoticeFormPage /></ProtectedRoute>} />
      <Route path="/staff"                element={<ProtectedRoute><StaffListPage /></ProtectedRoute>} />
      <Route path="/staff/:id"            element={<ProtectedRoute><StaffDetailPage /></ProtectedRoute>} />
      <Route path="/dashboard"            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

      {/* 설정 */}
      <Route path="/settings"                    element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/settings/users/new"          element={<ProtectedRoute><UserFormPage /></ProtectedRoute>} />
      <Route path="/settings/users/:id/edit"     element={<ProtectedRoute><UserFormPage /></ProtectedRoute>} />

      {/* 기본 경로 — 로그인 후 인스펙션 목록으로 */}
      <Route path="/" element={<Navigate to="/inspection" replace />} />
      <Route path="*" element={<Navigate to="/inspection" replace />} />
    </Routes>
  )
}

export default AppRouter
