import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import AppRouter from './router/AppRouter'
import useAuthStore from './store/useAuthStore'
import Toast from './components/common/Toast'

// 앱 루트 — 세션 초기화 후 라우터 렌더
function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    // 앱 첫 마운트 시 Supabase 세션 복원
    // init()은 onAuthStateChange 구독 해제 함수를 반환
    const cleanup = init()
    return cleanup
  }, [])

  useEffect(() => {
    // 백그라운드 복귀 시 무한스피너 방지
    // iOS Safari/PWA에서 5분 이상 백그라운드 → Supabase 클라이언트 내부 상태 손상
    // → 토큰 갱신 fetch가 hanging 상태로 남아 모든 쿼리 대기
    // → Safari 자체 새로고침과 동일하게 강제 리로드로 해결
    let hiddenAt = null
    // 2분 이상 백그라운드 → 강제 리로드
    // (5분 임계값은 정확히 5분이 아닌 경우 미발동 — 2분으로 하향)
    const RELOAD_THRESHOLD_MS = 2 * 60 * 1000

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (document.visibilityState === 'visible' && hiddenAt !== null) {
        const hiddenMs = Date.now() - hiddenAt
        hiddenAt = null
        if (hiddenMs >= RELOAD_THRESHOLD_MS) {
          // 세션은 localStorage에 보존됨 — 리로드 후 자동 로그인 유지
          window.location.reload()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  return (
    <BrowserRouter>
      <AppRouter />
      {/* 전역 Toast 오버레이 — 네트워크 오류 등 */}
      <Toast />
    </BrowserRouter>
  )
}

export default App
