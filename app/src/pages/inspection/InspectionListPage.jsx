import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp, CalendarDays, CheckCircle, Loader2, X } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import { getMasterData, getCachedDataSync, CACHE_KEYS, getPolicy } from '../../utils/masterCache'
import { getBadgeClass } from '../../utils/statusColors'
import useRefreshStore from '../../store/useRefreshStore'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'

export default function InspectionListPage() {
  const navigate = useNavigate()
  const { refreshKey, triggerRefresh } = useRefreshStore()
  const { pullDistance, refreshing } = usePullToRefresh(useCallback(() => { triggerRefresh() }, [triggerRefresh]))

  const [statuses, setStatuses] = useState(() => getCachedDataSync(CACHE_KEYS.inspectionStatuses) || [])
  const [policies, setPolicies] = useState(() => getCachedDataSync(CACHE_KEYS.appPolicies) || [])

  const [dateFrom, setDateFrom] = useState(() => dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [dateTo,   setDateTo]   = useState(() => dayjs().format('YYYY-MM-DD'))
  const [dateOpen, setDateOpen] = useState(false)

  // ── 기본 모드: 날짜별 건수(초경량) + 날짜별 레코드 캐시 ──
  const [dateCounts,    setDateCounts]    = useState({}) // { 'YYYY-MM-DD': count }
  const [dateCache,     setDateCache]     = useState({}) // { 'YYYY-MM-DD': records[] }
  const [loadingDate,   setLoadingDate]   = useState(null)
  const [initialLoading, setInitialLoading] = useState(true)

  // ── 검색 모드 ─────────────────────────────────
  const [search,        setSearch]        = useState('')
  const [searchRecords, setSearchRecords] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimerRef = useRef(null)

  const isSearchMode = search.trim().length > 0

  const [openDates,    setOpenDates]    = useState(new Set())
  const [processingId, setProcessingId] = useState(null)

  // ── Phase 1: 날짜+건수 초기 로드 (work_date 컬럼만) ──
  useEffect(() => {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10000)

    const fetchDateCounts = async () => {
      setInitialLoading(true)
      setDateCache({})   // 기간 변경 시 캐시 초기화
      setOpenDates(new Set())
      try {
        const { data, error } = await supabase
          .from('inspections')
          .select('work_date')
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .abortSignal(controller.signal)

        if (!error && data) {
          // 클라이언트에서 날짜별 건수 집계
          const counts = data.reduce((acc, r) => {
            acc[r.work_date] = (acc[r.work_date] || 0) + 1
            return acc
          }, {})
          setDateCounts(counts)
        }
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('날짜 목록 로드 오류:', err)
      } finally {
        setInitialLoading(false)
      }
    }

    fetchDateCounts()
    getMasterData(CACHE_KEYS.inspectionStatuses).then(setStatuses).catch(console.error)
    getMasterData(CACHE_KEYS.appPolicies).then(setPolicies).catch(console.error)

    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [refreshKey, dateFrom, dateTo])

  // ── Phase 2: 날짜 클릭 시 해당 날짜 레코드만 로드 ──
  const handleToggleDate = async (date) => {
    // 검색 모드 — 이미 데이터 있으므로 토글만
    if (isSearchMode) {
      setOpenDates((prev) => {
        const next = new Set(prev)
        next.has(date) ? next.delete(date) : next.add(date)
        return next
      })
      return
    }
    // 기본 모드 — 열려있으면 닫기
    if (openDates.has(date)) {
      setOpenDates((prev) => { const next = new Set(prev); next.delete(date); return next })
      return
    }
    // 캐시에 있으면 바로 열기
    if (dateCache[date]) {
      setOpenDates((prev) => new Set([...prev, date]))
      return
    }
    // 캐시 없으면 서버 쿼리 → 캐시 저장 → 오픈
    setLoadingDate(date)
    try {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, room_no, status, note, work_date, created_at, users!author_id(name)')
        .eq('work_date', date)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setDateCache((prev) => ({ ...prev, [date]: data }))
        setOpenDates((prev) => new Set([...prev, date]))
      }
    } catch (err) {
      console.error('날짜별 레코드 로드 오류:', err)
    } finally {
      setLoadingDate(null)
    }
  }

  // ── 검색 모드: debounce 300ms 후 서버 전체 쿼리 + 클라이언트 필터 ──
  useEffect(() => {
    const q = search.trim()
    if (!q) {
      setSearchRecords([])
      return
    }

    clearTimeout(searchTimerRef.current)
    setSearchLoading(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('inspections')
          .select('id, room_no, status, note, work_date, created_at, users!author_id(name)')
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .order('work_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (!error && data) {
          // 작성자명 포함 클라이언트 필터
          const filtered = data.filter((r) =>
            r.room_no.includes(q) ||
            (r.users?.name || '').includes(q) ||
            (r.note || '').includes(q)
          )
          setSearchRecords(filtered)
          // 검색 결과 날짜 전체 자동 오픈
          const dates = [...new Set(filtered.map((r) => r.work_date))]
          setOpenDates(new Set(dates))
        }
      } catch (err) {
        console.error('검색 오류:', err)
      } finally {
        setSearchLoading(false)
      }
    }, 300)

    return () => clearTimeout(searchTimerRef.current)
  }, [search, dateFrom, dateTo])

  // ── 일일 리셋 기준 시각 ───────────────────────
  const todayDate = useMemo(() => {
    const resetHour = parseInt(getPolicy(policies, 'daily_reset_hour', '0'), 10)
    const now = dayjs()
    return now.hour() < resetHour ? now.subtract(1, 'day').format('YYYY-MM-DD') : now.format('YYYY-MM-DD')
  }, [policies])

  // ── 그룹 내 정렬 정책 ─────────────────────────
  const sortPolicy = getPolicy(policies, 'inspection_list_sort', 'room_no')

  const sortRecords = (list) => {
    if (sortPolicy === 'created_at') {
      return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    if (sortPolicy === 'status_priority') {
      const priority = (r) => r.status === '완료' ? 1 : 0
      return [...list].sort((a, b) => priority(a) - priority(b) || a.room_no.localeCompare(b.room_no, 'ko'))
    }
    return [...list].sort((a, b) => a.room_no.localeCompare(b.room_no, 'ko'))
  }

  // ── 표시할 날짜 목록 / 레코드 / 건수 ─────────
  const { groupDates, getRecords, getCounts } = useMemo(() => {
    if (isSearchMode) {
      // 검색 모드 — searchRecords 기반 그룹핑
      const grouped = searchRecords.reduce((acc, r) => {
        acc[r.work_date] = acc[r.work_date] || []
        acc[r.work_date].push(r)
        return acc
      }, {})
      return {
        groupDates: Object.keys(grouped).sort((a, b) => b.localeCompare(a)),
        getRecords: (date) => grouped[date] || [],
        getCounts:  (date) => (grouped[date] || []).length,
      }
    }
    // 기본 모드 — dateCounts + dateCache 기반
    return {
      groupDates: Object.keys(dateCounts).sort((a, b) => b.localeCompare(a)),
      getRecords: (date) => dateCache[date] || [],
      getCounts:  (date) => dateCounts[date] || 0,
    }
  }, [isSearchMode, searchRecords, dateCounts, dateCache])

  // ── 빠른 완료 처리 ───────────────────────────
  const handleQuickComplete = async (e, record) => {
    e.stopPropagation()
    if (processingId) return
    setProcessingId(record.id)
    try {
      const { error } = await supabase
        .from('inspections')
        .update({ status: '완료' })
        .eq('id', record.id)
      if (!error) {
        // 기본 모드 캐시 업데이트
        setDateCache((prev) => ({
          ...prev,
          [record.work_date]: (prev[record.work_date] || []).map((r) =>
            r.id === record.id ? { ...r, status: '완료' } : r
          ),
        }))
        // 검색 모드 결과도 업데이트
        setSearchRecords((prev) => prev.map((r) =>
          r.id === record.id ? { ...r, status: '완료' } : r
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
          {/* 검색어 지우기 버튼 */}
          {search && (
            <button onClick={() => setSearch('')} className="text-white/30 hover:text-white/60 transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
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

      {/* 목록 본문 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-white/30">
            {isSearchMode ? '검색 결과 없음' : '기록이 없습니다'}
          </p>
        </div>
      ) : (
        <div className="px-4 pb-6 space-y-2">
          {groupDates.map((date) => {
            const isOpen       = openDates.has(date)
            const isToday      = date === todayDate
            const isDateLoading = loadingDate === date
            const records      = getRecords(date)
            const count        = getCounts(date)

            return (
              <section key={date} className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                {/* 날짜 헤더 — 아코디언 토글 */}
                <button
                  onClick={() => handleToggleDate(date)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isToday ? 'text-amber-400' : 'text-white/70'}`}>
                      {dayjs(date).format('YYYY-MM-DD (ddd)')}
                      {isToday && <span className="ml-1.5 text-xs">오늘</span>}
                    </span>
                    <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                      {count}건
                    </span>
                  </div>
                  {isDateLoading
                    ? <Loader2 size={15} className="text-white/30 animate-spin shrink-0" />
                    : isOpen
                      ? <ChevronUp   size={15} className="text-white/30 shrink-0" />
                      : <ChevronDown size={15} className="text-white/30 shrink-0" />
                  }
                </button>

                {/* 카드 목록 — 열려있고 데이터 있을 때만 렌더 */}
                {isOpen && records.length > 0 && (
                  <div className="px-3 pb-3 space-y-3 border-t border-white/8">
                    {sortRecords(records).map((record) => {
                      const showComplete = ['환기중', '진행중', '시설'].includes(record.status)
                      const isProcessing = processingId === record.id
                      return (
                        <div key={record.id}
                          className="w-full flex items-center gap-2 px-3 py-3.5 rounded-2xl bg-slate-950
                            border border-white/5 mt-2 shadow-sm transition-all hover:bg-slate-800">
                          {/* 카드 본문 — 클릭 시 상세 이동 */}
                          <button
                            onClick={() => navigate(`/inspection/${record.id}`)}
                            className="flex-1 text-left min-w-0 active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-white">{record.room_no}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getBadgeClass(statuses, record.status)}`}>
                                {record.status}
                              </span>
                              <span className="ml-auto text-xs text-white/40">{record.users?.name}</span>
                            </div>
                            {record.note && (
                              <p className="mt-1 text-sm text-white/50 truncate">{record.note}</p>
                            )}
                          </button>

                          {/* 빠른 완료 버튼 */}
                          {showComplete && (
                            <button
                              onClick={(e) => handleQuickComplete(e, record)}
                              disabled={isProcessing}
                              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                                bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/35
                                transition-all active:scale-95 disabled:opacity-40"
                            >
                              {isProcessing
                                ? <Loader2 size={12} className="animate-spin" />
                                : <CheckCircle size={12} />
                              }
                              완료
                            </button>
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
