import useToastStore from '../store/useToastStore'

// 네트워크 타임아웃 기본값 (ms)
const DEFAULT_TIMEOUT = 8000

// ─────────────────────────────────────────────
// networkSave — 저장 작업에 타임아웃을 적용하는 래퍼
//
// 사용법:
//   await networkSave(async () => {
//     // supabase INSERT/UPDATE 등
//   })
//
// 타임아웃 초과 시:
//   - Toast로 네트워크 오류 메시지 표시
//   - err.isTimeout = true 로 throw
//   → catch에서 if (!err?.isTimeout) setError(...) 패턴으로 구분
// ─────────────────────────────────────────────
export const networkSave = (fn, timeoutMs = DEFAULT_TIMEOUT) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      const err = new Error('NETWORK_TIMEOUT')
      err.isTimeout = true
      reject(err)
    }, timeoutMs)
  })

  return Promise.race([fn(), timeoutPromise]).catch((err) => {
    if (err.isTimeout) {
      // 타임아웃 시 Toast 표시 (컴포넌트 외부에서 Zustand 직접 접근)
      useToastStore.getState().show(
        '네트워크 연결이 약합니다. 인터넷이 되는 곳에서 다시 저장해 주세요.',
        'error',
      )
    }
    throw err
  })
}
