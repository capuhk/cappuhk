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
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
