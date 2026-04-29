import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp, CalendarDays, CheckCircle, Loader2, FileSpreadsheet, Printer, MessageSquare, Send, X } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useRefreshStore from '../../store/useRefreshStore'
import useAuthStore from '../../store/useAuthStore'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { getMasterData, getCachedDataSync, CACHE_KEYS } from '../../utils/masterCache'
import { downloadExcel, openPrintWindow, prepareFacilityExport } from '../../utils/exportUtils'

// 상태별 뱃지 색상
const STATUS_COLOR = {
  접수대기: 'bg-zinc-500/30 text-zinc-300',
  처리중:   'bg-blue-500/20 text-blue-400',
  완료:     'bg-emerald-500/20 text-emerald-400',
  이관:     'bg-purple-500/20 text-purple-400',
}

// 상태 필터 칩 목록
const FILTER_OPTIONS = [
  { label: 'All',    value: 'all' },
  { label: '미완료', value: 'incomplete' },
  { label: '접수대기', value: '접수대기' },
  { label: '처리중',   value: '처리중' },
  { label: '완료',     value: '완료' },
  { label: '이관',     value: '이관' },
]

// Phase 2 전체 필드 select
const FULL_SELECT = `id, room_no, location_type, facility_type_name, note, status, is_urgent, work_date, created_at, accepted_by,
  users!author_id(name),
  facility_order_remarks(id, content, created_at, author:users!author_id(name))`

export default function FacilityOrderListPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { refreshKey, triggerRefresh } = useRefreshStore()
  const isManager = ['admin', 'manager', 'supervisor'].includes(user?.role)
  const { pullDistance, refreshing } = usePullToRefresh(useCallback(() => { triggerRefresh() }, [triggerRefresh]))

  const [dateFrom, setDateFrom] = useState(() => dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [dateTo,   setDateTo]   = useState(() => dayjs().format('YYYY-MM-DD'))
  const [dateOpen, setDateOpen] = useState(false)

  const [policies, setPolicies] = useState(() => getCachedDataSync(CACHE_KEYS.appPolicies) || [])

  // ── Phase 1: RPC 집계 결과 { work_date, status, is_urgent, cnt }[] ──
  const [rpcSummary,     setRpcSummary]     = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  // ── Phase 2: 날짜별 전체 레코드 캐시 ─────────────
  const [dateCache,    setDateCache]    = useState({})
  const [loadingDate,  setLoadingDate]  = useState(null)

  const [search,        setSearch]        = useState('')
  const [searchRecords, setSearchRecords] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimerRef = useRef(null)

  const [statusFilter, setStatusFilter] = useState('all')
  const [openDates,    setOpenDates]    = useState(new Set())
  const [exporting,    setExporting]    = useState(false)

  const isSearchMode = search.trim().length > 0

  // ── Phase 1: RPC로 서버 집계 (1000건 제한 우회) ─
  useEffect(() => {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10000)

    const fetchCounts = async () => {
      setInitialLoading(true)
      setDateCache({})
      setOpenDates(new Set())
      try {
        const { data, error } = await supabase
          .rpc('get_facility_order_date_counts', { p_from: dateFrom, p_to: dateTo })
          .abortSignal(controller.signal)

        if (!error && data) setRpcSummary(data)
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('오더 집계 로드 오류:', err)
      } finally {
        clearTimeout(timeoutId)
        setInitialLoading(false)
      }
    }

    fetchCounts()
    getMasterData(CACHE_KEYS.appPolicies).then(setPolicies).catch(console.error)

    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [refreshKey, dateFrom, dateTo])

  // ── Phase 2: 날짜 클릭 시 전체 레코드 로드 ───
  const handleToggleDate = async (date) => {
    if (isSearchMode) {
      setOpenDates((prev) => {
        const next = new Set(prev)
        next.has(date) ? next.delete(date) : next.add(date)
        return next
      })
      return
    }
    if (openDates.has(date)) {
      setOpenDates((prev) => { const next = new Set(prev); next.delete(date); return next })
      return
    }
    if (dateCache[date]) {
      setOpenDates((prev) => new Set([...prev, date]))
      return
    }
    setLoadingDate(date)
    try {
      const { data, error } = await supabase
        .from('facility_orders')
        .select(FULL_SELECT)
        .eq('work_date', date)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setDateCache((prev) => ({ ...prev, [date]: data }))
        setOpenDates((prev) => new Set([...prev, date]))
      }
    } catch (err) {
      console.error('날짜별 오더 로드 오류:', err)
    } finally {
      setLoadingDate(null)
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
          .from('facility_orders')
          .select(FULL_SELECT)
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .order('work_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (!error && data) {
          const filtered = data.filter((r) =>
            (r.room_no || '').includes(q) ||
            (r.users?.name || '').includes(q) ||
            (r.note || '').includes(q) ||
            (r.facility_type_name || '').includes(q)
          )
          setSearchRecords(filtered)
          const dates = [...new Set(filtered.map((r) => r.work_date))]
          setOpenDates(new Set(dates))
        }
      } catch (err) {
        console.error('오더 검색 오류:', err)
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
        .from('facility_orders')
        .select(FULL_SELECT)
        .gte('work_date', dateFrom)
        .lte('work_date', dateTo)
        .order('work_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (error || !data) throw new Error('데이터 조회 실패')

      const { excelHeaders, excelRows, printHeaders, printRows } =
        await prepareFacilityExport(data, policies)
      const dateRange = `${dateFrom} ~ ${dateTo}`
      const filename  = `오더_${dateFrom}_${dateTo}`
      if (type === 'excel') {
        downloadExcel(excelHeaders, excelRows, filename)
      } else {
        openPrintWindow('오더 목록', printHeaders, printRows, dateRange)
      }
    } catch (err) {
      console.error('내보내기 오류:', err)
      alert('내보내기 중 오류가 발생했습니다.')
    } finally {
      setExporting(false)
    }
  }

  // ── RPC 결과에서 날짜별/상태별/긴급 건수 도출 ─
  const { dateCounts, statusCounts, urgentCounts } = useMemo(() => {
    const dc = {}, sc = {}, uc = {}
    for (const r of rpcSummary) {
      const cnt = Number(r.cnt)
      dc[r.work_date] = (dc[r.work_date] || 0) + cnt
      sc[r.status]    = (sc[r.status]    || 0) + cnt
      if (r.is_urgent) uc[r.work_date] = (uc[r.work_date] || 0) + cnt
    }
    return { dateCounts: dc, statusCounts: sc, urgentCounts: uc }
  }, [rpcSummary])

  // ── 상태 필터 건수 ────────────────────────────
  const countFor = (val) => {
    const total = Object.values(statusCounts).reduce((s, n) => s + n, 0)
    if (val === 'all')        return total
    if (val === 'incomplete') return total - (statusCounts['완료'] || 0) - (statusCounts['이관'] || 0)
    return statusCounts[val] || 0
  }

  // ── 검색 모드 그룹 ────────────────────────────
  const searchGrouped = useMemo(() => {
    let list = searchRecords
    if (statusFilter === 'incomplete') list = list.filter((r) => r.status !== '완료' && r.status !== '이관')
    else if (statusFilter !== 'all')   list = list.filter((r) => r.status === statusFilter)
    return list.reduce((acc, r) => {
      acc[r.work_date] = acc[r.work_date] || []
      acc[r.work_date].push(r)
      return acc
    }, {})
  }, [searchRecords, statusFilter])

  // ── 표시할 날짜 목록 ──────────────────────────
  const groupDates = useMemo(() => {
    if (isSearchMode) return Object.keys(searchGrouped).sort((a, b) => b.localeCompare(a))
    return Object.keys(dateCounts).sort((a, b) => b.localeCompare(a))
  }, [isSearchMode, searchGrouped, dateCounts])

  // ── 날짜의 표시 레코드 (필터 적용 + 긴급 먼저) ──
  const getRecords = (date) => {
    let list = isSearchMode ? (searchGrouped[date] || []) : (dateCache[date] || [])
    if (!isSearchMode) {
      if (statusFilter === 'incomplete') list = list.filter((r) => r.status !== '완료' && r.status !== '이관')
      else if (statusFilter !== 'all')   list = list.filter((r) => r.status === statusFilter)
    }
    return [...list].sort((a, b) => (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0))
  }

  // ── 날짜 헤더의 건수 배지 ─────────────────────
  const getCount = (date) => isSearchMode
    ? (searchGrouped[date] || []).length
    : (dateCounts[date] || 0)

  // ── 긴급 건수 ────────────────────────────────
  const getUrgentCount = (date) => {
    if (isSearchMode) return (searchGrouped[date] || []).filter((r) => r.is_urgent).length
    return urgentCounts[date] || 0
  }

  // ── 빠른 상태 변경 ───────────────────────────
  const [processingId, setProcessingId] = useState(null)
  const [remarkOpenId,   setRemarkOpenId]   = useState(null)
  const [remarkInputs,   setRemarkInputs]   = useState({})
  const [sendingRemark,  setSendingRemark]  = useState(null)
  const [kbHeight,       setKbHeight]       = useState(0)
  const remarkInputRef = useRef(null)

  const handleQuickStatus = async (e, record, newStatus) => {
    e.stopPropagation()
    if (processingId) return
    setProcessingId(`${record.id}-${newStatus}`)
    try {
      const updatePayload = newStatus === '처리중'
        ? { status: newStatus, accepted_by: user?.id }
        : { status: newStatus }

      const { error } = await supabase
        .from('facility_orders')
        .update(updatePayload)
        .eq('id', record.id)

      if (!error) {
        // dateCache 업데이트
        setDateCache((prev) => ({
          ...prev,
          [record.work_date]: (prev[record.work_date] || []).map((r) =>
            r.id === record.id
              ? { ...r, status: newStatus, accepted_by: newStatus === '처리중' ? user?.id : r.accepted_by }
              : r
          ),
        }))
        // 검색 모드 업데이트
        setSearchRecords((prev) => prev.map((r) =>
          r.id === record.id
            ? { ...r, status: newStatus, accepted_by: newStatus === '처리중' ? user?.id : r.accepted_by }
            : r
        ))
      }
    } catch (err) {
      console.error('상태 변경 오류:', err)
    } finally {
      setProcessingId(null)
    }
  }

  // ── iOS 키보드 높이 감지 ──────────────────────
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const diff = window.innerHeight - vv.height - vv.offsetTop
      setKbHeight(diff > 50 ? diff : 0)
    }
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
    }
  }, [])

  useEffect(() => {
    if (remarkOpenId) {
      setTimeout(() => remarkInputRef.current?.focus(), 100)
    } else {
      setKbHeight(0)
    }
  }, [remarkOpenId])

  // ── 인라인 리마크 전송 ────────────────────────
  const handleSendInlineRemark = async (e, orderId) => {
    e.stopPropagation()
    const content = (remarkInputs[orderId] || '').trim()
    if (!content || sendingRemark) return
    setSendingRemark(orderId)
    const { error } = await supabase
      .from('facility_order_remarks')
      .insert({ facility_order_id: orderId, author_id: user?.id, content })

    if (!error) {
      const newRemark = { id: Date.now(), content, created_at: new Date().toISOString(), author: { name: user?.name || '' } }
      // dateCache 업데이트
      setDateCache((prev) => {
        const next = { ...prev }
        for (const date of Object.keys(next)) {
          next[date] = next[date].map((r) => {
            if (r.id !== orderId) return r
            return { ...r, facility_order_remarks: [...(r.facility_order_remarks || []), newRemark] }
          })
        }
        return next
      })
      // 검색 모드 업데이트
      setSearchRecords((prev) => prev.map((r) => {
        if (r.id !== orderId) return r
        return { ...r, facility_order_remarks: [...(r.facility_order_remarks || []), newRemark] }
      }))
      setRemarkInputs((prev) => ({ ...prev, [orderId]: '' }))
      setRemarkOpenId(null)
    }
    setSendingRemark(null)
  }

  // ── 렌더 상태 ─────────────────────────────────
  const isLoading = isSearchMode ? searchLoading : initialLoading
  const isEmpty   = !isLoading && groupDates.length === 0

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

      {/* 검색바 + 날짜범위 버튼 */}
      <div className="px-4 pt-4 pb-2 flex gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-slate-900 rounded-xl border border-white/5 shadow-sm">
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            type="text"
            placeholder="객실번호·작성자·메모 검색"
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
          disabled={exporting || rpcSummary.length === 0}
          className="shrink-0 flex items-center gap-1 px-2.5 py-2.5 rounded-xl border
            border-white/5 bg-slate-900 text-white/50 hover:bg-slate-800 shadow-sm
            disabled:opacity-30 transition-colors"
          title="엑셀 저장"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
        </button>
        <button
          onClick={() => handleExport('print')}
          disabled={exporting || rpcSummary.length === 0}
          className="shrink-0 flex items-center gap-1 px-2.5 py-2.5 rounded-xl border
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
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
              statusFilter === opt.value
                ? 'bg-amber-400 text-slate-950 border-transparent shadow-sm'
                : 'bg-slate-900 border-white/5 text-white/60 hover:bg-slate-800'
            }`}
          >
            {opt.label}
            <span className="ml-1.5 text-xs opacity-70">{countFor(opt.value)}</span>
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
          <p className="text-sm text-white/30">오더가 없습니다</p>
        </div>
      ) : (
        <div className="px-4 pb-6 space-y-2">
          {groupDates.map((date) => {
            const isOpen      = openDates.has(date)
            const count       = getCount(date)
            const urgentCount = getUrgentCount(date)
            const records     = getRecords(date)

            return (
              <section key={date} className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                {/* 날짜 헤더 — 아코디언 토글 */}
                <button
                  onClick={() => handleToggleDate(date)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white/70">
                      {dayjs(date).format('YYYY-MM-DD (ddd)')}
                    </span>
                    <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                      {count}건
                    </span>
                    {urgentCount > 0 && (
                      <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                        🚨 {urgentCount}건
                      </span>
                    )}
                  </div>
                  {loadingDate === date
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
                      const showButtons  = record.status !== '완료' && record.status !== '이관'
                      const canComplete  = isManager || !record.accepted_by || user?.id === record.accepted_by
                      const latestRemark = (record.facility_order_remarks || [])
                        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
                      const isRemarkOpen = remarkOpenId === record.id
                      return (
                        <div
                          key={record.id}
                          className={`rounded-2xl border mt-2 overflow-hidden transition-all ${
                            record.is_urgent
                              ? 'bg-rose-500/5 border-rose-500/20 shadow-sm'
                              : 'bg-slate-950 border-white/5 shadow-sm'
                          }`}
                        >
                          <button
                            onClick={() => navigate(`/facility-order/${record.id}`)}
                            className="w-full text-left px-3 pt-3.5 pb-2 active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-2">
                              {record.is_urgent && (
                                <span className="text-xs text-red-400 shrink-0">🚨</span>
                              )}
                              <span className="text-base font-bold text-white">
                                {record.room_no || record.location_type || ''}
                              </span>
                              <span className="text-sm text-white/60 truncate">{record.facility_type_name}</span>
                              <span className={`ml-auto shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[record.status] || 'bg-zinc-500/30 text-zinc-300'}`}>
                                {record.status}
                              </span>
                            </div>
                            {record.note && (
                              <p className="mt-1 text-sm text-white/50 truncate">{record.note}</p>
                            )}
                            {latestRemark && (
                              <div className="mt-1.5 flex items-start gap-1">
                                <MessageSquare size={11} className="text-amber-400/60 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-400/70 line-clamp-2">
                                  {latestRemark.author?.name}: {latestRemark.content}
                                </p>
                              </div>
                            )}
                            <p className="mt-1 text-xs text-white/30">{record.users?.name}</p>
                          </button>

                          <div className="flex border-t border-white/5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRemarkOpenId(isRemarkOpen ? null : record.id)
                              }}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors
                                ${isRemarkOpen ? 'text-amber-400 bg-amber-400/10' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
                            >
                              <MessageSquare size={12} />
                              리마크
                            </button>

                            {showButtons && (
                              <>
                                <div className="w-px bg-white/5" />
                                {record.status === '접수대기' && (
                                  <button
                                    onClick={(e) => handleQuickStatus(e, record, '처리중')}
                                    disabled={isProcessing}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium
                                      text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
                                  >
                                    {processingId === `${record.id}-처리중`
                                      ? <Loader2 size={12} className="animate-spin" />
                                      : <CheckCircle size={12} />
                                    }
                                    접수
                                  </button>
                                )}
                                <div className="w-px bg-white/5" />
                                <button
                                  onClick={(e) => canComplete ? handleQuickStatus(e, record, '완료') : e.stopPropagation()}
                                  disabled={isProcessing || !canComplete}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium
                                    transition-colors disabled:opacity-25
                                    enabled:text-emerald-400 enabled:hover:bg-emerald-500/10"
                                >
                                  {processingId === `${record.id}-완료`
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <CheckCircle size={12} />
                                  }
                                  완료
                                </button>
                              </>
                            )}
                          </div>
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

      {/* 리마크 fixed 하단 입력바 */}
      {remarkOpenId && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRemarkOpenId(null)} />
          <div
            className="fixed left-0 right-0 z-50 px-3 py-2 bg-slate-900 border-t border-white/10 flex gap-2 items-center"
            style={{ bottom: kbHeight }}
          >
            <textarea
              ref={remarkInputRef}
              value={remarkInputs[remarkOpenId] || ''}
              onChange={(e) => setRemarkInputs((prev) => ({ ...prev, [remarkOpenId]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Escape') setRemarkOpenId(null) }}
              placeholder="리마크 입력 (버튼으로 전송)"
              rows={1}
              style={{ fontSize: '16px', maxHeight: '96px' }}
              className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-3 py-2.5
                text-white placeholder:text-white/25 outline-none resize-none
                focus:border-amber-400/40 transition-colors"
              onInput={(e) => {
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`
              }}
            />
            <button
              onClick={(e) => handleSendInlineRemark(e, remarkOpenId)}
              disabled={!(remarkInputs[remarkOpenId] || '').trim() || sendingRemark === remarkOpenId}
              className="shrink-0 w-10 h-10 rounded-xl bg-amber-400 text-slate-900
                flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
            >
              {sendingRemark === remarkOpenId
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />
              }
            </button>
          </div>
        </>
      )}
    </div>
  )
}
