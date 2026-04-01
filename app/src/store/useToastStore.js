import { create } from 'zustand'

// ─────────────────────────────────────────────
// 전역 Toast 상태 스토어
// 사용: useToastStore.getState().show('메시지') — 컴포넌트 밖에서도 호출 가능
// ─────────────────────────────────────────────
const useToastStore = create((set) => ({
  toasts: [],  // { id, message, type: 'error'|'success'|'info' }

  show: (message, type = 'error', duration = 5000) => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))

    // duration 후 자동 제거
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, duration)
  },

  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export default useToastStore
