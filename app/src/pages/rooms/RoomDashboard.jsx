import { useState, useEffect, useMemo } from 'react'
import { Search, RefreshCw, Loader2, Hotel, CalendarDays, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import dayjs from 'dayjs'
import useRoomFilterStore from '../../store/useRoomFilterStore'

// ─────────────────────────────────────────────
// 객실 상태 코드 정의
// ─────────────────────────────────────────────
const STATUS_CONFIG = {
  VD: { label: 'VD', desc: '빈방/미청소',   bg: 'bg-zinc-800',   border: 'border-zinc-700',   text: 'text-zinc-300' },
  VI: { label: 'VI', desc: '빈방/점검완료', bg: 'bg-emerald-950', border: 'border-emerald-700', text: 'text-emerald-300' },
  VC: { label: 'VC', desc: '빈방/청소완료', bg: 'bg-blue-950',    border: 'border-blue-700',    text: 'text-blue-300' },
  OO: { label: 'OO', desc: '사용불가',      bg: 'bg-red-950',    border: 'border-red-600',     text: 'text-red-300' },
  OC: { label: 'OC', desc: '투숙/청소완료', bg: 'bg-teal-950',   border: 'border-teal-700',    text: 'text-teal-300' },
  OD: { label: 'OD', desc: '투숙/미청소',   bg: 'bg-orange-950', border: 'border-orange-700',  text: 'text-orange-300' },
  OI: { label: 'OI', desc: '투숙/점검완료', bg: 'bg-cyan-950',   border: 'border-cyan-700',    text: 'text-cyan-300' },
}

// ─────────────────────────────────────────────
// useRooms — Supabase Realtime 구독 + 초기 로드
// ─────────────────────────────────────────────
function useRooms() {
  const [rooms, setRooms]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchRooms = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('room_no', { ascending: true })

      if (error) throw error
      setRooms(data || [])
      setLastUpdated(new Date())
    } catch (err) {
      console.error('객실 데이터 조회 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()

    // Realtime 구독 — 스크래퍼 upsert 시 자동 갱신
    const channel = supabase
      .channel('rooms-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setRooms((prev) => {
              const idx = prev.findIndex((r) => r.room_no === payload.new.room_no)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = payload.new
                return next
              }
              return [...prev, payload.new].sort((a, b) => a.room_no.localeCompare(b.room_no))
            })
            setLastUpdated(new Date())
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return { rooms, loading, lastUpdated, refetch: fetchRooms }
}

// ─────────────────────────────────────────────
// RoomDetailSheet — 카드 탭 시 하단 슬라이드업 시트
// ─────────────────────────────────────────────
function RoomDetailSheet({ room, onClose }) {
  if (!room) return null

  // 날짜 M/D 형식 포맷 (연도 제외)
  const fmtDate = (d) => d ? dayjs(d).format('M/D') : '—'

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      {/* 시트 본체 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-2xl
        border-t border-white/10 px-5 pt-4 pb-10 animate-slide-up">
        {/* 핸들 + 닫기 */}
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-1 bg-white/20 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
          <span className="text-white font-bold text-base">{room.room_no}</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* 체크인 / 체크아웃 / 박수 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-white/40 text-xs mb-1">체크인</p>
            <p className="text-white font-semibold text-sm">{fmtDate(room.arrv_date)}</p>
            {room.arrv_plan_time && (
              <p className="text-white/30 text-xs mt-0.5">{room.arrv_plan_time}</p>
            )}
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-white/40 text-xs mb-1">체크아웃</p>
            <p className="text-white font-semibold text-sm">{fmtDate(room.dept_date)}</p>
            {room.dept_plan_time && (
              <p className="text-white/30 text-xs mt-0.5">{room.dept_plan_time}</p>
            )}
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-white/40 text-xs mb-1">박수</p>
            <p className="text-white font-semibold text-sm">{room.nights ? `${room.nights}박` : '—'}</p>
          </div>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────
// RoomCard — 개별 객실 카드
// ─────────────────────────────────────────────
function RoomCard({ room, onSelect }) {
  const cfg = STATUS_CONFIG[room.room_sts_text] || {
    label:  room.room_sts_text || '?',
    desc:   '알 수 없음',
    bg:     'bg-zinc-900',
    border: 'border-zinc-700',
    text:   'text-zinc-400',
  }

  // 오늘 체크아웃 예정
  const isDeparting = room.dept_date && room.dept_date === dayjs().format('YYYY-MM-DD')
  // 오늘 체크인 예정
  const isArriving  = room.arrv_date && room.arrv_date === dayjs().format('YYYY-MM-DD')
  // BK — 예약 배정 상태
  const isBooked    = room.room_status === 'BK'
  // 재실 여부 (I=재실)
  const isInRoom    = room.inroom_status === 'I'

  return (
    <div
      className={`relative rounded-xl border p-3 ${cfg.bg} ${cfg.border} transition-all active:scale-95 cursor-pointer`}
      onClick={() => onSelect(room)}
    >
      {/* 객실번호 + 아이콘 행 */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <span className="text-white font-bold text-sm">{room.room_no}</span>
          {/* 재실 — 채워진 사람 아이콘 (SVG fill) */}
          {isInRoom && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11" height="11"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-white/70 shrink-0"
            >
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          )}
          {/* BK — 달력 아이콘 */}
          {isBooked && (
            <CalendarDays size={13} className="text-yellow-300 shrink-0" />
          )}
        </div>
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>

      {/* 뱃지 행 */}
      <div className="flex gap-1 flex-wrap">
        {/* 청소중 — CLEAN_STS_TEXT = NG */}
        {room.clean_sts_text === 'NG' && (
          <span className="text-xs bg-fuchsia-500/20 text-fuchsia-300 px-1.5 py-0.5 rounded">NG</span>
        )}
        {isDeparting && (
          <span className="text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">ED</span>
        )}
        {isArriving && (
          <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">CI</span>
        )}
        {room.lsos_code && (
          <span className="text-xs bg-white/10 text-white/50 px-1.5 py-0.5 rounded">{room.lsos_code}</span>
        )}
      </div>

      {/* 타입 코드 (우하단) */}
      {room.room_type_code && (
        <span className="absolute bottom-2 right-2 text-[10px] text-white/20">
          {room.room_type_code}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// RoomDashboard — 메인 페이지
// ─────────────────────────────────────────────
export default function RoomDashboard() {
  const { rooms, loading, lastUpdated, refetch } = useRooms()

  // 필터 상태 — Zustand 스토어로 관리해 페이지 이동 후 복귀 시에도 유지
  const floorFilter   = useRoomFilterStore((s) => s.floorFilter)
  const statusFilters = useRoomFilterStore((s) => s.statusFilters)
  const bkOnly        = useRoomFilterStore((s) => s.bkOnly)
  const search        = useRoomFilterStore((s) => s.search)
  const setFloorFilter   = useRoomFilterStore((s) => s.setFloorFilter)
  const setStatusFilters = useRoomFilterStore((s) => s.setStatusFilters)
  const setBkOnly        = useRoomFilterStore((s) => s.setBkOnly)
  const setSearch        = useRoomFilterStore((s) => s.setSearch)
  // 카드 탭 시 상세 시트에 표시할 객실 — 로컬 상태 유지
  const [selectedRoom, setSelectedRoom] = useState(null)

  // 층 목록 동적 생성
  const floors = useMemo(() => {
    const set = new Set(rooms.map((r) => r.floor_code).filter(Boolean))
    return ['전체', ...Array.from(set).sort()]
  }, [rooms])

  // 상태별 카운트
  const counts = useMemo(() => {
    const map = {}
    for (const r of rooms) {
      const s = r.room_sts_text || '?'
      map[s] = (map[s] || 0) + 1
    }
    return map
  }, [rooms])

  // BK 객실 수
  const bkCount = useMemo(() => rooms.filter((r) => r.room_status === 'BK').length, [rooms])

  // count > 0 인 상태 목록
  const availableStatuses = useMemo(
    () => Object.keys(STATUS_CONFIG).filter((code) => counts[code] > 0),
    [counts],
  )

  // ALL 활성 여부 — 선택 없거나 전체 선택된 경우
  const isAll = statusFilters.size === 0 || statusFilters.size === availableStatuses.length

  // 상태 칩 토글 핸들러
  const toggleStatus = (code) => {
    setStatusFilters((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  // ALL 버튼 클릭 — 전체 해제
  const handleAll = () => setStatusFilters(new Set())

  // 필터 + 검색 적용
  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      if (floorFilter !== '전체' && r.floor_code !== floorFilter) return false
      // 상태 필터 + BK 필터 OR 조건 — 둘 중 하나라도 해당하면 통과
      const hasStatusFilter = statusFilters.size > 0
      const matchStatus     = hasStatusFilter && statusFilters.has(r.room_sts_text)
      const matchBk         = bkOnly && r.room_status === 'BK'
      if (hasStatusFilter || bkOnly) {
        if (!matchStatus && !matchBk) return false
      }
      if (search) {
        const q = search.toLowerCase()
        if (!r.room_no?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [rooms, floorFilter, statusFilters, bkOnly, search])

  return (
    <div className="px-4 pt-4 pb-32 max-w-5xl mx-auto">

      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Hotel size={18} className="text-white/50" />
          <h1 className="text-white font-semibold text-base">객실 현황</h1>
          <span className="text-white/30 text-xs">({rooms.length}실)</span>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-white/30 text-xs">
              {dayjs(lastUpdated).format('HH:mm')} 갱신
            </span>
          )}
          <button
            onClick={refetch}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
          >
            {loading
              ? <Loader2 size={15} className="animate-spin" />
              : <RefreshCw size={15} />
            }
          </button>
        </div>
      </div>

      {/* 상태 필터 칩 (ALL + 다중 선택) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* ALL 버튼 */}
        <button
          onClick={handleAll}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium
            transition-all active:scale-95
            ${isAll
              ? 'bg-white/20 border-white/30 text-white'
              : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
            }`}
        >
          ALL
          <span className={isAll ? 'text-white/70' : 'text-white/30'}>{rooms.length}</span>
        </button>

        {/* BK 필터 버튼 */}
        {bkCount > 0 && (
          <button
            onClick={() => setBkOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium
              transition-all active:scale-95
              ${bkOnly
                ? 'bg-yellow-500/20 border-yellow-400/50 text-yellow-300'
                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
              }`}
          >
            <CalendarDays size={11} className={bkOnly ? 'text-yellow-300' : 'text-white/40'} />
            <span>BK</span>
            <span className={bkOnly ? 'text-yellow-300/70' : 'text-white/30'}>{bkCount}</span>
          </button>
        )}

        {/* 상태별 칩 — count > 0 인 것만 표시 */}
        {Object.entries(STATUS_CONFIG).map(([code, cfg]) => {
          const cnt = counts[code] || 0
          if (!cnt) return null
          const isActive = statusFilters.has(code)
          return (
            <button
              key={code}
              onClick={() => toggleStatus(code)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium
                transition-all active:scale-95
                ${isActive
                  ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
            >
              <span>{code}</span>
              <span className={isActive ? cfg.text : 'text-white/30'}>{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* 층 필터 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none">
        {floors.map((f) => (
          <button
            key={f}
            onClick={() => setFloorFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95
              ${floorFilter === f
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
          >
            {f === '전체' ? '전체' : `${f}F`}
          </button>
        ))}
      </div>

      {/* 검색창 */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="객실번호 검색"
          className="w-full pl-8 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl
            text-white text-sm placeholder:text-white/25 outline-none
            focus:border-white/30 transition-colors"
        />
      </div>

      {/* 객실 그리드 */}
      {loading && rooms.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={24} className="text-white/30 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2">
          <Hotel size={28} className="text-white/15" />
          <p className="text-sm text-white/30">
            {rooms.length === 0 ? '데이터 없음 — 스크래퍼 실행 여부 확인' : '검색 결과 없음'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
          {filtered.map((room) => (
            <RoomCard key={room.room_no} room={room} onSelect={setSelectedRoom} />
          ))}
        </div>
      )}

      {/* 카드 탭 시 상세 시트 */}
      <RoomDetailSheet room={selectedRoom} onClose={() => setSelectedRoom(null)} />
    </div>
  )
}
