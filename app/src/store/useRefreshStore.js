import { create } from 'zustand'

// ─────────────────────────────────────────────
// useRefreshStore — 전역 새로고침 트리거
//
// AppHeader의 🔄 버튼 클릭 → triggerRefresh()
// 각 목록 페이지는 refreshKey를 useEffect 의존성에 넣어 재조회
// ─────────────────────────────────────────────
const useRefreshStore = create((set) => ({
  refreshKey: 0,
  // 새로고침 카운터 증가 → 구독 중인 페이지 자동 재조회
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}))

export default useRefreshStore
