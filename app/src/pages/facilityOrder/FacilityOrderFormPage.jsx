import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import { networkSave } from '../../utils/networkSave'
import useAuthStore from '../../store/useAuthStore'
import RoomPicker from '../../components/common/RoomPicker'
import ImageUploader from '../../components/common/ImageUploader'
import { getMasterData, CACHE_KEYS } from '../../utils/masterCache'
import { sendPush } from '../../utils/sendPush'

export default function FacilityOrderFormPage() {
  const { id }   = useParams()    // 수정 모드: id 존재
  const isEdit   = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // ── 마스터 데이터 ─────────────────────────────
  const [facilityTypes, setFacilityTypes] = useState([])

  // ── 폼 필드 ───────────────────────────────────
  // 구분: 객실 선택 시 객실번호 필수 / 공용부·시설 선택 시 선택사항
  const [locationType, setLocationType]   = useState('객실')
  const [roomNo, setRoomNo]               = useState(null)
  // 선택된 시설종류 객체 { id, name }
  const [facilityType, setFacilityType]   = useState(null)
  const [note, setNote]                   = useState('')
  const [isUrgent, setIsUrgent]           = useState(false)
  const [imagePaths, setImagePaths]       = useState([])

  // ── 수정 모드 메타 ─────────────────────────────
  const [authorName, setAuthorName]   = useState('')
  const [workDate, setWorkDate]       = useState(dayjs().format('YYYY-MM-DD'))
  const [updaterName, setUpdaterName] = useState(null)

  // ── UI 상태 ──────────────────────────────────
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  // ── 마스터 데이터 로드 ─────────────────────────
  useEffect(() => {
    getMasterData(CACHE_KEYS.facilityTypes).then(setFacilityTypes)
  }, [])

  // ── 수정 모드: 기존 데이터 로드 ──────────────
  useEffect(() => {
    if (!isEdit) return

    const fetchData = async () => {
      const { data, error: fetchErr } = await supabase
        .from('facility_orders')
        .select(`
          *,
          facility_order_images(id, thumb_path, sort_order),
          author:users!author_id(name),
          updater:users!updated_by(name)
        `)
        .eq('id', id)
        .single()

      if (fetchErr || !data) {
        navigate('/facility-order', { replace: true })
        return
      }

      setLocationType(data.location_type || '객실')
      setRoomNo(data.room_no)
      setIsUrgent(data.is_urgent || false)
      // 스냅샷 이름으로 기존 타입 복원
      setFacilityType(
        data.facility_type_id
          ? { id: data.facility_type_id, name: data.facility_type_name }
          : { id: null, name: data.facility_type_name }
      )
      setNote(data.note || '')
      setAuthorName(data.author?.name || '')
      setWorkDate(data.work_date)
      setUpdaterName(data.updater?.name || null)

      const sorted = [...(data.facility_order_images || [])].sort((a, b) => a.sort_order - b.sort_order)
      setImagePaths(sorted.map((img) => img.thumb_path).filter(Boolean))

      setLoading(false)
    }

    fetchData()
  }, [id, isEdit, navigate])

  // ── 등록 모드: 작성자명 설정 ──────────────────
  useEffect(() => {
    if (!isEdit && user) setAuthorName(user.name)
  }, [isEdit, user])

  // ── 저장 ─────────────────────────────────────
  const handleSubmit = async () => {
    // 객실 구분일 때만 객실번호 필수
    if (locationType === '객실' && !roomNo) { setError('객실번호를 선택해주세요.'); return }
    if (!facilityType) { setError('시설 종류를 선택해주세요.'); return }

    setSaving(true)
    setError(null)

    try {
      await networkSave(async () => {
      if (isEdit) {
        // ── 수정 ──────────────────────────────
        const { error: upErr } = await supabase
          .from('facility_orders')
          .update({
            location_type:      locationType,
            room_no:            locationType === '객실' ? roomNo : null,
            facility_type_id:   facilityType.id,
            facility_type_name: facilityType.name,
            note:               note.trim() || null,
            is_urgent:          isUrgent,
            updated_by:         user.id,
          })
          .eq('id', id)

        if (upErr) throw upErr

        // 이미지 전체 교체 (기존 삭제 후 재삽입)
        // 삭제 실패 시 throw — 삽입 중단으로 데이터 유실 방지
        const { error: delErr } = await supabase
          .from('facility_order_images').delete().eq('facility_order_id', id)
        if (delErr) throw delErr

        if (imagePaths.length > 0) {
          await supabase.from('facility_order_images').insert(
            imagePaths.map((path, idx) => ({
              facility_order_id: id,
              thumb_path:        path,
              sort_order:        idx,
            })),
          )
        }

        navigate(`/facility-order/${id}`, { replace: true })

      } else {
        // ── 등록 ──────────────────────────────
        const { data: foData, error: foErr } = await supabase
          .from('facility_orders')
          .insert({
            location_type:      locationType,
            room_no:            locationType === '객실' ? roomNo : null,
            facility_type_id:   facilityType.id,
            facility_type_name: facilityType.name,
            note:               note.trim() || null,
            is_urgent:          isUrgent,
            status:             '접수대기',
            author_id:          user.id,
            work_date:          dayjs().format('YYYY-MM-DD'),
          })
          .select('id')
          .single()

        if (foErr) throw foErr

        if (imagePaths.length > 0) {
          await supabase.from('facility_order_images').insert(
            imagePaths.map((path, idx) => ({
              facility_order_id: foData.id,
              thumb_path:        path,
              sort_order:        idx,
            })),
          )
        }

        // 신규 등록 시 시설 담당자에게 푸시 발송
        // 공용부·시설 구분은 room_no 없으므로 location_type 표시
        const pushLocation = locationType === '객실' ? roomNo : locationType
        sendPush({
          roles: ['facility'],
          title: `[${pushLocation}] 시설오더 — ${facilityType.name}`,
          body:  note.trim() || '',
          url:   `/facility-order/${foData.id}`,
        })

        navigate('/facility-order', { replace: true })
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
    <div>
      <div className="px-4 pt-6 pb-48 space-y-6">

        {/* 구분 — 객실 / 공용부 / 시설 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">구분 *</label>
          <div className="flex gap-2">
            {['객실', '공용부', '시설'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setLocationType(type)
                  // 객실 외 선택 시 객실번호 초기화
                  if (type !== '객실') setRoomNo(null)
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                  locationType === type
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/50 hover:bg-white/15'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </section>

        {/* 객실번호 — 객실 구분일 때만 표시 */}
        {locationType === '객실' && (
          <section>
            <label className="block text-sm text-white/50 mb-2">객실번호 *</label>
            <RoomPicker value={roomNo} onChange={setRoomNo} />
          </section>
        )}

        {/* 시설 종류 — 토글 버튼 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">시설 종류 *</label>
          <div className="flex flex-wrap gap-2">
            {facilityTypes.map((ft) => (
              <button
                key={ft.id}
                type="button"
                onClick={() => setFacilityType({ id: ft.id, name: ft.name })}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                  facilityType?.id === ft.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/50 hover:bg-white/15'
                }`}
              >
                {ft.name}
              </button>
            ))}
            {facilityTypes.length === 0 && (
              <p className="text-sm text-white/30">시설 종류 데이터가 없습니다.</p>
            )}
          </div>
        </section>

        {/* 긴급오더 */}
        <section>
          <button
            type="button"
            onClick={() => setIsUrgent((v) => !v)}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors ${
              isUrgent
                ? 'border-red-500/50 bg-red-500/10'
                : 'border-white/20 bg-white/5'
            }`}
          >
            {/* 체크박스 */}
            <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
              isUrgent ? 'bg-red-500 border-red-500' : 'border-white/30'
            }`}>
              {isUrgent && (
                <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                  <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span className={`text-sm font-medium ${isUrgent ? 'text-red-400' : 'text-white/60'}`}>
              🚨 긴급오더
            </span>
            <span className="ml-auto text-xs text-white/30">즉시 처리 필요</span>
          </button>
        </section>

        {/* 특이사항 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">특이사항</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="특이사항을 입력하세요"
            rows={3}
            className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20
              text-white placeholder:text-white/30 text-sm resize-none outline-none
              focus:border-white/40 transition-colors"
          />
        </section>

        {/* 이미지 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">이미지 (최대 5장)</label>
          <ImageUploader
            type="facilityOrders"
            value={imagePaths}
            onChange={setImagePaths}
          />
        </section>

        {/* 작성자 / 날짜 (자동입력, 수정불가) */}
        <section className="space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <span className="text-xs text-white/40 w-20 shrink-0">담당자</span>
            <span className="text-sm text-white/60">{authorName}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <span className="text-xs text-white/40 w-20 shrink-0">작성일</span>
            <span className="text-sm text-white/60">
              {dayjs(workDate).format('YYYY년 M월 D일')}
            </span>
          </div>
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

      {/* Thumb-zone 저장 버튼 */}
      <div className="fixed left-0 right-0 z-20 lg:pl-60" style={{ bottom: 'var(--form-btn-bottom)' }}>
        <div className="max-w-[680px] mx-auto lg:max-w-none px-4 pb-4 pt-3
          bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent">
          <button
            onClick={handleSubmit}
            disabled={saving || (locationType === '객실' && !roomNo) || !facilityType}
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
    </div>
  )
}
