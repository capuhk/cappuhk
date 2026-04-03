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

  return (
    <BrowserRouter>
      <AppRouter />
      {/* 전역 Toast 오버레이 — 네트워크 오류 등 */}
      <Toast />
    </BrowserRouter>
  )
}

export default App
