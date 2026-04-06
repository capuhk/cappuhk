import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ChevronRight, CheckCircle } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import useAuthStore from '../store/useAuthStore'
import { getMasterData, getCachedDataSync, CACHE_KEYS, getPolicy } from '../utils/masterCache'
import useRefreshStore from '../store/useRefreshStore'
import { usePullToRefresh } from '../hooks/usePullToRefresh'

// 필터 항목 순서 — 완료는 오늘 기준 인스펙션 완료 건
const FILTERS = ['환기중', '진행중', '오더', '완료']

// 유형별 스타일 (배지 + 컬럼 헤더)
const TYPE_STYLE = {
  환기중:  { badge: 'bg-cyan-500/20 text-cyan-400',     header: 'text-cyan-400',     icon: '💨' },
  진행중:  { badge: 'bg-blue-500/20 text-blue-400',     header: 'text-blue-400',     icon: '🚧' },
  오더:{ badge: 'bg-amber-500/20 text-amber-400',   header: 'text-amber-400',    icon: '🛠️' },
  완료:    { badge: 'bg-emerald-500/20 text-emerald-400', header: 'text-emerald-400', icon: '✅' },
}

export default function DashboardPage() {
  const navigate  = useNavigate()
  const { user, isManager } = useAuthStore()

  useEffect(() => {
    if (user && !isManager()) navigate('/', { replace: true })
  }, [user, isManager, navigate])

  // ── 필터 상태 ─────────────────────────────────
  const [filterMode, setFilterMode]       = useState('all')
  const [activeFilters, setActiveFilters] = useState(new Set(FILTERS))

  // ── 오더 탭 서브필터 (전체/객실/시설/공용부) ──
  const [orderSubFilter, setOrderSubFilter] = useState('전체')

  // 헤더 🔄 버튼 트리거 — 변경 시 데이터 재조회
  const { refreshKey, triggerRefresh } = useRefreshStore()
  const { pullDistance, refreshing: pullRefreshing } = usePullToRefresh(useCallback(() => { triggerRefresh() }, [triggerRefresh]))

  const [policies, setPolicies] = useState(
    () => getCachedDataSync(CACHE_KEYS.appPolicies) || []
  )
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(false)

  // ── 필터 버튼 클릭 ────────────────────────────
  const handleFilterClick = (filter) => {
    // 오더 탭 선택 시 서브필터 초기화
    if (filter === '오더') setOrderSubFilter('전체')
    if (filterMode === 'all') {
      setFilterMode('custom')
      setActiveFilters(new Set([filter]))
    } else {
      setActiveFilters((prev) => {
        const next = new Set(prev)
        if (next.has(filter)) {
          next.delete(filter)
          if (next.size === 0) { setFilterMode('all'); return new Set(FILTERS) }
        } else {
          next.add(filter)
          if (next.size === FILTERS.length) { setFilterMode('all'); return new Set(FILTERS) }
        }
        return next
      })
    }
  }

  const handleAllClick = () => {
    setFilterMode('all')
    setActiveFilters(new Set(FILTERS))
    setOrderSubFilter('전체')
  }

  // ── 데이터 로드 ───────────────────────────────
  useEffect(() => {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10000)

    const fetchData = async () => {
      setLoading(true)
      setRows([])
      try {
        // 미처리 현황 (기존 RPC)
        const { data, error } = await supabase
          .rpc('get_unresolved_stats')
          .abortSignal(controller.signal)
        if (error) throw error

        // 오늘 완료된 인스펙션 별도 조회
        const todayStr = dayjs().format('YYYY-MM-DD')
        const { data: completedData, error: completedError } = await supabase
          .from('inspections')
          .select('id, room_no, note, work_date, created_at, users!author_id(name)')
          .eq('status', '완료')
          .eq('work_date', todayStr)
          .abortSignal(controller.signal)
        if (completedError) throw completedError

        // 완료 행을 RPC 반환 형식에 맞게 변환
        const completedRows = (completedData || []).map((r) => ({
          id:        r.id,
          type:      '완료',
          room_no:   r.room_no,
          author:    r.users?.name || '',
          note:      r.note || '',
          work_date: r.work_date,
          created_at: r.created_at,
          sub_label: null,
          status:    '완료',
        }))

        setRows([...(data || []), ...completedRows])
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('대시보드 로드 오류:', err)
      } finally {
        clearTimeout(timeoutId)
        setLoading(false)
      }
    }
    fetchData()
    getMasterData(CACHE_KEYS.appPolicies).then(setPolicies)

    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [refreshKey]) // refreshKey 변경 시 재조회

  // ── 현재 활성 필터 목록 (순서 유지) ──────────
  const visibleFilters = useMemo(
    () => FILTERS.filter((f) =>
      filterMode === 'all' ? true : activeFilters.has(f)
    ),
    [filterMode, activeFilters],
  )

  // ── 미처리 경보 판단 (정책 기준 초과 시 true) ────
  const alertDeadlineMs = parseInt(getPolicy(policies, 'alert_deadline_hours', '48'), 10) * 60 * 60 * 1000
  const isOverDeadline = (row) => {
    if (row.type === '완료') return false
    return Date.now() - new Date(row.created_at).getTime() > alertDeadlineMs
  }

  // ── 유형별로 그룹핑 ───────────────────────────
  const grouped = useMemo(() => {
    const map = {}
    FILTERS.forEach((f) => { map[f] = [] })
    rows.forEach((r) => {
      if (map[r.type]) map[r.type].push(r)
    })
    // 오더 서브필터 적용 — '전체' 이외에는 location_type으로 필터링
    if (orderSubFilter !== '전체') {
      map['오더'] = map['오더'].filter((r) => r.location_type === orderSubFilter)
    }
    return map
  }, [rows, orderSubFilter])

  // ── 상세 이동 ────────────────────────────────
  const handleNavigate = (row) => {
    if (row.type === '오더') navigate(`/facility-order/${row.id}`)
    else navigate(`/inspection/${row.id}`)
  }

  // ── 빠른 완료 처리 ───────────────────────────
  const [processingId, setProcessingId] = useState(null)

  const handleQuickComplete = async (e, row, newStatus) => {
    // 카드 클릭(상세이동) 이벤트 막기
    e.stopPropagation()
    if (processingId) return
    // 버튼별 로딩 식별자 (rowId-status)
    setProcessingId(`${row.id}-${newStatus}`)
    try {
      const table = row.type === '오더' ? 'facility_orders' : 'inspections'
      const { error } = await supabase
        .from(table)
        .update({ status: newStatus })
        .eq('id', row.id)
      if (error) throw error
      // 완료 시 목록에서 제거, 처리중 변경 시 로컬 status 업데이트
      if (newStatus === '완료') {
        setRows((prev) => prev.filter((r) => r.id !== row.id))
      } else {
        // status 필드를 갱신해 접수 버튼을 숨김
        setRows((prev) => prev.map((r) =>
          r.id === row.id ? { ...r, status: newStatus } : r
        ))
      }
    } catch (err) {
      console.error('상태 변경 오류:', err)
    } finally {
      setProcessingId(null)
    }
  }

  // 칸반 컬럼 수 → Tailwind grid 클래스 (최대 4열)
  const colClass = {
    1: 'lg:grid-cols-1',
    2: 'lg:grid-cols-2',
    3: 'lg:grid-cols-3',
    4: 'lg:grid-cols-4',
  }[Math.min(visibleFilters.length, 4)] || 'lg:grid-cols-4'

  // ── 공용 카드 컴포넌트 ────────────────────────
  const Card = ({ row, showBadge }) => {
    // 완료 버튼 표시 여부 (환기중·진행중·오더만)
    const showComplete = ['환기중', '진행중', '오더'].includes(row.type)
    // processingId 형식: "{rowId}-{status}" — 정확히 이 행이 처리 중인지 확인
    const isProcessing = processingId !== null && processingId.startsWith(`${row.id}-`)

    return (
      <div className={`w-full flex items-center gap-2.5 px-3.5 py-3.5
        rounded-2xl transition-all
        ${isOverDeadline(row)
          ? 'bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 shadow-sm'
          : 'bg-slate-900 border border-white/5 hover:bg-slate-800 shadow-sm'
        }`}>

        {/* 카드 본문 — 클릭 시 상세 이동 */}
        <button
          onClick={() => handleNavigate(row)}
          className="flex-1 flex items-center gap-2.5 min-w-0 text-left active:scale-[0.99]"
        >
          {/* 유형 배지 — 전체 모드(칸반)에서는 숨김 */}
          {showBadge && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0
              ${TYPE_STYLE[row.type]?.badge || ''}`}>
              {row.type}
            </span>
          )}

          {/* 객실번호 */}
          <span className="text-sm font-semibold text-white w-11 shrink-0">
            {row.room_no}
          </span>

          {/* 작성자 */}
          <span className="text-xs text-white/30 shrink-0">
            {row.author}
          </span>

          {/* 시설종류 (오더만) */}
          {row.sub_label && (
            <span className="text-xs text-amber-400/70 shrink-0 hidden sm:block">
              {row.sub_label}
            </span>
          )}

          {/* 특이사항 */}
          <span className="text-xs text-white/40 flex-1 truncate">
            {row.note || ''}
          </span>

          {/* 날짜 */}
          <span className="text-xs text-white/20 shrink-0">
            {dayjs(row.work_date).format('M/D')}
          </span>

          {/* 화살표 */}
          <ChevronRight size={14} className="text-white/15 shrink-0" />
        </button>

        {/* 빠른 처리 버튼 영역 */}
        {showComplete && (
          <div className="shrink-0 flex items-center gap-1">
            {/* 오더: 접수대기면 접수+완료, 처리중이면 처리중 뱃지+완료 */}
            {row.type === '오더' ? (
              <>
                {row.status === '처리중' ? (
                  /* 처리중 상태: 버튼 대신 뱃지 표시 */
                  <span className="px-2.5 py-1 rounded-lg text-xs font-medium
                    bg-blue-500/20 text-blue-400">
                    처리중
                  </span>
                ) : (
                  /* 접수대기 상태: 접수 버튼 표시 */
                  <button
                    onClick={(e) => handleQuickComplete(e, row, '처리중')}
                    disabled={isProcessing}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium
                      bg-blue-500/20 text-blue-400 hover:bg-blue-500/35
                      transition-all active:scale-95 disabled:opacity-40"
                  >
                    {processingId === `${row.id}-처리중`
                      ? <Loader2 size={12} className="animate-spin" />
                      : <CheckCircle size={12} />
                    }
                    접수
                  </button>
                )}
                <button
                  onClick={(e) => handleQuickComplete(e, row, '완료')}
                  disabled={isProcessing}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium
                    bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/35
                    transition-all active:scale-95 disabled:opacity-40"
                >
                  {processingId === `${row.id}-완료`
                    ? <Loader2 size={12} className="animate-spin" />
                    : <CheckCircle size={12} />
                  }
                  완료
                </button>
              </>
            ) : (
              /* 환기중·진행중: 완료 버튼 하나 */
              <button
                onClick={(e) => handleQuickComplete(e, row, '완료')}
                disabled={isProcessing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium
                  bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/35
                  transition-all active:scale-95 disabled:opacity-40"
              >
                {processingId === `${row.id}-완료`
                  ? <Loader2 size={12} className="animate-spin" />
                  : <CheckCircle size={12} />
                }
                완료
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-20">
      {/* Pull-to-refresh 인디케이터 */}
      {(pullDistance > 0 || pullRefreshing) && (
        <div className="flex items-center justify-center transition-all -mx-4"
          style={{ height: pullRefreshing ? 40 : pullDistance * 0.57 }}>
          <Loader2 size={20} className={`text-white/40 ${pullRefreshing ? 'animate-spin' : ''}`}
            style={{ transform: `rotate(${pullDistance * 3}deg)` }} />
        </div>
      )}

      {/* 오더 서브필터 — 오더 탭 단독 선택 시 표시 */}
      {filterMode === 'custom' && activeFilters.size === 1 && activeFilters.has('오더') && (
        <div className="flex gap-2 mb-3">
          {['전체', '객실', '시설', '공용부'].map((sub) => (
            <button
              key={sub}
              onClick={() => setOrderSubFilter(sub)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${orderSubFilter === sub
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'bg-slate-900 border border-white/5 text-white/50 hover:bg-slate-800'
                }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      {/* 필터 버튼 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={handleAllClick}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all
            ${filterMode === 'all'
              ? 'bg-amber-400 text-slate-950 shadow-[0_4px_12px_rgba(251,191,36,0.2)]'
              : 'bg-slate-900 border border-white/5 text-white/50 hover:bg-slate-800'
            }`}
        >
          전체
        </button>
        {FILTERS.map((filter) => {
          const active = filterMode !== 'all' && activeFilters.has(filter)
          return (
            <button
              key={filter}
              onClick={() => handleFilterClick(filter)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${active
                  ? 'bg-amber-400 text-slate-950 shadow-[0_4px_12px_rgba(251,191,36,0.2)]'
                  : 'bg-slate-900 border border-white/5 text-white/50 hover:bg-slate-800'
                }`}
            >
              {TYPE_STYLE[filter]?.icon} {filter}
            </button>
          )
        })}
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={28} className="text-white/40 animate-spin" />
        </div>
      )}

      {!loading && (
        <>
          {/* ── PC: 칸반 보드 / 모바일: 1열 스택 ── */}
          <div className={`grid grid-cols-1 gap-4 ${colClass}`}>
            {visibleFilters.map((filter) => {
              const cards  = grouped[filter] || []
              const style  = TYPE_STYLE[filter]
              const isKanban = visibleFilters.length > 1  // 칸반 모드 여부

              return (
                <div key={filter} className="flex flex-col gap-2">
                  {/* 컬럼 헤더 — PC 칸반에서만 항상 표시, 모바일 단일 필터에서는 숨김 */}
                  {isKanban && (
                    <div className="flex items-center justify-between
                      px-1 pb-2 border-b border-white/8">
                      <span className={`text-sm font-semibold ${style?.header || 'text-white'}`}>
                        {style?.icon} {filter}
                      </span>
                      <span className="text-xs text-white/30 bg-white/5
                        px-2 py-0.5 rounded-full">
                        {cards.length}
                      </span>
                    </div>
                  )}

                  {/* 카드 목록 */}
                  {cards.length === 0 ? (
                    <p className="text-xs text-white/20 text-center py-6">없음</p>
                  ) : (
                    cards.map((row) => (
                      <Card
                        key={row.id}
                        row={row}
                        // 단일 필터 모드(모바일 등)에서는 배지 숨김
                        showBadge={!isKanban}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
