import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp, CalendarDays, CheckCircle, Loader2, FileSpreadsheet, Printer, MessageSquare, Send } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useRefreshStore from '../../store/useRefreshStore'
import useAuthStore from '../../store/useAuthStore'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { getMasterData, getCachedDataSync, CACHE_KEYS } from '../../utils/masterCache'
import { downloadExcel, openPrintWindow, prepareFacilityExport } from '../../utils/exportUtils'

// 상태별 뱃지 색상 — '이관' 포함
const STATUS_COLOR = {
  접수대기: 'bg-zinc-500/30 text-zinc-300',
  처리중:   'bg-blue-500/20 text-blue-400',
  완료:     'bg-emerald-500/20 text-emerald-400',
  이관:     'bg-purple-500/20 text-purple-400',
}

// 상태 필터 칩 목록 — All을 첫 번째로
const FILTER_OPTIONS = [
  { label: 'All',      value: 'all' },
  { label: '미완료', value: 'incomplete' },
  { label: '접수대기', value: '접수대기' },
  { label: '처리중',   value: '처리중' },
  { label: '완료',     value: '완료' },
  { label: '이관',     value: '이관' },
]

export default function FacilityOrderListPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { refreshKey, triggerRefresh } = useRefreshStore()
  const isManager = ['admin', 'manager', 'supervisor'].includes(user?.role)
  const { pullDistance, refreshing } = usePullToRefresh(useCallback(() => { triggerRefresh() }, [triggerRefresh]))

  // ── 날짜 범위 — 기본값: 최근 30일 ──────────────
  const [dateFrom, setDateFrom] = useState(() => dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [dateTo,   setDateTo]   = useState(() => dayjs().format('YYYY-MM-DD'))
  // 날짜 범위 입력 패널 열림 여부
  const [dateOpen, setDateOpen] = useState(false)

  const [policies, setPolicies] = useState(
    () => getCachedDataSync(CACHE_KEYS.appPolicies) || []
  )
  const [records, setRecords]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')  // 기본값: All
  const [openDates, setOpenDates]       = useState(new Set())
  const [exporting, setExporting]       = useState(false)  // 내보내기 로딩

  // ── 데이터 로드 — 날짜 범위 서버 필터 적용 ───────
  useEffect(() => {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10000)

    const fetchData = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('facility_orders')
          .select(`id, room_no, location_type, facility_type_name, note, status, is_urgent, work_date, created_at, accepted_by,
            users!author_id(name),
            facility_order_remarks(id, content, created_at, author:users!author_id(name))`)
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .order('work_date', { ascending: false })
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal)

        if (!error && data) {
          setRecords(data)
          const dates = [...new Set(data.map((r) => r.work_date))].sort((a, b) => b.localeCompare(a))
          if (dates.length > 0) setOpenDates(new Set([dates[0]]))
        }
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('시설오더 목록 로드 오류:', err)
      } finally {
        clearTimeout(timeoutId)
        setLoading(false)
      }
    }

    fetchData()
    getMasterData(CACHE_KEYS.appPolicies).then(setPolicies).catch(console.error)

    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [refreshKey, dateFrom, dateTo])

  // ── 내보내기 (엑셀 / PDF인쇄) ─────────────────
  const handleExport = async (type) => {
    if (exporting) return
    setExporting(true)
    try {
      const { excelHeaders, excelRows, printHeaders, printRows } =
        await prepareFacilityExport(filtered, policies)
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

  // ── 날짜 목록 (고유값, 최신순) ───────────────
  const dates = useMemo(() => {
    const unique = [...new Set(records.map((r) => r.work_date))]
    return unique.sort((a, b) => b.localeCompare(a))
  }, [records])

  // ── 상태 필터 + 검색 ──────────────────────────
  const filtered = useMemo(() => {
    let list = records
    if (statusFilter === 'incomplete') list = list.filter((r) => r.status !== '완료' && r.status !== '이관')
    else if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter)

    const q = search.trim()
    if (q) {
      list = list.filter((r) =>
        r.room_no.includes(q) ||
        (r.users?.name || '').includes(q) ||
        (r.note || '').includes(q)
      )
    }
    return list
  }, [records, statusFilter, search])

  // ── 날짜별 그룹 + 긴급 먼저 정렬 ─────────────
  const grouped = useMemo(() => {
    const result = filtered.reduce((acc, r) => {
      acc[r.work_date] = acc[r.work_date] || []
      acc[r.work_date].push(r)
      return acc
    }, {})
    Object.values(result).forEach((arr) =>
      arr.sort((a, b) => (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0))
    )
    return result
  }, [filtered])

  const groupDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  // 각 필터별 건수
  const countFor = (val) => {
    if (val === 'all') return records.length
    if (val === 'incomplete') return records.filter((r) => r.status !== '완료' && r.status !== '이관').length
    return records.filter((r) => r.status === val).length
  }

  // ── 빠른 상태 변경 ───────────────────────────
  const [processingId, setProcessingId] = useState(null)
  // 인라인 리마크 입력창이 열린 오더 ID
  const [remarkOpenId, setRemarkOpenId]   = useState(null)
  const [remarkInputs, setRemarkInputs]   = useState({}) // { [orderId]: string }
  const [sendingRemark, setSendingRemark] = useState(null)

  const handleQuickStatus = async (e, record, newStatus) => {
    e.stopPropagation()
    if (processingId) return
    setProcessingId(`${record.id}-${newStatus}`)
    try {
      // 접수 시 accepted_by 저장
      const updatePayload = newStatus === '처리중'
        ? { status: newStatus, accepted_by: user?.id }
        : { status: newStatus }

      const { error } = await supabase
        .from('facility_orders')
        .update(updatePayload)
        .eq('id', record.id)
      if (!error) {
        setRecords((prev) => prev.map((r) =>
          r.id === record.id ? { ...r, status: newStatus, accepted_by: newStatus === '처리중' ? user?.id : r.accepted_by } : r
        ))
      }
    } catch (err) {
      console.error('상태 변경 오류:', err)
    } finally {
      setProcessingId(null)
    }
  }

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
      // 목록 캐시에 리마크 반영
      setRecords((prev) => prev.map((r) => {
        if (r.id !== orderId) return r
        const newRemark = { id: Date.now(), content, created_at: new Date().toISOString(), author: { name: user?.name || '' } }
        return { ...r, facility_order_remarks: [...(r.facility_order_remarks || []), newRemark] }
      }))
      setRemarkInputs((prev) => ({ ...prev, [orderId]: '' }))
      setRemarkOpenId(null)
    }
    setSendingRemark(null)
  }

  // ── 아코디언 토글 ─────────────────────────────
  const toggleDate = (date) => {
    setOpenDates((prev) => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
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
        </div>
        {/* 날짜범위 토글 버튼 */}
        <button
          onClick={() => setDateOpen((v) => !v)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm transition-colors shadow-sm ${
            dateOpen
              ? 'bg-slate-800 border-amber-400/50 text-white'
              : 'bg-slate-900 border-white/5 text-white/50 hover:bg-slate-800'
          }`}
        >
          <CalendarDays size={15} />
          <span className="hidden sm:inline">기간</span>
        </button>
        {/* 엑셀 내보내기 */}
        <button
          onClick={() => handleExport('excel')}
          disabled={exporting || filtered.length === 0}
          className="shrink-0 flex items-center gap-1 px-2.5 py-2.5 rounded-xl border
            border-white/5 bg-slate-900 text-white/50 hover:bg-slate-800 shadow-sm
            disabled:opacity-30 transition-colors"
          title="엑셀 저장"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
        </button>
        {/* PDF 인쇄 */}
        <button
          onClick={() => handleExport('print')}
          disabled={exporting || filtered.length === 0}
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
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-900 rounded-xl border border-white/5
              text-white text-sm outline-none focus:border-amber-400/50"
          />
          <span className="text-white/30 text-sm shrink-0">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-900 rounded-xl border border-white/5
              text-white text-sm outline-none focus:border-amber-400/50"
          />
          {/* 빠른 선택 버튼 */}
          <button
            onClick={() => { setDateFrom(dayjs().subtract(30, 'day').format('YYYY-MM-DD')); setDateTo(dayjs().format('YYYY-MM-DD')) }}
            className="shrink-0 px-2.5 py-2 bg-slate-900 rounded-xl border border-white/5 text-xs text-white/50 hover:bg-slate-800"
          >
            30일
          </button>
          <button
            onClick={() => { setDateFrom(dayjs().subtract(90, 'day').format('YYYY-MM-DD')); setDateTo(dayjs().format('YYYY-MM-DD')) }}
            className="shrink-0 px-2.5 py-2 bg-slate-900 rounded-xl border border-white/5 text-xs text-white/50 hover:bg-slate-800"
          >
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
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-white/30">오더가 없습니다</p>
        </div>
      ) : (
        <div className="px-4 pb-6 space-y-2">
          {groupDates.map((date) => {
            const isOpen = openDates.has(date)
            return (
              <section key={date} className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                {/* 날짜 헤더 — 아코디언 토글 */}
                <button
                  onClick={() => toggleDate(date)}
                  className="w-full flex items-center justify-between px-4 py-3
                    hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white/70">
                      {dayjs(date).format('YYYY-MM-DD (ddd)')}
                    </span>
                    <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                      {grouped[date].length}건
                    </span>
                    {/* 날짜 내 긴급 건수 */}
                    {grouped[date].some((r) => r.is_urgent) && (
                      <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                        🚨 {grouped[date].filter((r) => r.is_urgent).length}건
                      </span>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronUp size={15} className="text-white/30 shrink-0" />
                    : <ChevronDown size={15} className="text-white/30 shrink-0" />
                  }
                </button>

                {/* 카드 목록 */}
                {isOpen && (
                  <div className="px-3 pb-3 space-y-3 border-t border-white/8">
                    {grouped[date].map((record) => {
                      const isProcessing = processingId?.startsWith(record.id)
                      const showButtons  = record.status !== '완료' && record.status !== '이관'
                      // 완료 권한: 관리자·소장·주임은 누구나, 그 외는 접수자 본인만
                      const canComplete  = isManager || !record.accepted_by || user?.id === record.accepted_by
                      // 최신 리마크 (created_at 내림차순 첫 번째)
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
                          {/* 카드 본문 — 클릭 시 상세 이동 */}
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
                            {/* 최신 리마크 미리보기 */}
                            {latestRemark && (
                              <div className="mt-1.5 flex items-center gap-1">
                                <MessageSquare size={11} className="text-amber-400/60 shrink-0" />
                                <p className="text-xs text-amber-400/70 truncate">
                                  {latestRemark.author?.name}: {latestRemark.content}
                                </p>
                              </div>
                            )}
                            <p className="mt-1 text-xs text-white/30">{record.users?.name}</p>
                          </button>

                          {/* 하단 버튼 행 — 균등 배치 */}
                          <div className="flex border-t border-white/5">
                            {/* 리마크 버튼 — 항상 표시 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRemarkOpenId(isRemarkOpen ? null : record.id)
                              }}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors
                                ${isRemarkOpen
                                  ? 'text-amber-400 bg-amber-400/10'
                                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                                }`}
                            >
                              <MessageSquare size={12} />
                              리마크
                            </button>

                            {/* 상태 변경 버튼 — 완료·이관 제외 */}
                            {showButtons && (
                              <>
                                {/* 구분선 */}
                                <div className="w-px bg-white/5" />

                                {/* 접수 버튼 */}
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

                                {/* 구분선 */}
                                <div className="w-px bg-white/5" />

                                {/* 완료 버튼 — 권한 있는 경우만 활성 */}
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

                          {/* 인라인 리마크 입력창 — 열렸을 때만 표시 */}
                          {isRemarkOpen && (
                            <div className="px-3 pb-3 pt-2 border-t border-white/5 flex gap-2 items-center">
                              <input
                                type="text"
                                value={remarkInputs[record.id] || ''}
                                onChange={(e) => setRemarkInputs((prev) => ({ ...prev, [record.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSendInlineRemark(e, record.id)
                                  if (e.key === 'Escape') setRemarkOpenId(null)
                                }}
                                placeholder="리마크 입력 후 Enter"
                                autoFocus
                                className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2
                                  text-sm text-white placeholder:text-white/25 outline-none
                                  focus:border-amber-400/40 transition-colors"
                              />
                              <button
                                onClick={(e) => handleSendInlineRemark(e, record.id)}
                                disabled={!(remarkInputs[record.id] || '').trim() || sendingRemark === record.id}
                                className="shrink-0 w-9 h-9 rounded-xl bg-amber-400 text-slate-900
                                  flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
                              >
                                {sendingRemark === record.id
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : <Send size={14} />
                                }
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
