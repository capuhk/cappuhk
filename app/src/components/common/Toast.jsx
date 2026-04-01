import { X, WifiOff, CheckCircle, Info } from 'lucide-react'
import useToastStore from '../../store/useToastStore'

// 타입별 스타일
const TOAST_STYLE = {
  error:   'bg-red-950/95 border-red-500/40 text-red-200',
  success: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200',
  info:    'bg-zinc-900/95 border-white/20 text-white/80',
}

const TOAST_ICON = {
  error:   WifiOff,
  success: CheckCircle,
  info:    Info,
}

// ─────────────────────────────────────────────
// 전역 Toast 오버레이
// App.jsx 최상단에 한 번만 렌더
// ─────────────────────────────────────────────
export default function Toast() {
  const { toasts, dismiss } = useToastStore()

  if (toasts.length === 0) return null

  return (
    // 하단 탭바 위쪽에 고정 (bottom-20 = 탭바 높이 + 여백)
    <div className="fixed bottom-20 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = TOAST_ICON[toast.type] || Info
        return (
          <div
            key={toast.id}
            className={`w-full max-w-sm flex items-start gap-3 px-4 py-3.5
              rounded-2xl border shadow-xl pointer-events-auto
              animate-in slide-in-from-bottom-4 duration-300
              ${TOAST_STYLE[toast.type] || TOAST_STYLE.info}`}
          >
            <Icon size={17} className="shrink-0 mt-0.5" />
            <p className="flex-1 text-sm leading-relaxed">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            >
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
