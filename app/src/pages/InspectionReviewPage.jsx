import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Printer, FileSpreadsheet, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import useAuthStore from '../store/useAuthStore'

// 조회 필터 항목 정의
const FILTERS = ['환기중', '진행중', '시설오더', '완료']

// 시설오더 상태 배지 색상
const STATUS_COLOR = {
  접수대기: 'bg-zinc-500/30 text-zinc-300',
  처리중:   'bg-blue-500/20 text-blue-400',
}

// 유형 배지 색상 (전체·복합 조회 시 표시)
const TYPE_COLOR = {
  환기중:  'bg-cyan-500/20 text-cyan-400',
  진행중:  'bg-blue-500/20 text-blue-400',
  완료:    'bg-emerald-500/20 text-emerald-400',
  시설오더:'bg-amber-500/20 text-amber-400',
}

export default function InspectionReviewPage() {
  const navigate  = useNavigate()
  const { user, isManager } = useAuthStore()

  useEffect(() => {
    if (user && !isManager()) navigate('/', { replace: true })
  }, [user, isManager, navigate])

  // ── 날짜 선택 — 기본값: 오늘 ────────────────────
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format('YYYY-MM-DD'))

  // 하루 이전/이후 이동
  const moveDate = (delta) => {
    setSelectedDate((d) => dayjs(d).add(delta, 'day').format('YYYY-MM-DD'))
  }
  const isToday = selectedDate === dayjs().format('YYYY-MM-DD')

  // ── 필터 상태 — 'all' 또는 Set<string> ───────
  const [filterMode, setFilterMode]       = useState('all')
  const [activeFilters, setActiveFilters] = useState(new Set(FILTERS))

  const [searchName, setSearchName] = useState('')
  const [rows, setRows]             = useState([])
  const [loading, setLoading]       = useState(false)

  // ── 필터 버튼 클릭 처리 ───────────────────────
  const handleFilterClick = (filter) => {
    if (filterMode === 'all') {
      setFilterMode('custom')
      setActiveFilters(new Set([filter]))
    } else {
      setActiveFilters((prev) => {
        const next = new Set(prev)
        if (next.has(filter)) {
          next.delete(filter)
          if (next.size === 0) {
            setFilterMode('all')
            return new Set(FILTERS)
          }
        } else {
          next.add(filter)
          if (next.size === FILTERS.length) {
            setFilterMode('all')
            return new Set(FILTERS)
          }
        }
        return next
      })
    }
  }

  const handleAllClick = () => {
    setFilterMode('all')
    setActiveFilters(new Set(FILTERS))
  }

  // ── 데이터 로드 — 선택 날짜 서버 필터 적용 ───────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setRows([])

    try {
      const results = []
      const filters = filterMode === 'all' ? new Set(FILTERS) : activeFilters

      // 인스펙션 관련 상태 조회 — 선택 날짜만
      const inspStatuses = ['환기중', '진행중', '완료'].filter((s) => filters.has(s))
      if (inspStatuses.length > 0) {
        const { data, error } = await supabase
          .from('inspections')
          .select(`
            id, room_no, note, status, work_date, created_at,
            author:users!author_id(name)
          `)
          .in('status', inspStatuses)
          .eq('work_date', selectedDate)
          .order('room_no', { ascending: true })

        if (error) throw error
        ;(data || []).forEach((r) => results.push({ ...r, _type: r.status }))
      }

      // 시설오더 조회 — 선택 날짜만
      if (filters.has('시설오더')) {
        const { data, error } = await supabase
          .from('facility_orders')
          .select(`
            id, room_no, facility_type_name, note, status, work_date, created_at,
            author:users!author_id(name)
          `)
          .in('status', ['접수대기', '처리중'])
          .eq('work_date', selectedDate)
          .order('room_no', { ascending: true })

        if (error) throw error
        ;(data || []).forEach((r) => results.push({ ...r, _type: '시설오더' }))
      }

      // 등록시간 오름차순 정렬
      results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      setRows(results)
    } catch (err) {
      console.error('데이터 로드 오류:', err)
    } finally {
      setLoading(false)
    }
  }, [filterMode, activeFilters, selectedDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── 이름 검색 필터 ────────────────────────────
  const filtered = useMemo(() => {
    if (!searchName.trim()) return rows
    const keyword = searchName.trim().toLowerCase()
    return rows.filter((r) =>
      (r.author?.name || '').toLowerCase().includes(keyword),
    )
  }, [rows, searchName])

  // 복합 조회 여부 (유형 열 표시 기준)
  const isMultiType = filterMode === 'all' || activeFilters.size > 1

  // ── 엑셀 출력 ────────────────────────────────
  const handleExcel = () => {
    const sheetData = filtered.map((r) => ({
      유형:     r._type,
      객실번호: r.room_no,
      ...(r._type === '시설오더' ? { 시설종류: r.facility_type_name || '-' } : {}),
      특이사항: r.note || '',
      작성자:   r.author?.name || '-',
      ...(r._type === '시설오더' ? { 상태: r.status } : {}),
      등록시간: dayjs(r.created_at).format('HH:mm'),
      작성일:   dayjs(r.work_date).format('YYYY-MM-DD'),
    }))

    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '인스펙션조회')
    XLSX.writeFile(wb, `인스펙션조회_${selectedDate}.xlsx`)
  }

  const handlePDF = () => window.print()

  // ── 렌더 ─────────────────────────────────────
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; top: 0; left: 0; width: 100%; }
          .print-hide { display: none !important; }
        }
      `}</style>

      <div className="px-4 pt-4 pb-20">

        {/* 헤더 */}
        <div className="print-hide space-y-3 mb-4">

          {/* 날짜 선택 — 이전/다음 화살표 + 날짜 입력 + 오늘 버튼 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => moveDate(-1)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
            >
              <ChevronLeft size={16} className="text-white/60" />
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 px-3 py-2 bg-white/10 rounded-xl border border-white/20
                text-white text-sm text-center outline-none focus:border-white/40 transition-colors"
            />

            <button
              onClick={() => moveDate(1)}
              disabled={isToday}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/15 transition-colors
                disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} className="text-white/60" />
            </button>

            {/* 오늘로 이동 버튼 — 오늘이 아닐 때만 표시 */}
            {!isToday && (
              <button
                onClick={() => setSelectedDate(dayjs().format('YYYY-MM-DD'))}
                className="shrink-0 px-3 py-2 bg-blue-600/30 rounded-xl border border-blue-500/30
                  text-blue-400 text-sm font-medium hover:bg-blue-600/40 transition-colors"
              >
                오늘
              </button>
            )}
          </div>

          {/* 필터 버튼 */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleAllClick}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${filterMode === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/10 text-white/50 hover:bg-white/15'
                }`}
            >
              전체
            </button>

            {FILTERS.map((filter) => {
              const active = filterMode === 'all' ? false : activeFilters.has(filter)
              return (
                <button
                  key={filter}
                  onClick={() => handleFilterClick(filter)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                    ${active
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/10 text-white/50 hover:bg-white/15'
                    }`}
                >
                  {filter}
                </button>
              )
            })}
          </div>

          {/* 검색 + 출력 버튼 */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="담당자 이름 검색"
                className="w-full pl-9 pr-3 py-2.5 bg-white/10 rounded-xl border border-white/15
                  text-white placeholder:text-white/30 text-sm outline-none focus:border-white/40 transition-colors"
              />
            </div>
            <button
              onClick={handlePDF}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10
                text-white/70 hover:bg-white/15 hover:text-white transition-colors text-sm font-medium"
            >
              <Printer size={16} />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              onClick={handleExcel}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600/20
                text-emerald-400 hover:bg-emerald-600/30 transition-colors text-sm font-medium"
            >
              <FileSpreadsheet size={16} />
              <span className="hidden sm:inline">엑셀</span>
            </button>
          </div>

          {!loading && (
            <p className="text-xs text-white/30">
              총 {filtered.length}건
              {searchName.trim() && ` (전체 ${rows.length}건 중)`}
            </p>
          )}
        </div>

        {/* 출력 영역 */}
        <div id="print-area">
          <div className="hidden print:block mb-4">
            <h1 className="text-lg font-bold">인스펙션조회</h1>
            <p className="text-sm text-gray-500">{selectedDate} 기준 / {dayjs().format('YYYY년 M월 D일')} 출력</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center h-40 print-hide">
              <Loader2 size={28} className="text-white/40 animate-spin" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex items-center justify-center h-40 print-hide">
              <p className="text-white/30 text-sm">데이터가 없습니다.</p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/10 print:border-gray-300">
                    {isMultiType && (
                      <th className="py-3 px-3 text-left text-xs text-white/40 font-medium
                        whitespace-nowrap print:text-gray-600">
                        유형
                      </th>
                    )}
                    <th className="py-3 px-3 text-left text-xs text-white/40 font-medium
                      whitespace-nowrap print:text-gray-600">
                      객실번호
                    </th>
                    <th className="py-3 px-3 text-left text-xs text-white/40 font-medium
                      print:text-gray-600">
                      특이사항
                    </th>
                    <th className="py-3 px-3 text-left text-xs text-white/40 font-medium
                      whitespace-nowrap print:text-gray-600">
                      작성자
                    </th>
                    <th className="py-3 px-3 text-left text-xs text-white/40 font-medium
                      whitespace-nowrap print:text-gray-600">
                      등록시간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={`${row._type}-${row.id}`}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors
                        print:border-gray-200 print:hover:bg-transparent"
                    >
                      {/* 유형 배지 (복합 조회 시) */}
                      {isMultiType && (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                            ${TYPE_COLOR[row._type] || ''}`}>
                            {row._type}
                            {row._type === '시설오더' && (
                              <span className="ml-1 opacity-60">
                                {STATUS_COLOR[row.status] ? `(${row.status})` : ''}
                              </span>
                            )}
                          </span>
                        </td>
                      )}

                      {/* 객실번호 */}
                      <td className="py-3 px-3 text-white font-semibold whitespace-nowrap
                        print:text-black">
                        {row.room_no}
                        {row._type === '시설오더' && (
                          <span className="ml-1.5 text-xs text-white/40 font-normal">
                            {row.facility_type_name}
                          </span>
                        )}
                      </td>

                      {/* 특이사항 */}
                      <td className="py-3 px-3 text-white/70 max-w-[200px] print:text-gray-700">
                        <span className="line-clamp-2 break-all">
                          {row.note || <span className="text-white/20">-</span>}
                        </span>
                      </td>

                      {/* 작성자 */}
                      <td className="py-3 px-3 text-white/70 whitespace-nowrap print:text-gray-700">
                        {row.author?.name || '-'}
                      </td>

                      {/* 등록시간 */}
                      <td className="py-3 px-3 text-white/50 whitespace-nowrap print:text-gray-600">
                        {dayjs(row.created_at).format('HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
