import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp, CheckCircle, Loader2, CalendarDays, FileSpreadsheet, Printer } from 'lucide-react'
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

export default function DefectListPage() {
  const navigate = useNavigate()
  // 헤더 🔄 버튼 트리거 — 변경 시 데이터 재조회
  const { refreshKey, triggerRefresh } = useRefreshStore()
  const { pullDistance, refreshing } = usePullToRefresh(useCallback(() => { triggerRefresh() }, [triggerRefresh]))

  // ── 날짜 범위 — 기본값: 최근 30일 ──────────────
  const [dateFrom, setDateFrom] = useState(() => dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [dateTo,   setDateTo]   = useState(() => dayjs().format('YYYY-MM-DD'))
  const [dateOpen, setDateOpen] = useState(false)

  const [records, setRecords]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  // 'All' 또는 상태값 문자열
  const [statusFilter, setStatusFilter] = useState('All')
  // 객실번호별 아코디언 열림 상태
  const [openRooms, setOpenRooms] = useState(new Set())
  const [exporting, setExporting] = useState(false)  // 내보내기 로딩

  // ── 데이터 로드 ───────────────────────────────
  useEffect(() => {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10000)

    const fetchData = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('defects')
          .select('id, room_no, division, location, category, status, memo, created_at, users!author_id(name)')
          // 날짜 범위 필터 (created_at 기준)
          .gte('created_at', `${dateFrom}T00:00:00`)
          .lte('created_at', `${dateTo}T23:59:59`)
          .order('room_no', { ascending: true })
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal)

        if (!error && data) setRecords(data)
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('객실하자 목록 로드 오류:', err)
      } finally {
        clearTimeout(timeoutId)
        setLoading(false)
      }
    }

    fetchData()

    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [refreshKey, dateFrom, dateTo])

  // ── 내보내기 (엑셀 / PDF인쇄) ─────────────────
  const handleExport = async (type) => {
    if (exporting) return
    setExporting(true)
    try {
      const { excelHeaders, excelRows, printHeaders, printRows } =
        await prepareDefectExport(filtered)
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

  // ── 상태 필터 + 검색 (객실번호 + 작성자) ──────
  const filtered = useMemo(() => {
    let list = records
    if (statusFilter !== 'All') list = list.filter((r) => r.status === statusFilter)

    const q = search.trim()
    if (q) {
      list = list.filter((r) =>
        r.room_no.includes(q) ||
        (r.users?.name  || '').includes(q) ||
        (r.division     || '').includes(q) ||
        (r.location     || '').includes(q) ||
        (r.category     || '').includes(q) ||
        (r.memo         || '').includes(q)
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
        setRecords((prev) => prev.map((r) =>
          r.id === record.id ? { ...r, status: newStatus } : r
        ))
      }
    } catch (err) {
      console.error('상태 변경 오류:', err)
    } finally {
      setProcessingId(null)
    }
  }

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
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-white/10 rounded-xl border border-white/20">
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            type="text"
            placeholder="객실번호·작성자·구분·위치·분류·내용 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 outline-none"
          />
        </div>
        {/* 날짜범위 토글 버튼 */}
        <button
          onClick={() => setDateOpen((v) => !v)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm transition-colors ${
            dateOpen
              ? 'bg-white/20 border-white/40 text-white'
              : 'bg-white/10 border-white/20 text-white/50'
          }`}
        >
          <CalendarDays size={15} />
          <span className="hidden sm:inline">기간</span>
        </button>
        {/* 엑셀 내보내기 */}
        <button
          onClick={() => handleExport('excel')}
          disabled={exporting || filtered.length === 0}
          className="shrink-0 flex items-center px-2.5 py-2.5 rounded-xl border
            border-white/20 bg-white/10 text-white/50 hover:bg-white/15
            disabled:opacity-30 transition-colors"
          title="엑셀 저장"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
        </button>
        {/* PDF 인쇄 */}
        <button
          onClick={() => handleExport('print')}
          disabled={exporting || filtered.length === 0}
          className="shrink-0 flex items-center px-2.5 py-2.5 rounded-xl border
            border-white/20 bg-white/10 text-white/50 hover:bg-white/15
            disabled:opacity-30 transition-colors"
          title="PDF 인쇄"
        >
          <Printer size={15} />
        </button>
      </div>

      {/* 날짜 범위 입력 패널 */}
      {dateOpen && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 px-3 py-2 bg-white/10 rounded-xl border border-white/20
              text-white text-sm outline-none focus:border-white/40"
          />
          <span className="text-white/30 text-sm shrink-0">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 px-3 py-2 bg-white/10 rounded-xl border border-white/20
              text-white text-sm outline-none focus:border-white/40"
          />
          <button
            onClick={() => { setDateFrom(dayjs().subtract(30, 'day').format('YYYY-MM-DD')); setDateTo(dayjs().format('YYYY-MM-DD')) }}
            className="shrink-0 px-2.5 py-2 bg-white/10 rounded-xl border border-white/20 text-xs text-white/50 hover:bg-white/15"
          >
            30일
          </button>
          <button
            onClick={() => { setDateFrom(dayjs().subtract(90, 'day').format('YYYY-MM-DD')); setDateTo(dayjs().format('YYYY-MM-DD')) }}
            className="shrink-0 px-2.5 py-2 bg-white/10 rounded-xl border border-white/20 text-xs text-white/50 hover:bg-white/15"
          >
            90일
          </button>
        </div>
      )}

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
                  <div className="px-3 pb-3 space-y-3 border-t border-white/8">
                    {grouped[room].map((record) => {
                      const isProcessing = processingId?.startsWith(record.id)
                      return (
                        <div
                          key={record.id}
                          className="w-full flex items-center gap-2 px-3 py-3 rounded-xl bg-white/5
                            border border-white/8 mt-2"
                        >
                          {/* 카드 본문 — 클릭 시 상세 이동 */}
                          <button
                            onClick={() => navigate(`/defect/${record.id}`)}
                            className="flex-1 text-left min-w-0 active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-2">
                              {/* 구분/위치 */}
                              <span className="text-sm font-semibold text-white truncate">
                                {record.division} · {(() => {
                                  const locs = record.location.split(',').filter(Boolean)
                                  return locs.length > 1
                                    ? `${locs[0].trim()} 외 ${locs.length - 1}개`
                                    : (locs[0] || '').trim()
                                })()}
                              </span>
                              {/* 상태 뱃지 */}
                              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[record.status]}`}>
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
