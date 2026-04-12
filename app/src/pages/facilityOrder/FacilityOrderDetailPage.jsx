import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Trash2, ImageOff, X, ZoomIn } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import { getSignedUrls } from '../../utils/imageUpload'
import { sendPush } from '../../utils/sendPush'
import { getMasterData, CACHE_KEYS } from '../../utils/masterCache'
import BottomSheet from '../../components/common/BottomSheet'

// 상태별 뱃지 색상 — '이관' 추가
const STATUS_COLOR = {
  접수대기: 'bg-zinc-500/30 text-zinc-300',
  처리중:   'bg-blue-500/20 text-blue-400',
  완료:     'bg-emerald-500/20 text-emerald-400',
  이관:     'bg-purple-500/20 text-purple-400',
}

export default function FacilityOrderDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [record, setRecord]           = useState(null)
  const [imgUrls, setImgUrls]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [deleting, setDeleting]       = useState(false)
  const [accepting, setAccepting]     = useState(false)
  const [completing, setCompleting]   = useState(false)
  const [viewerIndex, setViewerIndex] = useState(null)

  // ── 이관 관련 상태 ────────────────────────────
  const [moving, setMoving]                   = useState(false)
  const [divisions, setDivisions]             = useState([])
  const [locations, setLocations]             = useState([])
  const [selDivision, setSelDivision]         = useState('')
  const [selLocation, setSelLocation]         = useState('')
  const [divisionSheetOpen, setDivisionSheetOpen] = useState(false)
  const [locationSheetOpen, setLocationSheetOpen] = useState(false)

  // ── 데이터 로드 ───────────────────────────────
  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('facility_orders')
        .select(`
          *,
          facility_order_images(id, thumb_path, sort_order),
          author:users!author_id(name),
          updater:users!updated_by(name)
        `)
        .eq('id', id)
        .single()

      if (error || !data) {
        navigate('/facility-order', { replace: true })
        return
      }

      setRecord(data)

      const sorted = [...(data.facility_order_images || [])].sort((a, b) => a.sort_order - b.sort_order)
      const paths  = sorted.map((img) => img.thumb_path).filter(Boolean)

      if (paths.length > 0) {
        try {
          const signed = await getSignedUrls(paths, 'facilityOrders')
          const urlMap = Object.fromEntries(signed.map((s) => [s.path, s.signedUrl]))
          setImgUrls(sorted.map((img) => ({
            thumb_path: img.thumb_path,
            url:        img.thumb_path ? (urlMap[img.thumb_path] ?? null) : null,
          })))
        } catch {
          setImgUrls(sorted.map((img) => ({ thumb_path: img.thumb_path, url: null })))
        }
      }
    } catch (err) {
      console.error('시설오더 상세 로드 오류:', err)
      navigate('/facility-order', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 관리자인 경우 이관용 마스터 데이터 로드 ───
  const isManager  = ['admin', 'manager', 'supervisor'].includes(user?.role)
  const isFacility = user?.role === 'facility'

  useEffect(() => {
    if (!isManager) return
    Promise.all([
      getMasterData(CACHE_KEYS.defectDivisions),
      getMasterData(CACHE_KEYS.defectLocations),
    ]).then(([divs, locs]) => {
      setDivisions(divs || [])
      setLocations(locs || [])
    })
  }, [isManager]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 권한 ─────────────────────────────────────
  const canChangeStatus = isManager || isFacility
  const canDelete       = isManager

  // 선택된 구분에 해당하는 위치 목록 필터링
  const divisionObj       = divisions.find((d) => d.name === selDivision)
  const filteredLocations = divisionObj
    ? locations.filter((l) => l.division_id === divisionObj.id)
    : []

  // ── 접수 처리 (접수대기 → 처리중) ────────────
  const handleAccept = async () => {
    setAccepting(true)
    const { error } = await supabase
      .from('facility_orders')
      .update({ status: '처리중', updated_by: user.id })
      .eq('id', id)

    if (error) {
      alert('접수 처리 중 오류가 발생했습니다.')
    } else {
      await supabase.from('facility_order_log').insert({
        facility_order_id: id,
        changed_by:        user.id,
        old_status:        '접수대기',
        new_status:        '처리중',
      })
      await fetchData()
    }
    setAccepting(false)
  }

  // ── 완료 처리 (처리중 → 완료) ─────────────────
  const handleComplete = async () => {
    if (!window.confirm('오더를 완료 처리하시겠습니까?')) return
    setCompleting(true)
    const { error } = await supabase
      .from('facility_orders')
      .update({ status: '완료', completed_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', id)

    if (error) {
      alert('완료 처리 중 오류가 발생했습니다.')
    } else {
      await supabase.from('facility_order_log').insert({
        facility_order_id: id,
        changed_by:        user.id,
        old_status:        '처리중',
        new_status:        '완료',
      })

      // 완료 처리 푸시 — 오더종류별 수신 역할 분기
      // 객실·시설: 관리자+담당자+프론트 / 공용부: 관리자만
      const COMPLETE_PUSH_ROLES = {
        '객실':  ['admin', 'manager', 'supervisor', 'houseman', 'front'],
        '시설':  ['admin', 'manager', 'supervisor', 'facility', 'front'],
        '공용부': ['admin', 'manager', 'supervisor'],
      }
      const completeLocationType = record.location_type ?? '객실'
      const completePushTitle = record.room_no
        ? `[${record.room_no}] 오더 완료`
        : `[${completeLocationType}] 오더 완료`
      sendPush({
        roles:     COMPLETE_PUSH_ROLES[completeLocationType] ?? ['admin', 'manager', 'supervisor'],
        title:     completePushTitle,
        body:      record.facility_type_name || '',
        url:       `/facility-order/${id}`,
        orderType: completeLocationType,
      })

      await fetchData()
    }
    setCompleting(false)
  }

  // ── 이미지 복사 (시설오더 버킷 → 하자 버킷) ──
  // RPC 성공 후 호출 — 실패해도 데이터 정합성은 RPC가 보장
  const migrateImages = async (images) => {
    const newPaths = []
    for (const img of images) {
      if (!img.thumb_path) continue

      const { data: blob, error: dlErr } = await supabase.storage
        .from('thumb-facility-orders')
        .download(img.thumb_path)

      if (dlErr || !blob) continue

      // 파일명만 추출 — thumb_path에 폴더 경로가 포함된 경우 '/' 문제 방지
      const fileName = img.thumb_path.split('/').pop()
      const newPath  = `migrated/${Date.now()}_${fileName}`

      const { error: upErr } = await supabase.storage
        .from('thumb-defects')
        .upload(newPath, blob, { contentType: 'image/jpeg', upsert: false })

      if (!upErr) newPaths.push(newPath)
    }
    return newPaths
  }

  // ── 이관 실행 ─────────────────────────────────
  // 순서: RPC(트랜잭션) 먼저 → 이미지 복사
  // RPC 성공 후 이미지 복사 실패 시 데이터는 안전, 이미지만 누락
  const executeMove = async (division, location) => {
    setMoving(true)
    try {
      // 1. RPC로 defect 등록 + facility_order 상태 변경 원자적 처리
      const { data: newDefectId, error: rpcErr } = await supabase.rpc('move_facility_to_defect_v1', {
        p_fo_id:    id,
        p_room_no:  record.room_no,
        p_division: division,
        p_location: location,
        p_memo:     `[시설이관] ${record.note || ''}`.trim(),
        p_user_id:  user.id,
      })

      if (rpcErr) throw rpcErr

      // 2. RPC 성공 후 이미지 복사 (60일 자동삭제 버킷 → 영구보관 버킷)
      const images = record.facility_order_images || []
      if (images.length > 0) {
        const newPaths = await migrateImages(images)
        if (newPaths.length > 0) {
          await supabase.from('defect_images').insert(
            newPaths.map((p, i) => ({ defect_id: newDefectId, thumb_path: p, sort_order: i }))
          )
        }
      }

      // 3. 관리자·소장·주임에게 이관 알림 푸시
      sendPush({
        roles:     ['admin', 'manager', 'supervisor'],
        title:     `[🚨시설이관] ${record.room_no}호`,
        body:      `${division} — ${location}${record.note ? ` (${record.note})` : ''}`,
        url:       `/defect/${newDefectId}`,
        orderType: '시설',  // 관리자 알람 OFF 필터링 적용
      })

      navigate(`/defect/${newDefectId}`, { replace: true })
    } catch (err) {
      console.error(err)
      alert('이관 중 오류가 발생했습니다.')
    } finally {
      setMoving(false)
    }
  }

  // ── 구분 선택 핸들러 ──────────────────────────
  const handleDivisionSelect = (name) => {
    setSelDivision(name)
    setSelLocation('')
    setDivisionSheetOpen(false)
    // 구분 선택 후 위치 Sheet 자동 오픈
    setTimeout(() => setLocationSheetOpen(true), 300)
  }

  // ── 위치 선택 핸들러 ──────────────────────────
  const handleLocationSelect = (locName) => {
    setSelLocation(locName)
    setLocationSheetOpen(false)
    // Sheet 닫힘 애니메이션 후 최종 확인
    setTimeout(() => {
      if (window.confirm(`${selDivision} — ${locName}\n위 위치로 객실하자 이관하시겠습니까?`)) {
        executeMove(selDivision, locName)
      }
    }, 300)
  }

  // ── 삭제 ─────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm('이 오더를 삭제하시겠습니까?\n이미지도 함께 삭제됩니다.')) return

    setDeleting(true)

    const paths = (record.facility_order_images || [])
      .map((img) => img.thumb_path)
      .filter(Boolean)

    if (paths.length > 0) {
      await supabase.storage.from('thumb-facility-orders').remove(paths)
    }

    const { error } = await supabase
      .from('facility_orders')
      .delete()
      .eq('id', id)

    if (error) {
      alert('삭제 중 오류가 발생했습니다.')
      setDeleting(false)
      return
    }

    navigate('/facility-order', { replace: true })
  }

  // ── 로딩 ─────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-white/40 animate-spin" />
      </div>
    )
  }

  if (!record) return null

  const authorName  = record.author?.name  || '-'
  const updaterName = record.updater?.name || null

  // ── 렌더 ─────────────────────────────────────
  return (
    <div>
      {/* 이미지 슬라이드 — 클릭 시 전체화면 */}
      {imgUrls.length > 0 && (
        <div
          className="flex gap-2 overflow-x-auto px-4 pt-4"
          style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}
        >
          {imgUrls.map((item, idx) => (
            <div
              key={idx}
              className="shrink-0 w-[calc(100vw-2rem)] max-w-[640px] aspect-[4/3]
                rounded-2xl overflow-hidden bg-white/10 relative group"
              style={{ scrollSnapAlign: 'start' }}
            >
              {item.url ? (
                <>
                  <img
                    src={item.url}
                    alt={`이미지 ${idx + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setViewerIndex(idx)}
                  />
                  <button
                    onClick={() => setViewerIndex(idx)}
                    className="absolute inset-0 flex items-center justify-center
                      bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ZoomIn size={28} className="text-white" />
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <ImageOff size={28} className="text-white/20" />
                  <span className="text-sm text-white/30">이미지가 만료되었습니다</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 전체화면 뷰어 */}
      {viewerIndex !== null && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
          onClick={() => setViewerIndex(null)}
        >
          <button
            onClick={() => setViewerIndex(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10
              flex items-center justify-center hover:bg-white/20 transition-colors z-10"
          >
            <X size={20} className="text-white" />
          </button>
          {imgUrls.length > 1 && (
            <span className="absolute top-4 left-1/2 -translate-x-1/2
              text-sm text-white/60 bg-black/40 px-3 py-1 rounded-full z-10">
              {viewerIndex + 1} / {imgUrls.length}
            </span>
          )}
          <img
            src={imgUrls[viewerIndex]?.url}
            alt=""
            className="max-w-full max-h-full object-contain px-2"
            onClick={(e) => e.stopPropagation()}
          />
          {imgUrls.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setViewerIndex((v) => (v - 1 + imgUrls.length) % imgUrls.length) }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                  bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors text-white text-lg"
              >‹</button>
              <button
                onClick={(e) => { e.stopPropagation(); setViewerIndex((v) => (v + 1) % imgUrls.length) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                  bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors text-white text-lg"
              >›</button>
            </>
          )}
        </div>
      )}

      {/* 상세 정보 */}
      <div className="px-4 pt-6 pb-6 space-y-4">
        {/* 객실번호 + 상태 + 긴급 뱃지 */}
        <div className="flex items-center gap-3">
          {/* room_no 없으면(공용부·시설) location_type 표시 */}
          <span className="text-2xl font-bold text-white">
            {record.room_no || record.location_type || ''}
          </span>
          {record.is_urgent && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
              🚨 긴급
            </span>
          )}
          <span className="text-base text-white/60">{record.facility_type_name}</span>
          <span className={`ml-auto text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLOR[record.status] || 'bg-zinc-500/30 text-zinc-300'}`}>
            {record.status}
          </span>
        </div>

        {/* 특이사항 */}
        {record.note && (
          <div className="px-4 py-4 bg-white/5 rounded-2xl">
            <p className="text-xs text-white/40 mb-1.5">특이사항</p>
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{record.note}</p>
          </div>
        )}

        {/* 상태 변경 버튼 */}
        {canChangeStatus && (
          <div className="space-y-2">
            {/* 접수대기 → 처리중 */}
            {record.status === '접수대기' && (
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold
                  hover:bg-blue-500 active:scale-[0.98] transition-all
                  flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {accepting && <Loader2 size={16} className="animate-spin" />}
                {accepting ? '처리 중...' : '접수'}
              </button>
            )}
            {/* 처리중 → 완료 */}
            {record.status === '처리중' && (
              <button
                onClick={handleComplete}
                disabled={completing}
                className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold
                  hover:bg-emerald-500 active:scale-[0.98] transition-all
                  flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {completing && <Loader2 size={16} className="animate-spin" />}
                {completing ? '처리 중...' : '완료'}
              </button>
            )}
          </div>
        )}

        {/* 이관 버튼 — 관리자·소장·주임만, 완료·이관 상태 제외 */}
        {isManager && record.status !== '완료' && record.status !== '이관' && (
          <button
            onClick={() => {
              setSelDivision('')
              setSelLocation('')
              setDivisionSheetOpen(true)
            }}
            disabled={moving}
            className="w-full py-3.5 rounded-xl border border-purple-500/30 text-purple-400
              hover:bg-purple-500/10 active:scale-[0.98] transition-all
              flex items-center justify-center gap-2 text-sm font-medium
              disabled:opacity-40"
          >
            {moving && <Loader2 size={16} className="animate-spin" />}
            {moving ? '이관 중...' : '객실하자로 이관'}
          </button>
        )}

        {/* 메타 정보 */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <span className="text-xs text-white/40 w-20 shrink-0">담당자</span>
            <span className="text-sm text-white/70">{authorName}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <span className="text-xs text-white/40 w-20 shrink-0">작성일</span>
            <span className="text-sm text-white/70">
              {dayjs(record.work_date).format('YYYY년 M월 D일 (ddd)')}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <span className="text-xs text-white/40 w-20 shrink-0">등록시각</span>
            <span className="text-sm text-white/70">
              {dayjs(record.created_at).format('HH:mm')}
            </span>
          </div>
          {record.completed_at && (
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
              <span className="text-xs text-white/40 w-20 shrink-0">완료시각</span>
              <span className="text-sm text-white/70">
                {dayjs(record.completed_at).format('YYYY년 M월 D일 HH:mm')}
              </span>
            </div>
          )}
          {updaterName && (
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
              <span className="text-xs text-white/40 w-20 shrink-0">최종수정자</span>
              <span className="text-sm text-white/70">{updaterName}</span>
            </div>
          )}
        </div>

        {/* 삭제 버튼 — 관리자·소장·주임만 */}
        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full mt-4 py-3 rounded-xl border border-red-500/30 text-red-400
              hover:bg-red-500/10 active:scale-[0.98] transition-all
              flex items-center justify-center gap-2 text-sm font-medium
              disabled:opacity-40"
          >
            {deleting
              ? <Loader2 size={16} className="animate-spin" />
              : <Trash2 size={16} />
            }
            {deleting ? '삭제 중...' : '오더 삭제'}
          </button>
        )}
      </div>

      {/* 구분 선택 BottomSheet */}
      <BottomSheet
        open={divisionSheetOpen}
        onClose={() => setDivisionSheetOpen(false)}
        title="하자 구분 선택"
      >
        <div className="space-y-1 py-2">
          {divisions.map((div) => (
            <button
              key={div.id}
              onClick={() => handleDivisionSelect(div.name)}
              className="w-full text-left px-4 py-3.5 rounded-xl text-white/80
                hover:bg-white/10 active:bg-white/15 transition-colors text-sm"
            >
              {div.name}
            </button>
          ))}
          {divisions.length === 0 && (
            <p className="text-center text-sm text-white/30 py-6">구분 데이터가 없습니다</p>
          )}
        </div>
      </BottomSheet>

      {/* 위치 선택 BottomSheet */}
      <BottomSheet
        open={locationSheetOpen}
        onClose={() => setLocationSheetOpen(false)}
        title={`위치 선택 (${selDivision})`}
      >
        <div className="space-y-1 py-2">
          {filteredLocations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => handleLocationSelect(loc.name)}
              className="w-full text-left px-4 py-3.5 rounded-xl text-white/80
                hover:bg-white/10 active:bg-white/15 transition-colors text-sm"
            >
              {loc.name}
            </button>
          ))}
          {filteredLocations.length === 0 && (
            <p className="text-center text-sm text-white/30 py-6">위치 데이터가 없습니다</p>
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
