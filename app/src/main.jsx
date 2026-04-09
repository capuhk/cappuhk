import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/ko'
import './index.css'
import App from './App.jsx'

// dayjs 전역 한국어 설정
dayjs.locale('ko')

// ── 텔레그램 미니앱 풀스크린 초기화 ─────────────
// 텔레그램 외 환경(일반 브라우저)에서는 window.Telegram이 없으므로 안전하게 무시
const tg = window.Telegram?.WebApp
if (tg?.initData) {
  // initData가 있을 때만 텔레그램 미니앱 환경으로 판단
  tg.ready()
  tg.expand()
  tg.disableVerticalSwipes?.()

  // requestFullscreen — 구버전(6.0 등)에서 내부 에러 throw 가능하므로 try-catch
  try { tg.requestFullscreen?.() } catch { /* 미지원 버전 무시 */ }

  // initData를 sessionStorage에 저장 → useAuthStore.init()에서 자동 로그인 시도
  sessionStorage.setItem('tg_init_data', tg.initData)

  // 텔레그램 헤더 safe area를 CSS 변수로 설정
  const setTgInset = () => {
    const safeTop    = tg.safeAreaInset?.top        ?? 0
    const contentTop = tg.contentSafeAreaInset?.top ?? 52  // 헤더바 기본 높이
    document.documentElement.style.setProperty('--tg-safe-area-inset-top',         `${safeTop}px`)
    document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', `${contentTop}px`)
  }
  setTgInset()
  tg.onEvent?.('safeAreaChanged',        setTgInset)
  tg.onEvent?.('contentSafeAreaChanged', setTgInset)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
