import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, ChevronRight, X } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import RoomPicker from '../../components/common/RoomPicker'
import ImageUploader from '../../components/common/ImageUploader'
import BottomSheet from '../../components/common/BottomSheet'
import { getMasterData, CACHE_KEYS } from '../../utils/masterCache'
import { networkSave } from '../../utils/networkSave'
import { sendPush } from '../../utils/sendPush'

// 하자상태 선택지
const STATUS_OPTIONS = ['미완료', '처리중', '완료']

// 상태별 활성 색상
const STATUS_ACTIVE = {
  미완료: 'bg-red-500 text-white',
  처리중: 'bg-yellow-500 text-zinc-900',
  완료:   'bg-emerald-500 text-white',
}

export default function DefectFormPage() {
  const { id }       = useParams()      // 수정 모드: id 존재
  const isEdit       = Boolean(id)
  const navigate     = useNavigate()
  const [params]     = useSearchParams()
  const { user }     = useAuthStore()

  // 관리자·소장·주임 여부 — 처리중·완료 선택 가능
  const isManager = ['admin', 'manager', 'supervisor'].includes(user?.role)

  // ── 마스터 데이터 ─────────────────────────────
  const [divisions, setDivisions]   = useState([])   // 구분 목록
  const [locations, setLocations]   = useState([])   // 전체 위치 목록
  const [categories, setCategories] = useState([])   // 하자분류 목록

  // ── 폼 필드 ───────────────────────────────────
  const [roomNo, setRoomNo]         = useState(params.get('room') || null)
  const [division, setDivision]     = useState('')    // 선택된 구분명
  const [locations_sel, setLocationsSel] = useState([])  // 선택된 위치명 배열 (다중선택)
  const [category, setCategory]     = useState('')    // 선택된 하자분류명
  const [imagePaths, setImagePaths] = useState([])
  const [memo, setMemo]             = useState('')
  const [status, setStatus]         = useState('미완료')

  // ── 수정 모드 메타 ─────────────────────────────
  const [authorName, setAuthorName]   = useState('')
  const [workDate, setWorkDate]       = useState(dayjs().format('YYYY-MM-DD'))
  const [updaterName, setUpdaterName] = useState(null)

  // ── Bottom Sheet 열림 상태 ────────────────────
  const [divisionSheetOpen, setDivisionSheetOpen]   = useState(false)
  const [locationSheetOpen, setLocationSheetOpen]   = useState(false)
  const [categorySheetOpen, setCategorySheetOpen]   = useState(false)

  // ── UI 상태 ──────────────────────────────────
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  // 자동진행 스크롤 기준점
  const imageRef = useRef(null)

  // ── 마스터 데이터 로드 ─────────────────────────
  useEffect(() => {
    const loadMaster = async () => {
      const [divs, locs, cats] = await Promise.all([
        getMasterData(CACHE_KEYS.defectDivisions),
        getMasterData(CACHE_KEYS.defectLocations),
        getMasterData(CACHE_KEYS.defectCategories),
      ])
      setDivisions(divs)
      setLocations(locs)
      setCategories(cats)
    }
    loadMaster()
  }, [])

  // ── 수정 모드: 기존 데이터 로드 ──────────────
  useEffect(() => {
    if (!isEdit) return

    const fetchData = async () => {
      const { data, error: fetchErr } = await supabase
        .from('defects')
        .select(`
          *,
          defect_images(id, thumb_path, sort_order),
          author:users!author_id(name),
          updater:users!updated_by(name)
        `)
        .eq('id', id)
        .single()

      if (fetchErr || !data) {
        navigate('/defect', { replace: true })
        return
      }

      setRoomNo(data.room_no)
      setDivision(data.division)
      // DB에 쉼표 구분 문자열로 저장된 위치를 배열로 변환
      setLocationsSel(data.location ? data.location.split(',').map((s) => s.trim()).filter(Boolean) : [])
      setCategory(data.category || '')
      setMemo(data.memo || '')
      setStatus(data.status)
      setAuthorName(data.author?.name || '')
      setWorkDate(data.created_at)
      setUpdaterName(data.updater?.name || null)

      // 이미지 sort_order 순 정렬
      const sorted = [...(data.defect_images || [])].sort((a, b) => a.sort_order - b.sort_order)
      setImagePaths(sorted.map((img) => img.thumb_path))

      setLoading(false)
    }

    fetchData()
  }, [id, isEdit, navigate])

  // ── 등록 모드: 작성자명 설정 ──────────────────
  useEffect(() => {
    if (!isEdit && user) setAuthorName(user.name)
  }, [isEdit, user])

  // ── 구분에 해당하는 위치 목록 ─────────────────
  const divisionObj = divisions.find((d) => d.name === division)
  const filteredLocations = divisionObj
    ? locations.filter((l) => l.division_id === divisionObj.id)
    : []

  // ── 위치 다중선택 토글 ────────────────────────
  const toggleLocation = (name) => {
    setLocationsSel((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  // ── 객실 선택 핸들러 (등록 폼 자동진행) ──────
  const handleRoomChange = (room) => {
    setRoomNo(room)
    if (!isEdit && room) {
      // 짧은 딜레이 후 구분 Sheet 자동 오픈
      setTimeout(() => setDivisionSheetOpen(true), 350)
    }
  }

  // ── 구분 선택 핸들러 ──────────────────────────
  const handleDivisionSelect = (name) => {
    // 구분 변경 시 위치 선택 전체 초기화
    if (name !== division) setLocationsSel([])
    setDivision(name)
    setDivisionSheetOpen(false)

    if (!isEdit) {
      // 위치 Sheet 자동 오픈
      setTimeout(() => setLocationSheetOpen(true), 300)
    }
  }

  // ── 위치 Sheet 완료 핸들러 (다중선택 확인) ───
  const handleLocationDone = () => {
    setLocationSheetOpen(false)

    if (!isEdit && locations_sel.length > 0) {
      // 하자분류 미선택이면 자동으로 분류 Sheet 오픈 (위치 → 분류 자동진행)
      if (!category) {
        setTimeout(() => setCategorySheetOpen(true), 350)
      } else {
        // 이미지 영역으로 스크롤
        setTimeout(() => {
          imageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 300)
      }
    }
  }

  // ── 저장 ─────────────────────────────────────
  const handleSubmit = async () => {
    if (!roomNo) { setError('객실번호를 선택해주세요.'); return }
    if (!division) { setError('구분을 선택해주세요.'); return }
    if (locations_sel.length === 0) { setError('위치를 하나 이상 선택해주세요.'); return }

    setSaving(true)
    setError(null)

    try {
      await networkSave(async () => {
      if (isEdit) {
        // ── 수정 ──────────────────────────────
        const { error: upErr } = await supabase
          .from('defects')
          .update({
            room_no:    roomNo,
            division,
            location:   locations_sel.join(','),  // 다중선택 → 쉼표 구분 문자열
            category:   category || null,
            memo:       memo.trim() || null,
            status,
            updated_by: user.id,
          })
          .eq('id', id)

        if (upErr) throw upErr

        // 이미지 전체 교체 (기존 삭제 후 재삽입)
        // 삭제 실패 시 throw — 삽입 중단으로 데이터 유실 방지
        const { error: delErr } = await supabase
          .from('defect_images').delete().eq('defect_id', id)
        if (delErr) throw delErr

        if (imagePaths.length > 0) {
          await supabase.from('defect_images').insert(
            imagePaths.map((path, idx) => ({
              defect_id:  id,
              thumb_path: path,
              sort_order: idx,
            })),
          )
        }

        // 완료 상태로 변경 시 관리자·소장·주임에게 푸시 발송
        if (status === '완료') {
          sendPush({
            roles:     ['admin', 'manager', 'supervisor'],
            title:     `[${roomNo}] 하자 완료`,
            body:      [division, locations_sel.join('·')].filter(Boolean).join(' — '),
            url:       `/defect/${id}`,
            orderType: '시설',  // 관리자 알람 OFF 필터링 적용
          })
        }

        navigate(`/defect/${id}`, { replace: true })

      } else {
        // ── 등록 ──────────────────────────────
        const { data: defectData, error: defErr } = await supabase
          .from('defects')
          .insert({
            room_no:   roomNo,
            division,
            location:  locations_sel.join(','),  // 다중선택 → 쉼표 구분 문자열
            category:  category || null,
            memo:      memo.trim() || null,
            status,
            author_id: user.id,
          })
          .select('id')
          .single()

        if (defErr) throw defErr

        // 이미지 삽입
        if (imagePaths.length > 0) {
          await supabase.from('defect_images').insert(
            imagePaths.map((path, idx) => ({
              defect_id:  defectData.id,
              thumb_path: path,
              sort_order: idx,
            })),
          )
        }

        navigate('/defect', { replace: true })
      }
      }) // networkSave 종료
    } catch (err) {
      if (!err?.isTimeout) {
        console.error(err)
        setError('저장 중 오류가 발생했습니다.')
      }
    } finally {
      setSaving(false)
    }
  }

  // ── 로딩 스피너 ──────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-white/40 animate-spin" />
      </div>
    )
  }

  // ── 렌더 ─────────────────────────────────────
  return (
    <>
      <div className="px-4 pt-6 pb-48 space-y-6">

        {/* 객실번호 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">객실번호 *</label>
          <RoomPicker value={roomNo} onChange={handleRoomChange} />
        </section>

        {/* 구분 — 선택 트리거 버튼 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">구분 *</label>
          <button
            type="button"
            onClick={() => setDivisionSheetOpen(true)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
              division
                ? 'bg-blue-500/10 border-blue-500/40 text-white'
                : 'bg-white/10 border-white/20 text-white/40'
            }`}
          >
            <span className="text-sm">{division || '구분을 선택하세요'}</span>
            <div className="flex items-center gap-2">
              {division && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setDivision(''); setLocationsSel([]) }}
                  className="text-white/40 hover:text-white/70"
                >
                  <X size={14} />
                </span>
              )}
              <ChevronRight size={16} className="text-white/30" />
            </div>
          </button>
        </section>

        {/* 위치 — 구분 선택 후 표시 (다중선택) */}
        {division && (
          <section>
            <label className="block text-sm text-white/50 mb-2">
              위치 * <span className="text-white/30 font-normal">(복수 선택 가능)</span>
            </label>
            <button
              type="button"
              onClick={() => setLocationSheetOpen(true)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                locations_sel.length > 0
                  ? 'bg-blue-500/10 border-blue-500/40 text-white'
                  : 'bg-white/10 border-white/20 text-white/40'
              }`}
            >
              <span className="text-sm truncate mr-2">
                {locations_sel.length > 0
                  ? locations_sel.join(' · ')
                  : '위치를 선택하세요'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {locations_sel.length > 0 && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); setLocationsSel([]) }}
                    className="text-white/40 hover:text-white/70"
                  >
                    <X size={14} />
                  </span>
                )}
                <ChevronRight size={16} className="text-white/30" />
              </div>
            </button>
          </section>
        )}

        {/* 하자분류 — Bottom Sheet 피커 트리거 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">하자분류</label>
          <button
            type="button"
            onClick={() => setCategorySheetOpen(true)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
              category
                ? 'bg-blue-500/10 border-blue-500/40 text-white'
                : 'bg-white/10 border-white/20 text-white/40'
            }`}
          >
            <span className="text-sm">{category || '하자분류를 선택하세요'}</span>
            <div className="flex items-center gap-2">
              {category && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setCategory('') }}
                  className="text-white/40 hover:text-white/70"
                >
                  <X size={14} />
                </span>
              )}
              <ChevronRight size={16} className="text-white/30" />
            </div>
          </button>
        </section>

        {/* 이미지 — 자동진행 스크롤 기준점 */}
        <section ref={imageRef}>
          <label className="block text-sm text-white/50 mb-2">이미지 (최대 5장)</label>
          <ImageUploader
            type="defects"
            value={imagePaths}
            onChange={setImagePaths}
          />
        </section>

        {/* 메모 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">메모</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모를 입력하세요"
            rows={3}
            className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20
              text-white placeholder:text-white/30 text-sm resize-none outline-none
              focus:border-white/40 transition-colors"
          />
        </section>

        {/* 하자상태 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">하자상태 *</label>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((s) => {
              // 처리중·완료는 관리자·소장·주임만 선택 가능
              const isDisabled = (s === '처리중' || s === '완료') && !isManager
              return (
                <button
                  key={s}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && setStatus(s)}
                  className={`py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                    status === s
                      ? STATUS_ACTIVE[s]
                      : isDisabled
                        ? 'bg-white/5 text-white/20 cursor-not-allowed'
                        : 'bg-white/10 text-white/50 hover:bg-white/15'
                  }`}
                >
                  {s}
                </button>
              )
            })}
          </div>
          {!isManager && (
            <p className="mt-2 text-xs text-white/30">
              * 처리중·완료 상태는 관리자·소장·주임만 변경 가능합니다.
            </p>
          )}
        </section>

        {/* 작성자 / 날짜 (자동입력, 수정불가) */}
        <section className="space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <span className="text-xs text-white/40 w-20 shrink-0">작성자</span>
            <span className="text-sm text-white/60">{authorName}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <span className="text-xs text-white/40 w-20 shrink-0">작성일</span>
            <span className="text-sm text-white/60">
              {dayjs(workDate).format('YYYY년 M월 D일')}
            </span>
          </div>
          {/* 수정 시 최종수정자 표시 */}
          {isEdit && updaterName && (
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
              <span className="text-xs text-white/40 w-20 shrink-0">최종수정자</span>
              <span className="text-sm text-white/60">{updaterName}</span>
            </div>
          )}
        </section>

        {/* 에러 메시지 */}
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>

      {/* Thumb-zone 저장 버튼 — 화면 최하단 고정 */}
      <div className="fixed left-0 right-0 z-20 lg:pl-60" style={{ bottom: 'var(--form-btn-bottom)' }}>
        <div className="max-w-[680px] mx-auto lg:max-w-none px-4 pb-4 pt-3
          bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent">
          <button
            onClick={handleSubmit}
            disabled={saving || !roomNo || !division || locations_sel.length === 0}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white text-base font-semibold
              hover:bg-blue-500 active:scale-[0.98] transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={18} className="animate-spin" />}
            {saving ? '저장 중...' : isEdit ? '수정 완료' : '등록'}
          </button>
        </div>
      </div>

      {/* 구분 선택 Bottom Sheet */}
      <BottomSheet
        open={divisionSheetOpen}
        onClose={() => setDivisionSheetOpen(false)}
        title="구분 선택"
      >
        <div className="flex flex-wrap gap-2 pt-2 pb-4">
          {divisions.map((div) => (
            <button
              key={div.id}
              onClick={() => handleDivisionSelect(div.name)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                division === div.name
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/15'
              }`}
            >
              {div.name}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* 하자분류 선택 Bottom Sheet */}
      <BottomSheet
        open={categorySheetOpen}
        onClose={() => setCategorySheetOpen(false)}
        title="하자분류 선택"
      >
        <div className="flex flex-wrap gap-2 pt-2 pb-4">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.name); setCategorySheetOpen(false) }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                category === cat.name
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/15'
              }`}
            >
              {cat.name}
            </button>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-white/30 py-4">하자분류 데이터가 없습니다.</p>
          )}
        </div>
      </BottomSheet>

      {/* 위치 선택 Bottom Sheet — 다중선택 */}
      <BottomSheet
        open={locationSheetOpen}
        onClose={handleLocationDone}
        title={`위치 선택${division ? ` — ${division}` : ''}`}
      >
        <div className="pt-2 pb-4">
          {/* 선택된 위치 미리보기 */}
          {locations_sel.length > 0 && (
            <p className="text-xs text-blue-400 mb-3">
              선택됨: {locations_sel.join(' · ')}
            </p>
          )}

          {/* 위치 토글 버튼 목록 */}
          <div className="flex flex-wrap gap-2">
            {filteredLocations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => toggleLocation(loc.name)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                  locations_sel.includes(loc.name)
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/15'
                }`}
              >
                {loc.name}
              </button>
            ))}
            {filteredLocations.length === 0 && (
              <p className="text-sm text-white/30 py-4">위치 데이터가 없습니다.</p>
            )}
          </div>

          {/* 완료 버튼 */}
          <button
            onClick={handleLocationDone}
            className="w-full mt-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold
              hover:bg-blue-500 active:scale-[0.98] transition-all"
          >
            {locations_sel.length > 0 ? `${locations_sel.length}개 선택 완료` : '닫기'}
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
