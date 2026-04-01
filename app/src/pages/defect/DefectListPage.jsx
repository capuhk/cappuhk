import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useRefreshStore from '../../store/useRefreshStore'

// 상태별 뱃지 색상
const STATUS_COLOR = {
  미완료: 'bg-red-500/20 text-red-400',
  처리중: 'bg-yellow-500/20 text-yellow-400',
  완료:   'bg-emerald-500/20 text-emerald-400',
}

// 상태 필터 칩 목록
const FILTER_OPTIONS = ['All', '미완료', '처리중', '완료']

export default function DefectListPage() {
  const navigate = useNavigate()
  // 헤더 🔄 버튼 트리거 — 변경 시 데이터 재조회
  const refreshKey = useRefreshStore((s) => s.refreshKey)

  const [records, setRecords]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  // 'All' 또는 상태값 문자열
  const [statusFilter, setStatusFilter] = useState('All')
  // 객실번호별 아코디언 열림 상태
  const [openRooms, setOpenRooms] = useState(new Set())

  // ── 데이터 로드 ───────────────────────────────
  useEffect(() => {
    const controller = new AbortController()

    const fetchData = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('defects')
          .select('id, room_no, division, location, category, status, memo, created_at, users!author_id(name)')
          .order('room_no', { ascending: true })
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal)

        if (!error && data) {
          setRecords(data)
          const rooms = [...new Set(data.map((r) => r.room_no))].sort((a, b) => a.localeCompare(b, 'ko'))
          if (rooms.length > 0) setOpenRooms(new Set([rooms[0]]))
        }
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('객실하자 목록 로드 오류:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    return () => controller.abort()
  }, [refreshKey])

  // ── 상태 필터 + 검색 (객실번호 + 작성자) ──────
  const filtered = useMemo(() => {
    let list = records
    if (statusFilter !== 'All') list = list.filter((r) => r.status === statusFilter)

    const q = search.trim()
    if (q) {
      list = list.filter((r) =>
        r.room_no.includes(q) ||
        (r.users?.name || '').includes(q)
      )
    }
    return list
  }, [records, statusFilter, search])

  // ── 객실번호별 그룹 ───────────────────────────
  const grouped = useMemo(() => {
    return filtered.reduce((acc, r) => {
      acc[r.room_no] = acc[r.room_no] || []
      acc[r.room_no].push(r)
      return acc
    }, {})
  }, [filtered])

  // 객실번호 목록 — 가나다 순
  const rooms = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ko'))

  // ── 아코디언 토글 ─────────────────────────────
  const toggleRoom = (room) => {
    setOpenRooms((prev) => {
      const next = new Set(prev)
      next.has(room) ? next.delete(room) : next.add(room)
      return next
    })
  }

  // ── 렌더 ─────────────────────────────────────
  return (
    <div>
      {/* 검색바 */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white/10 rounded-xl border border-white/20">
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            type="text"
            placeholder="객실번호 또는 작성자 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 outline-none"
          />
        </div>
      </div>

      {/* 상태 필터 칩 */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {FILTER_OPTIONS.map((opt) => {
          const count = opt === 'All'
            ? records.length
            : records.filter((r) => r.status === opt).length
          return (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === opt
                  ? 'bg-white text-zinc-900'
                  : 'bg-white/10 text-white/60 hover:bg-white/15'
              }`}
            >
              {opt}
              <span className="ml-1.5 text-xs opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      {/* 목록 본문 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-white/30">하자 기록이 없습니다</p>
        </div>
      ) : (
        <div className="px-4 pb-6 space-y-2">
          {rooms.map((room) => {
            const isOpen = openRooms.has(room)
            return (
              <section key={room} className="bg-white/5 rounded-2xl overflow-hidden">
                {/* 객실번호 헤더 — 아코디언 토글 */}
                <button
                  onClick={() => toggleRoom(room)}
                  className="w-full flex items-center justify-between px-4 py-3
                    hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white/70">{room}</span>
                    <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                      {grouped[room].length}건
                    </span>
                  </div>
                  {isOpen
                    ? <ChevronUp size={15} className="text-white/30 shrink-0" />
                    : <ChevronDown size={15} className="text-white/30 shrink-0" />
                  }
                </button>

                {/* 카드 목록 */}
                {isOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t border-white/8">
                    {grouped[room].map((record) => (
                      <button
                        key={record.id}
                        onClick={() => navigate(`/defect/${record.id}`)}
                        className="w-full text-left px-4 py-3 rounded-xl bg-white/5
                          border border-white/8 hover:bg-white/10 active:scale-[0.99]
                          transition-all mt-2"
                      >
                        <div className="flex items-center gap-2">
                          {/* 구분/위치 */}
                          <span className="text-sm font-semibold text-white">
                            {record.division} · {(() => {
                              const locs = record.location.split(',').filter(Boolean)
                              return locs.length > 1
                                ? `${locs[0].trim()} 외 ${locs.length - 1}개`
                                : (locs[0] || '').trim()
                            })()}
                          </span>
                          {/* 상태 뱃지 */}
                          <span className={`ml-auto shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[record.status]}`}>
                            {record.status}
                          </span>
                        </div>
                        {/* 하자분류 + 작성자 */}
                        <div className="flex items-center gap-2 mt-1">
                          {record.category && (
                            <span className="text-xs text-white/40">{record.category}</span>
                          )}
                          <span className="text-xs text-white/30 ml-auto">
                            {record.users?.name}
                          </span>
                        </div>
                        {/* 메모 미리보기 */}
                        {record.memo && (
                          <p className="mt-1 text-sm text-white/40 truncate">{record.memo}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
