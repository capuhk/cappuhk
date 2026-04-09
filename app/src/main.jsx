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
if (tg) {
  tg.ready()
  tg.expand()                          // 최대 높이 확장
  tg.requestFullscreen?.()             // Bot API 8.0+ 완전 풀스크린
  tg.disableVerticalSwipes?.()         // 아래로 스와이프 닫힘 방지

  // initData를 sessionStorage에 저장 → useAuthStore.init()에서 자동 로그인 시도
  if (tg.initData) {
    sessionStorage.setItem('tg_init_data', tg.initData)
  }

  // 텔레그램 헤더 영역 safe area를 CSS 변수로 설정
  // safeAreaInset / contentSafeAreaInset은 Bot API 8.0+ 에서만 제공
  // 없으면 fullscreen 모드 기준 기본값 52px 사용
  const setTgInset = () => {
    const safeTop    = tg.safeAreaInset?.top         ?? 0
    const contentTop = tg.contentSafeAreaInset?.top  ?? 52  // 텔레그램 헤더바 기본 높이
    document.documentElement.style.setProperty('--tg-safe-area-inset-top',         `${safeTop}px`)
    document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', `${contentTop}px`)
  }
  setTgInset()
  // 풀스크린 전환 후 값이 바뀔 수 있으므로 이벤트에도 반영
  tg.onEvent?.('safeAreaChanged',        setTgInset)
  tg.onEvent?.('contentSafeAreaChanged', setTgInset)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
