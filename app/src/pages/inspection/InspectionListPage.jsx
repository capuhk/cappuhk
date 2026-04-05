import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp, CalendarDays, CheckCircle, Loader2 } from 'lucide-react'
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

  const [statuses, setStatuses] = useState(
    () => getCachedDataSync(CACHE_KEYS.inspectionStatuses) || []
  )
  const [policies, setPolicies] = useState(
    () => getCachedDataSync(CACHE_KEYS.appPolicies) || []
  )

  // ── 날짜 범위 — 기본값: 최근 30일 ──────────────
  const [dateFrom, setDateFrom] = useState(() => dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [dateTo,   setDateTo]   = useState(() => dayjs().format('YYYY-MM-DD'))
  // 날짜 범위 입력 패널 열림 여부
  const [dateOpen, setDateOpen] = useState(false)

  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [openDates, setOpenDates] = useState(new Set())

  // ── 데이터 로드 — 날짜 범위 서버 필터 적용 ───────
  useEffect(() => {
    const controller = new AbortController()
    // 10초 후 자동 중단 — 모바일 네트워크 무한 스피너 방지
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const fetchData = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('inspections')
          .select('id, room_no, status, note, work_date, created_at, users!author_id(name)')
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .order('work_date', { ascending: false })
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal)

        if (!error && data) {
          setRecords(data)
        }
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('인스펙션 목록 로드 오류:', err)
      } finally {
        clearTimeout(timeoutId)
        setLoading(false)
      }
    }

    fetchData()
    getMasterData(CACHE_KEYS.inspectionStatuses).then(setStatuses).catch(console.error)
    getMasterData(CACHE_KEYS.appPolicies).then(setPolicies).catch(console.error)

    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [refreshKey, dateFrom, dateTo])

  // ── 검색 (객실번호 + 작성자) ──────────────────
  const filtered = useMemo(() => {
    let list = records
    const q = search.trim()
    if (q) {
      list = list.filter((r) =>
        r.room_no.includes(q) ||
        (r.users?.name || '').includes(q)
      )
    }
    return list
  }, [records, search])

  // ── 일일 리셋 기준 시각 계산 ─────────────────
  const todayDate = useMemo(() => {
    const resetHour = parseInt(getPolicy(policies, 'daily_reset_hour', '0'), 10)
    const now = dayjs()
    return now.hour() < resetHour ? now.subtract(1, 'day').format('YYYY-MM-DD') : now.format('YYYY-MM-DD')
  }, [policies])

  // ── 날짜별 그룹 ──────────────────────────────
  const grouped = useMemo(() => {
    return filtered.reduce((acc, r) => {
      acc[r.work_date] = acc[r.work_date] || []
      acc[r.work_date].push(r)
      return acc
    }, {})
  }, [filtered])

  // ── 그룹 내 정렬 정책 적용 ───────────────────
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

  const groupDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  // ── 빠른 완료 처리 ───────────────────────────
  const [processingId, setProcessingId] = useState(null)

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
        setRecords((prev) => prev.map((r) =>
          r.id === record.id ? { ...r, status: '완료' } : r
        ))
      }
    } catch (err) {
      console.error('상태 변경 오류:', err)
    } finally {
      setProcessingId(null)
    }
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
        <div
          className="flex items-center justify-center transition-all"
          style={{ height: refreshing ? 40 : pullDistance * 0.57 }}
        >
          <Loader2
            size={20}
            className={`text-white/40 ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: `rotate(${pullDistance * 3}deg)` }}
          />
        </div>
      )}
      {/* 검색바 + 날짜범위 버튼 */}
      <div className="px-4 pt-4 pb-2 flex gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-white/10 rounded-xl border border-white/20">
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            type="text"
            placeholder="객실번호 또는 작성자 검색"
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
          {/* 빠른 선택 버튼 */}
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

      {/* 목록 본문 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-white/30">기록이 없습니다</p>
        </div>
      ) : (
        <div className="px-4 pb-6 space-y-2">
          {groupDates.map((date) => {
            const isOpen = openDates.has(date)
            // 오늘 날짜 강조 표시
            const isToday = date === todayDate
            return (
              <section key={date} className="bg-white/5 rounded-2xl overflow-hidden">
                {/* 날짜 헤더 — 아코디언 토글 */}
                <button
                  onClick={() => toggleDate(date)}
                  className="w-full flex items-center justify-between px-4 py-3
                    hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isToday ? 'text-blue-400' : 'text-white/70'}`}>
                      {dayjs(date).format('YYYY-MM-DD (ddd)')}
                      {isToday && <span className="ml-1.5 text-xs">오늘</span>}
                    </span>
                    <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                      {grouped[date].length}건
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
                    {sortRecords(grouped[date]).map((record) => {
                      // 환기중·진행중·시설일 때 완료 버튼 표시
                      const showComplete = ['환기중', '진행중', '시설'].includes(record.status)
                      const isProcessing = processingId === record.id
                      return (
                        <div
                          key={record.id}
                          className="w-full flex items-center gap-2 px-3 py-3 rounded-xl bg-white/5
                            border border-white/8 mt-2"
                        >
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
                              <span className="ml-auto text-xs text-white/40">
                                {record.users?.name}
                              </span>
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
