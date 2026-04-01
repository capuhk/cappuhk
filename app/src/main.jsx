import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/ko'
import './index.css'
import App from './App.jsx'

// dayjs 전역 한국어 설정
dayjs.locale('ko')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
