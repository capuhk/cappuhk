import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp, CalendarDays } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import { getMasterData, getCachedDataSync, CACHE_KEYS, getPolicy } from '../../utils/masterCache'
import { getBadgeClass } from '../../utils/statusColors'
import useRefreshStore from '../../store/useRefreshStore'

export default function InspectionListPage() {
  const navigate = useNavigate()
  const refreshKey = useRefreshStore((s) => s.refreshKey)

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
          const dates = [...new Set(data.map((r) => r.work_date))].sort((a, b) => b.localeCompare(a))
          if (dates.length > 0) setOpenDates(new Set([dates[0]]))
        }
      } catch (err) {
        // AbortError는 정상 취소 — 그 외는 로그
        if (err?.name !== 'AbortError') console.error('인스펙션 목록 로드 오류:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    getMasterData(CACHE_KEYS.inspectionStatuses).then(setStatuses).catch(console.error)
    getMasterData(CACHE_KEYS.appPolicies).then(setPolicies).catch(console.error)

    // StrictMode 이중 실행 대비 — 언마운트 시 진행 중인 요청 취소
    return () => controller.abort()
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
                    {sortRecords(grouped[date]).map((record) => (
                      <button
                        key={record.id}
                        onClick={() => navigate(`/inspection/${record.id}`)}
                        className="w-full text-left px-4 py-3 rounded-xl bg-white/5
                          border border-white/8 hover:bg-white/10 active:scale-[0.99]
                          transition-all mt-2"
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
