import { create } from 'zustand'

// 객실현황 필터 상태 — 페이지 이동 후 복귀해도 필터 유지
const useRoomFilterStore = create((set) => ({
  floorFilter:   '전체',
  statusFilters: new Set(), // 다중 선택 — 비어있으면 ALL
  bkOnly:        false,
  search:        '',

  setFloorFilter:   (v) => set({ floorFilter: v }),
  setStatusFilters: (updater) =>
    set((state) => ({
      statusFilters: typeof updater === 'function' ? updater(state.statusFilters) : updater,
    })),
  setBkOnly: (updater) =>
    set((state) => ({
      bkOnly: typeof updater === 'function' ? updater(state.bkOnly) : updater,
    })),
  setSearch: (v) => set({ search: v }),
  resetFilters: () =>
    set({ floorFilter: '전체', statusFilters: new Set(), bkOnly: false, search: '' }),
}))

export default useRoomFilterStore
