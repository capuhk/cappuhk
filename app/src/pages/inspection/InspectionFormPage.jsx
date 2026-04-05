import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import RoomPicker from '../../components/common/RoomPicker'
import ImageUploader from '../../components/common/ImageUploader'
import { networkSave } from '../../utils/networkSave'
import { getMasterData, getCachedDataSync, CACHE_KEYS, getPolicy } from '../../utils/masterCache'
import { getBtnClass } from '../../utils/statusColors'
import { sendPush } from '../../utils/sendPush'

export default function InspectionFormPage() {
  const { id }   = useParams()       // 수정 모드: id 존재
  const isEdit   = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // ── 인스펙션 상태 목록 + 운영 정책 (캐시 우선 로딩) ──
  const [statuses, setStatuses] = useState(
    () => getCachedDataSync(CACHE_KEYS.inspectionStatuses) || []
  )
  const [policies, setPolicies] = useState(
    () => getCachedDataSync(CACHE_KEYS.appPolicies) || []
  )
  useEffect(() => {
    getMasterData(CACHE_KEYS.inspectionStatuses).then(setStatuses)
    getMasterData(CACHE_KEYS.appPolicies).then(setPolicies)
  }, [])

  // ── 폼 필드 ───────────────────────────────────
  const [roomNo, setRoomNo]                     = useState(null)
  const [note, setNote]                         = useState('')
  const [status, setStatus]                     = useState('')
  const [imagePaths, setImagePaths]             = useState([])
  // 시설 상태 선택 시 시설오더 발송 여부 (등록 폼만)
  const [sendFacilityOrder, setSendFacilityOrder] = useState(false)

  // ── 수정 모드 원본 데이터 ─────────────────────
  const [authorName, setAuthorName]   = useState('')
  const [workDate, setWorkDate]       = useState(dayjs().format('YYYY-MM-DD'))
  const [updaterName, setUpdaterName] = useState(null)

  // ── UI 상태 ──────────────────────────────────
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  // 자동진행: 객실 선택 후 이미지 영역으로 스크롤
  const imageRef = useRef(null)

  // ── 수정 모드: 기존 데이터 로드 ──────────────
  useEffect(() => {
    if (!isEdit) return

    const fetchData = async () => {
      const { data, error: fetchError } = await supabase
        .from('inspections')
        .select(`
          *,
          inspection_images(id, thumb_path, sort_order),
          author:users!author_id(name),
          updater:users!updated_by(name)
        `)
        .eq('id', id)
        .single()

      if (fetchError || !data) {
        navigate('/inspection', { replace: true })
        return
      }

      setRoomNo(data.room_no)
      setNote(data.note || '')
      setStatus(data.status)
      setAuthorName(data.author?.name || '')
      setWorkDate(data.work_date)
      setUpdaterName(data.updater?.name || null)

      // 이미지 sort_order 순 정렬
      const sorted = [...(data.inspection_images || [])].sort((a, b) => a.sort_order - b.sort_order)
      setImagePaths(sorted.map((img) => img.thumb_path))

      setLoading(false)
    }

    fetchData()
  }, [id, isEdit, navigate])

  // ── 등록 모드: 작성자명 + 기본 상태 설정 ────────
  useEffect(() => {
    if (!isEdit && user) setAuthorName(user.name)
  }, [isEdit, user])

  // statuses + 정책 로드 후 기본값 설정
  useEffect(() => {
    if (!isEdit && statuses.length > 0 && !status) {
      // 정책에서 초기값 읽기 (빈 문자열이면 선택 안 함)
      const defaultStatus = getPolicy(policies, 'inspection_default_status', statuses[0].name)
      setStatus(defaultStatus)
    }
  }, [statuses, policies, isEdit, status])

  // ── 객실 선택 핸들러 (등록 폼 자동진행) ──────
  const handleRoomChange = (room) => {
    setRoomNo(room)
    if (!isEdit && room) {
      // 이미지 영역으로 부드럽게 스크롤
      setTimeout(() => {
        imageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 350)
    }
  }

  // ── 상태 선택 핸들러 ──────────────────────────
  const handleStatusChange = (s) => {
    setStatus(s)
    // 시설 외 상태로 바꾸면 체크박스 초기화
    if (s !== '시설') setSendFacilityOrder(false)
  }

  // ── 저장 ─────────────────────────────────────
  const handleSubmit = async () => {
    if (!roomNo) {
      setError('객실번호를 선택해주세요.')
      return
    }
    if (!status) {
      setError('객실상태를 선택해주세요.')
      return
    }

    // daily_reset_hour 정책 적용 — 리셋 시각 이전이면 어제 날짜로 처리
    const resetHour = parseInt(getPolicy(policies, 'daily_reset_hour', '0'), 10)
    const now = dayjs()
    const workDate = now.hour() < resetHour
      ? now.subtract(1, 'day').format('YYYY-MM-DD')
      : now.format('YYYY-MM-DD')

    setSaving(true)
    setError(null)

    try {
      await networkSave(async () => {
      if (isEdit) {
        // ── 수정 ──────────────────────────────
        const { error: upErr } = await supabase
          .from('inspections')
          .update({
            room_no:    roomNo,
            note:       note.trim() || null,
            status,
            updated_by: user.id,
          })
          .eq('id', id)

        if (upErr) throw upErr

        // 이미지 전체 교체 (기존 삭제 후 재삽입)
        // 삭제 실패 시 throw — 삽입 중단으로 데이터 유실 방지
        const { error: delErr } = await supabase
          .from('inspection_images').delete().eq('inspection_id', id)
        if (delErr) throw delErr

        if (imagePaths.length > 0) {
          await supabase.from('inspection_images').insert(
            imagePaths.map((path, idx) => ({
              inspection_id: id,
              thumb_path:    path,
              sort_order:    idx,
            })),
          )
        }

        navigate(`/inspection/${id}`, { replace: true })

      } else {
        // ── 등록 ──────────────────────────────
        let facilityOrderId = null

        // 시설 + 발송 체크 시 시설오더 먼저 생성
        if (status === '시설' && sendFacilityOrder) {
          // facility_types에서 '시설' 타입 조회 (인스펙션 시설 상태 → 오더종류 '시설')
          const { data: ftData } = await supabase
            .from('facility_types')
            .select('id, name')
            .eq('name', '시설')
            .maybeSingle()

          const { data: foData, error: foErr } = await supabase
            .from('facility_orders')
            .insert({
              room_no:            roomNo,
              location_type:      '시설',
              facility_type_id:   ftData?.id   ?? null,
              facility_type_name: ftData?.name ?? '시설',
              note:               note.trim() || null,
              status:             '접수대기',
              author_id:          user.id,
              work_date:          workDate,
            })
            .select('id')
            .single()

          if (foErr) throw foErr
          facilityOrderId = foData.id

          // 오더 신규 생성 — 시설 담당자·관리자·프론트에게 푸시 발송
          sendPush({
            roles:     ['admin', 'manager', 'supervisor', 'facility', 'front'],
            title:     `[${roomNo}] 오더 — ${ftData?.name ?? '시설'}`,
            body:      note.trim() || '',
            url:       `/facility-order/${foData.id}`,
            orderType: '시설',
          })
        }

        // 인스펙션 생성
        const { data: inspData, error: inspErr } = await supabase
          .from('inspections')
          .insert({
            room_no:           roomNo,
            note:              note.trim() || null,
            status,
            author_id:         user.id,
            facility_order_id: facilityOrderId,
            work_date:         workDate,
          })
          .select('id')
          .single()

        if (inspErr) throw inspErr

        // 이미지 삽입
        if (imagePaths.length > 0) {
          await supabase.from('inspection_images').insert(
            imagePaths.map((path, idx) => ({
              inspection_id: inspData.id,
              thumb_path:    path,
              sort_order:    idx,
            })),
          )
        }

        navigate('/inspection', { replace: true })
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
        {/* 객실번호 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">객실번호 *</label>
          <RoomPicker value={roomNo} onChange={handleRoomChange} />
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

        {/* 이미지 — 자동진행 스크롤 기준점 */}
        <section ref={imageRef}>
          <label className="block text-sm text-white/50 mb-2">이미지 (최대 5장)</label>
          <ImageUploader
            type="inspections"
            value={imagePaths}
            onChange={setImagePaths}
            cameraOnly
          />
        </section>

        {/* 객실상태 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">객실상태 *</label>
          <div className="grid grid-cols-2 gap-2">
            {statuses.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleStatusChange(s.name)}
                className={`py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                  status === s.name
                    ? getBtnClass(statuses, s.name)
                    : 'bg-white/10 text-white/50 hover:bg-white/15'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* 시설 선택 + 등록 폼일 때만 발송 체크박스 표시 */}
          {status === '시설' && !isEdit && (
            <label className="flex items-center gap-3 mt-3 px-4 py-3
              bg-orange-500/10 rounded-xl border border-orange-500/30 cursor-pointer">
              <input
                type="checkbox"
                checked={sendFacilityOrder}
                onChange={(e) => setSendFacilityOrder(e.target.checked)}
                className="w-5 h-5 rounded accent-orange-500"
              />
              <span className="text-sm text-orange-300">오더로 발송</span>
            </label>
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
            disabled={saving || !roomNo || !status}
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
