import { useState, useEffect } from 'react'
import { ChevronRight, X, ArrowLeft } from 'lucide-react'
import BottomSheet from './BottomSheet'
import { getMasterData, CACHE_KEYS } from '../../utils/masterCache'

// 공용 객실번호 픽커 — Bottom Sheet 방식
// value    : 선택된 객실번호 (string | null)
// onChange : (room_no: string | null) => void
export default function RoomPicker({ value, onChange }) {
  const [rooms, setRooms] = useState([])
  const [floors, setFloors] = useState([])
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)           // 1: 층 선택, 2: 객실 선택
  const [selectedFloor, setSelectedFloor] = useState(null)
  const [loading, setLoading] = useState(true)

  // 마스터 캐시에서 객실 데이터 로드
  useEffect(() => {
    getMasterData(CACHE_KEYS.rooms)
      .then((data) => {
        setRooms(data)
        const uniqueFloors = [...new Set(data.map((r) => r.floor))].sort((a, b) => a - b)
        setFloors(uniqueFloors)
      })
      .finally(() => setLoading(false))
  }, [])

  // 시트 열릴 때 항상 Step 1부터 시작
  const handleOpen = () => {
    setStep(1)
    setSelectedFloor(null)
    setOpen(true)
  }

  const handleClose = () => setOpen(false)

  // 층 선택 → Step 2 전환
  const handleFloorSelect = (floor) => {
    setSelectedFloor(floor)
    setStep(2)
  }

  // 객실 선택 → 완료 후 시트 닫기
  const handleRoomSelect = (room_no) => {
    onChange(room_no)
    setOpen(false)
  }

  // ✕ 클릭 → 전체 초기화
  const handleClear = (e) => {
    e.stopPropagation()
    onChange(null)
  }

  // 선택된 층의 객실 목록
  const roomsForFloor = rooms
    .filter((r) => r.floor === selectedFloor)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // 현재 선택값의 층 정보
  const selectedRoom = rooms.find((r) => r.room_no === value)

  // ── 트리거 버튼 ──────────────────────────────
  const trigger = value ? (
    // 선택 완료 상태
    <button
      type="button"
      onClick={handleOpen}
      className="w-full flex items-center gap-2 px-4 py-3
        bg-white/10 rounded-xl border border-white/20
        hover:bg-white/15 active:scale-[0.98] transition-all"
    >
      <span className="text-white/50 text-sm">{selectedRoom?.floor}층</span>
      <span className="text-white/30 text-sm">|</span>
      <span className="text-white font-semibold">{value}</span>
      <button
        type="button"
        onClick={handleClear}
        className="ml-auto p-1 text-white/40 hover:text-white transition-colors"
      >
        <X size={15} />
      </button>
    </button>
  ) : (
    // 미선택 상태
    <button
      type="button"
      onClick={handleOpen}
      disabled={loading}
      className="w-full flex items-center px-4 py-3
        bg-white/10 rounded-xl border border-white/20
        hover:bg-white/15 active:scale-[0.98] transition-all
        disabled:opacity-40"
    >
      <span className="text-white/40 text-sm flex-1 text-left">
        {loading ? '객실 목록 불러오는 중...' : '객실번호 선택'}
      </span>
      <ChevronRight size={16} className="text-white/30" />
    </button>
  )

  // ── Bottom Sheet 내부 ─────────────────────────
  const sheetTitle = step === 1 ? '층 선택' : `${selectedFloor}층 — 객실 선택`

  return (
    <>
      {trigger}

      <BottomSheet open={open} onClose={handleClose} title={sheetTitle}>
        {/* Step 2 뒤로가기 */}
        {step === 2 && (
          <button
            type="button"
            onClick={() => { setStep(1); setSelectedFloor(null) }}
            className="flex items-center gap-1.5 mb-3
              text-white/60 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            층 목록으로
          </button>
        )}

        {/* 반응형 그리드
            ~360px: 3열 / 361~480px: 4열 / 481px~: 5열 */}
        <div className="grid grid-cols-3 min-[361px]:grid-cols-4 min-[481px]:grid-cols-5 gap-2 pb-2">
          {step === 1
            ? floors.map((floor) => (
                <button
                  key={floor}
                  type="button"
                  onClick={() => handleFloorSelect(floor)}
                  className="h-12 rounded-xl bg-white/10 text-white text-sm font-medium
                    hover:bg-white/20 active:scale-95 transition-all"
                >
                  {floor}층
                </button>
              ))
            : roomsForFloor.map(({ room_no }) => (
                <button
                  key={room_no}
                  type="button"
                  onClick={() => handleRoomSelect(room_no)}
                  className="h-12 rounded-xl bg-white/10 text-white text-sm font-medium
                    hover:bg-blue-500 active:scale-95 transition-all"
                >
                  {room_no}
                </button>
              ))}
        </div>
      </BottomSheet>
    </>
  )
}
