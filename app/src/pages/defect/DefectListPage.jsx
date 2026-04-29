import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp, CheckCircle, Loader2, CalendarDays, FileSpreadsheet, Printer, X } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useRefreshStore from '../../store/useRefreshStore'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { downloadExcel, openPrintWindow, prepareDefectExport } from '../../utils/exportUtils'

// 상태별 뱃지 색상
const STATUS_COLOR = {
  미완료: 'bg-red-500/20 text-red-400',
  처리중: 'bg-yellow-500/20 text-yellow-400',
  완료:   'bg-emerald-500/20 text-emerald-400',
}

// 상태 필터 칩 목록
const FILTER_OPTIONS = ['All', '미완료', '처리중', '완료']

// Phase 2 전체 필드 select
const FULL_SELECT = 'id, room_no, division, location, category, status, memo, created_at, users!author_id(name)'

export default function DefectListPage() {
  const navigate = useNavigate()
  const { refreshKey, triggerRefresh } = useRefreshStore()
  const { pullDistance, refreshing } = usePullToRefresh(useCallback(() => { triggerRefresh() }, [triggerRefresh]))

  const [dateFrom, setDateFrom] = useState(() => dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [dateTo,   setDateTo]   = useState(() => dayjs().format('YYYY-MM-DD'))
  const [dateOpen, setDateOpen] = useState(false)

  // ── Phase 1: 경량 데이터 (id, room_no, status, created_at) ──
  const [lightRecords,   setLightRecords]   = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  // ── Phase 2: 객실번호별 전체 레코드 캐시 ─────
  const [roomCache,   setRoomCache]   = useState({})
  const [loadingRoom, setLoadingRoom] = useState(null)

  const [search,        setSearch]        = useState('')
  const [searchRecords, setSearchRecords] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimerRef = useRef(null)

  const [statusFilter, setStatusFilter] = useState('All')
  const [openRooms,    setOpenRooms]    = useState(new Set())
  const [exporting,    setExporting]    = useState(false)

  const isSearchMode = search.trim().length > 0

  // ── Phase 1: 경량 로드 ────────────────────────
  useEffect(() => {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10000)

    const fetchLight = async () => {
      setInitialLoading(true)
      setRoomCache({})
      setOpenRooms(new Set())
      try {
        const { data, error } = await supabase
          .from('defects')
          .select('id, room_no, status, created_at')
          .gte('created_at', `${dateFrom}T00:00:00`)
          .lte('created_at', `${dateTo}T23:59:59`)
          .abortSignal(controller.signal)

        if (!error && data) setLightRecords(data)
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('객실하자 경량 로드 오류:', err)
      } finally {
        clearTimeout(timeoutId)
        setInitialLoading(false)
      }
    }

    fetchLight()
    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [refreshKey, dateFrom, dateTo])

  // ── Phase 2: 객실 클릭 시 전체 레코드 로드 ──
  const handleToggleRoom = async (room) => {
    if (isSearchMode) {
      setOpenRooms((prev) => {
        const next = new Set(prev)
        next.has(room) ? next.delete(room) : next.add(room)
        return next
      })
      return
    }
    if (openRooms.has(room)) {
      setOpenRooms((prev) => { const next = new Set(prev); next.delete(room); return next })
      return
    }
    if (roomCache[room]) {
      setOpenRooms((prev) => new Set([...prev, room]))
      return
    }
    setLoadingRoom(room)
    try {
      const { data, error } = await supabase
        .from('defects')
        .select(FULL_SELECT)
        .eq('room_no', room)
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setRoomCache((prev) => ({ ...prev, [room]: data }))
        setOpenRooms((prev) => new Set([...prev, room]))
      }
    } catch (err) {
      console.error('객실별 하자 로드 오류:', err)
    } finally {
      setLoadingRoom(null)
    }
  }

  // ── 검색 모드: debounce 300ms 후 전체 쿼리 ──
  useEffect(() => {
    const q = search.trim()
    if (!q) { setSearchRecords([]); return }

    clearTimeout(searchTimerRef.current)
    setSearchLoading(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('defects')
          .select(FULL_SELECT)
          .gte('created_at', `${dateFrom}T00:00:00`)
          .lte('created_at', `${dateTo}T23:59:59`)
          .order('room_no', { ascending: true })
          .order('created_at', { ascending: false })

        if (!error && data) {
          const filtered = data.filter((r) =>
            r.room_no.includes(q) ||
            (r.users?.name  || '').includes(q) ||
            (r.division     || '').includes(q) ||
            (r.location     || '').includes(q) ||
            (r.category     || '').includes(q) ||
            (r.memo         || '').includes(q)
          )
          setSearchRecords(filtered)
          const rooms = [...new Set(filtered.map((r) => r.room_no))]
          setOpenRooms(new Set(rooms))
        }
      } catch (err) {
        console.error('객실하자 검색 오류:', err)
      } finally {
        setSearchLoading(false)
      }
    }, 300)

    return () => clearTimeout(searchTimerRef.current)
  }, [search, dateFrom, dateTo])

  // ── 내보내기 — 내보낼 때 전체 데이터 신규 조회 ──
  const handleExport = async (type) => {
    if (exporting) return
    setExporting(true)
    try {
      const { data, error } = await supabase
        .from('defects')
        .select(FULL_SELECT)
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('room_no', { ascending: true })
        .order('created_at', { ascending: false })

      if (error || !data) throw new Error('데이터 조회 실패')

      const { excelHeaders, excelRows, printHeaders, printRows } = await prepareDefectExport(data)
      const dateRange = `${dateFrom} ~ ${dateTo}`
      const filename  = `객실하자_${dateFrom}_${dateTo}`
      if (type === 'excel') {
        downloadExcel(excelHeaders, excelRows, filename)
      } else {
        openPrintWindow('객실하자 목록', printHeaders, printRows, dateRange)
      }
    } catch (err) {
      console.error('내보내기 오류:', err)
      alert('내보내기 중 오류가 발생했습니다.')
    } finally {
      setExporting(false)
    }
  }

  // ── 객실별 건수 집계 (lightRecords 기반) ─────
  const roomCounts = useMemo(() =>
    lightRecords.reduce((acc, r) => {
      acc[r.room_no] = (acc[r.room_no] || 0) + 1
      return acc
    }, {}),
  [lightRecords])

  // ── 상태 필터 건수 ────────────────────────────
  const countFor = (val) => {
    if (val === 'All') return lightRecords.length
    return lightRecords.filter((r) => r.status === val).length
  }

  // ── 검색 모드 그룹 ────────────────────────────
  const searchGrouped = useMemo(() => {
    let list = searchRecords
    if (statusFilter !== 'All') list = list.filter((r) => r.status === statusFilter)
    return list.reduce((acc, r) => {
      acc[r.room_no] = acc[r.room_no] || []
      acc[r.room_no].push(r)
      return acc
    }, {})
  }, [searchRecords, statusFilter])

  // ── 표시할 객실 목록 ──────────────────────────
  const rooms = useMemo(() => {
    if (isSearchMode) return Object.keys(searchGrouped).sort((a, b) => a.localeCompare(b, 'ko'))
    // 기본 모드 — statusFilter 적용한 lightRecords 기준
    let src = lightRecords
    if (statusFilter !== 'All') src = src.filter((r) => r.status === statusFilter)
    return [...new Set(src.map((r) => r.room_no))].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [isSearchMode, searchGrouped, lightRecords, statusFilter])

  // ── 객실의 표시 레코드 ────────────────────────
  const getRecords = (room) => {
    let list = isSearchMode ? (searchGrouped[room] || []) : (roomCache[room] || [])
    if (!isSearchMode && statusFilter !== 'All') list = list.filter((r) => r.status === statusFilter)
    return list
  }

  // ── 객실 헤더 건수 배지 ───────────────────────
  const getCount = (room) => isSearchMode
    ? (searchGrouped[room] || []).length
    : (roomCounts[room] || 0)

  // ── 빠른 상태 변경 ───────────────────────────
  const [processingId, setProcessingId] = useState(null)

  const handleQuickStatus = async (e, record, newStatus) => {
    e.stopPropagation()
    if (processingId) return
    setProcessingId(`${record.id}-${newStatus}`)
    try {
      const { error } = await supabase
        .from('defects')
        .update({ status: newStatus })
        .eq('id', record.id)

      if (!error) {
        // lightRecords 업데이트
        setLightRecords((prev) => prev.map((r) =>
          r.id === record.id ? { ...r, status: newStatus } : r
        ))
        // roomCache 업데이트
        setRoomCache((prev) => ({
          ...prev,
          [record.room_no]: (prev[record.room_no] || []).map((r) =>
            r.id === record.id ? { ...r, status: newStatus } : r
          ),
        }))
        // 검색 모드 업데이트
        setSearchRecords((prev) => prev.map((r) =>
          r.id === record.id ? { ...r, status: newStatus } : r
        ))
      }
    } catch (err) {
      console.error('상태 변경 오류:', err)
    } finally {
      setProcessingId(null)
    }
  }

  // ── 렌더 상태 ─────────────────────────────────
  const isLoading = isSearchMode ? searchLoading : initialLoading
  const isEmpty   = !isLoading && rooms.length === 0

  return (
    <div>
      {/* Pull-to-refresh 인디케이터 */}
      {(pullDistance > 0 || refreshing) && (
        <div className="flex items-center justify-center transition-all"
          style={{ height: refreshing ? 40 : pullDistance * 0.57 }}>
          <Loader2 size={20} className={`text-white/40 ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: `rotate(${pullDistance * 3}deg)` }} />
        </div>
      )}

      {/* 검색바 + 기간 버튼 + 내보내기 버튼 */}
      <div className="px-4 pt-4 pb-2 flex gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-slate-900 rounded-xl border border-white/5 shadow-sm">
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            type="text"
            placeholder="객실번호·작성자·구분·위치·분류·내용 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-white/30 hover:text-white/60 transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setDateOpen((v) => !v)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm transition-colors shadow-sm ${
            dateOpen ? 'bg-slate-800 border-amber-400/50 text-white' : 'bg-slate-900 border-white/5 text-white/50 hover:bg-slate-800'
          }`}
        >
          <CalendarDays size={15} />
          <span className="hidden sm:inline">기간</span>
        </button>
        <button
          onClick={() => handleExport('excel')}
          disabled={exporting || lightRecords.length === 0}
          className="shrink-0 flex items-center px-2.5 py-2.5 rounded-xl border
            border-white/5 bg-slate-900 text-white/50 hover:bg-slate-800 shadow-sm
            disabled:opacity-30 transition-colors"
          title="엑셀 저장"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
        </button>
        <button
          onClick={() => handleExport('print')}
          disabled={exporting || lightRecords.length === 0}
          className="shrink-0 flex items-center px-2.5 py-2.5 rounded-xl border
            border-white/5 bg-slate-900 text-white/50 hover:bg-slate-800 shadow-sm
            disabled:opacity-30 transition-colors"
          title="PDF 인쇄"
        >
          <Printer size={15} />
        </button>
      </div>

      {/* 날짜 범위 입력 패널 */}
      {dateOpen && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <input type="date" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-900 rounded-xl border border-white/5
              text-white text-sm outline-none focus:border-amber-400/50" />
          <span className="text-white/30 text-sm shrink-0">~</span>
          <input type="date" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-900 rounded-xl border border-white/5
              text-white text-sm outline-none focus:border-amber-400/50" />
          <button
            onClick={() => { setDateFrom(dayjs().subtract(30, 'day').format('YYYY-MM-DD')); setDateTo(dayjs().format('YYYY-MM-DD')) }}
            className="shrink-0 px-2.5 py-2 bg-slate-900 rounded-xl border border-white/5 text-xs text-white/50 hover:bg-slate-800">
            30일
          </button>
          <button
            onClick={() => { setDateFrom(dayjs().subtract(90, 'day').format('YYYY-MM-DD')); setDateTo(dayjs().format('YYYY-MM-DD')) }}
            className="shrink-0 px-2.5 py-2 bg-slate-900 rounded-xl border border-white/5 text-xs text-white/50 hover:bg-slate-800">
            90일
          </button>
        </div>
      )}

      {/* 상태 필터 칩 */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => setStatusFilter(opt)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
              statusFilter === opt
                ? 'bg-amber-400 text-slate-950 border-transparent shadow-sm'
                : 'bg-slate-900 border-white/5 text-white/60 hover:bg-slate-800'
            }`}
          >
            {opt}
            <span className="ml-1.5 text-xs opacity-70">{countFor(opt)}</span>
          </button>
        ))}
      </div>

      {/* 목록 본문 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-white/30">하자 기록이 없습니다</p>
        </div>
      ) : (
        <div className="px-4 pb-6 space-y-2">
          {rooms.map((room) => {
            const isOpen  = openRooms.has(room)
            const count   = getCount(room)
            const records = getRecords(room)

            return (
              <section key={room} className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                {/* 객실번호 헤더 — 아코디언 토글 */}
                <button
                  onClick={() => handleToggleRoom(room)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white/70">{room}</span>
                    <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                      {count}건
                    </span>
                  </div>
                  {loadingRoom === room
                    ? <Loader2 size={15} className="text-white/30 animate-spin shrink-0" />
                    : isOpen
                      ? <ChevronUp size={15} className="text-white/30 shrink-0" />
                      : <ChevronDown size={15} className="text-white/30 shrink-0" />
                  }
                </button>

                {/* 카드 목록 */}
                {isOpen && (
                  <div className="px-3 pb-3 space-y-3 border-t border-white/8">
                    {records.map((record) => {
                      const isProcessing = processingId?.startsWith(record.id)
                      return (
                        <div
                          key={record.id}
                          className="w-full flex items-center gap-2 px-3 py-3.5 rounded-2xl bg-slate-950
                            border border-white/5 mt-2 shadow-sm transition-all hover:bg-slate-800"
                        >
                          <button
                            onClick={() => navigate(`/defect/${record.id}`)}
                            className="flex-1 text-left min-w-0 active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white truncate">
                                {record.division} · {(() => {
                                  const locs = record.location.split(',').filter(Boolean)
                                  return locs.length > 1
                                    ? `${locs[0].trim()} 외 ${locs.length - 1}개`
                                    : (locs[0] || '').trim()
                                })()}
                              </span>
                              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[record.status]}`}>
                                {record.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {record.category && (
                                <span className="text-xs text-white/40">{record.category}</span>
                              )}
                              <span className="text-xs text-white/30 ml-auto">
                                {record.users?.name}
                              </span>
                            </div>
                            {record.memo && (
                              <p className="mt-1 text-sm text-white/40 truncate">{record.memo}</p>
                            )}
                          </button>

                          {/* 빠른 상태 변경 버튼 */}
                          {record.status !== '완료' && (
                            <div className="shrink-0 flex flex-col gap-1">
                              {record.status === '미완료' && (
                                <button
                                  onClick={(e) => handleQuickStatus(e, record, '처리중')}
                                  disabled={isProcessing}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                                    bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/35
                                    transition-all active:scale-95 disabled:opacity-40"
                                >
                                  {processingId === `${record.id}-처리중`
                                    ? <Loader2 size={11} className="animate-spin" />
                                    : <CheckCircle size={11} />
                                  }
                                  처리중
                                </button>
                              )}
                              <button
                                onClick={(e) => handleQuickStatus(e, record, '완료')}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                                  bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/35
                                  transition-all active:scale-95 disabled:opacity-40"
                              >
                                {processingId === `${record.id}-완료`
                                  ? <Loader2 size={11} className="animate-spin" />
                                  : <CheckCircle size={11} />
                                }
                                완료
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
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
