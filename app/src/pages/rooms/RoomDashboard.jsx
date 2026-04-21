import { useState, useEffect, useMemo } from 'react'
import { Search, RefreshCw, Loader2, Hotel, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import dayjs from 'dayjs'

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

// 상태 필터 칩 목록 (전체 포함)
const STATUS_FILTERS = ['전체', 'VD', 'VI', 'VC', 'OC', 'OD', 'OO', 'OI']

// ─────────────────────────────────────────────
// useRooms — Supabase Realtime 구독 + 초기 로드
// ─────────────────────────────────────────────
function useRooms() {
  const [rooms, setRooms]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  // 전체 객실 데이터 조회
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
    // 초기 로드
    fetchRooms()

    // Realtime 구독 — 스크래퍼 upsert 시 자동 갱신
    const channel = supabase
      .channel('rooms-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        (payload) => {
          // 변경된 row만 교체 (전체 재조회 대신 성능 최적화)
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { rooms, loading, lastUpdated, refetch: fetchRooms }
}

// ─────────────────────────────────────────────
// RoomCard — 개별 객실 카드
// ─────────────────────────────────────────────
function RoomCard({ room }) {
  const cfg = STATUS_CONFIG[room.room_sts_text] || {
    label: room.room_sts_text || '?',
    desc:  '알 수 없음',
    bg:    'bg-zinc-900',
    border: 'border-zinc-700',
    text:  'text-zinc-400',
  }

  // 체크아웃 예정 여부 (오늘 퇴실)
  const isDeparting = room.dept_date && room.dept_date === dayjs().format('YYYY-MM-DD')
  // 체크인 예정 여부 (오늘 입실)
  const isArriving  = room.arrv_date && room.arrv_date === dayjs().format('YYYY-MM-DD') && !room.inhs_gest_name

  return (
    <div className={`relative rounded-xl border p-3 ${cfg.bg} ${cfg.border} transition-all`}>
      {/* 객실번호 + 상태 뱃지 */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <span className="text-white font-bold text-sm">{room.room_no}</span>
          {/* 재실 여부 — inroom_status I=재실, V=공실 */}
          {room.inroom_status === 'I' && (
            <User size={11} className="text-white/60" />
          )}
        </div>
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>

      {/* 체크아웃/체크인 예정 뱃지 */}
      <div className="flex gap-1 flex-wrap">
        {isDeparting && (
          <span className="text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">ED</span>
        )}
        {isArriving && (
          <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">CI</span>
        )}
        {room.lsos_code && (
          <span className="text-xs bg-white/10 text-white/50 px-1.5 py-0.5 rounded">{room.lsos_code}</span>
        )}
        {room.nights && (
          <span className="text-xs text-white/30">{room.nights}박</span>
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

  const [floorFilter,  setFloorFilter]  = useState('전체')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [search,       setSearch]       = useState('')

  // 층 목록 동적 생성 (실제 데이터 기준)
  const floors = useMemo(() => {
    const set = new Set(rooms.map((r) => r.floor_code).filter(Boolean))
    return ['전체', ...Array.from(set).sort()]
  }, [rooms])

  // 필터 + 검색 적용
  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      if (floorFilter  !== '전체' && r.floor_code    !== floorFilter)  return false
      if (statusFilter !== '전체' && r.room_sts_text !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchRoom  = r.room_no?.toLowerCase().includes(q)
        const matchGuest = r.inhs_gest_name?.toLowerCase().includes(q)
        if (!matchRoom && !matchGuest) return false
      }
      return true
    })
  }, [rooms, floorFilter, statusFilter, search])

  // 상태별 카운트 (요약 표시용)
  const counts = useMemo(() => {
    const map = {}
    for (const r of rooms) {
      const s = r.room_sts_text || '?'
      map[s] = (map[s] || 0) + 1
    }
    return map
  }, [rooms])

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
          {/* 마지막 업데이트 시각 */}
          {lastUpdated && (
            <span className="text-white/30 text-xs">
              {dayjs(lastUpdated).format('HH:mm')} 갱신
            </span>
          )}
          {/* 새로고침 버튼 */}
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

      {/* 상태별 카운트 요약 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(STATUS_CONFIG).map(([code, cfg]) => {
          const cnt = counts[code] || 0
          if (!cnt) return null
          return (
            <button
              key={code}
              onClick={() => setStatusFilter(statusFilter === code ? '전체' : code)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium
                transition-all active:scale-95
                ${statusFilter === code
                  ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
            >
              <span>{code}</span>
              <span className={statusFilter === code ? cfg.text : 'text-white/30'}>{cnt}</span>
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
          placeholder="객실번호 또는 투숙객 검색"
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
            <RoomCard key={room.room_no} room={room} />
          ))}
        </div>
      )}
    </div>
  )
}
