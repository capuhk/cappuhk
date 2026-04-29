import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Trash2, ImageOff, X, ZoomIn, Send, MessageSquare } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import { getSignedUrls } from '../../utils/imageUpload'
import { sendPush } from '../../utils/sendPush'
import { getMasterData, CACHE_KEYS } from '../../utils/masterCache'
import BottomSheet from '../../components/common/BottomSheet'

// 상태별 뱃지 색상
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

  // ── 리마크 상태 ───────────────────────────────
  const [remarks, setRemarks]         = useState([])
  const [remarkInput, setRemarkInput] = useState('')
  const [sending, setSending]         = useState(false)
  const [deletingRemark, setDeletingRemark] = useState(null)
  const [remarkBarOpen, setRemarkBarOpen] = useState(false)
  const [kbHeight, setKbHeight]       = useState(0)
  const remarksEndRef  = useRef(null)
  const remarkInputRef = useRef(null)

  // ── 데이터 로드 ───────────────────────────────
  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('facility_orders')
        .select(`
          *,
          facility_order_images(id, thumb_path, sort_order),
          author:users!author_id(name),
          updater:users!updated_by(name),
          acceptor:users!accepted_by(name)
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

  // ── 리마크 로드 ───────────────────────────────
  const fetchRemarks = async () => {
    const { data, error } = await supabase
      .from('facility_order_remarks')
      .select('id, content, created_at, author:users!author_id(id, name)')
      .eq('facility_order_id', id)
      .order('created_at', { ascending: true })

    if (!error && data) setRemarks(data)
  }

  useEffect(() => {
    fetchData()
    fetchRemarks()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 리마크 Realtime 구독 ──────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`remarks-${id}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'facility_order_remarks',
        filter: `facility_order_id=eq.${id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          // 본인 전송은 낙관적 업데이트로 이미 반영됨 — 타인 리마크만 재조회
          if (payload.new?.author_id !== user?.id) fetchRemarks()
        } else if (payload.eventType === 'DELETE') {
          setRemarks((prev) => prev.filter((r) => r.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 새 리마크 추가 시 스크롤 하단 이동 ────────
  useEffect(() => {
    remarksEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [remarks])

  // ── iOS 키보드 높이 추적 ─────────────────────
  useEffect(() => {
    if (!remarkBarOpen) { setKbHeight(0); return }
    if (typeof window === 'undefined' || !window.visualViewport) return
    const update = () => setKbHeight(window.innerHeight - window.visualViewport.height)
    window.visualViewport.addEventListener('resize', update)
    update()
    return () => window.visualViewport.removeEventListener('resize', update)
  }, [remarkBarOpen])

  // ── 리마크 바 열릴 때 자동 포커스 ────────────
  useEffect(() => {
    if (remarkBarOpen) setTimeout(() => remarkInputRef.current?.focus(), 100)
  }, [remarkBarOpen])

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

  // 완료 권한: 관리자·소장·주임은 누구나, 그 외는 접수자 본인만
  const canComplete = isManager || !record?.accepted_by || user?.id === record?.accepted_by

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
      .update({ status: '처리중', updated_by: user.id, accepted_by: user.id })
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

      // 완료 처리 푸시
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
  const migrateImages = async (images) => {
    const newPaths = []
    for (const img of images) {
      if (!img.thumb_path) continue

      const { data: blob, error: dlErr } = await supabase.storage
        .from('thumb-facility-orders')
        .download(img.thumb_path)

      if (dlErr || !blob) continue

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
  const executeMove = async (division, location) => {
    setMoving(true)
    try {
      const { data: newDefectId, error: rpcErr } = await supabase.rpc('move_facility_to_defect_v1', {
        p_fo_id:    id,
        p_room_no:  record.room_no,
        p_division: division,
        p_location: location,
        p_memo:     `[시설이관] ${record.note || ''}`.trim(),
        p_user_id:  user.id,
      })

      if (rpcErr) throw rpcErr

      const images = record.facility_order_images || []
      if (images.length > 0) {
        const newPaths = await migrateImages(images)
        if (newPaths.length > 0) {
          await supabase.from('defect_images').insert(
            newPaths.map((p, i) => ({ defect_id: newDefectId, thumb_path: p, sort_order: i }))
          )
        }
      }

      sendPush({
        roles:     ['admin', 'manager', 'supervisor'],
        title:     `[🚨시설이관] ${record.room_no}호`,
        body:      `${division} — ${location}${record.note ? ` (${record.note})` : ''}`,
        url:       `/defect/${newDefectId}`,
        orderType: '시설',
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
    setTimeout(() => setLocationSheetOpen(true), 300)
  }

  // ── 위치 선택 핸들러 ──────────────────────────
  const handleLocationSelect = (locName) => {
    setSelLocation(locName)
    setLocationSheetOpen(false)
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

  // ── 리마크 전송 ───────────────────────────────
  const handleSendRemark = async () => {
    const content = remarkInput.trim()
    if (!content || sending) return

    setSending(true)
    const { data, error } = await supabase
      .from('facility_order_remarks')
      .insert({ facility_order_id: id, author_id: user.id, content })
      .select('id, content, created_at, author:users!author_id(id, name)')
      .single()

    if (!error && data) {
      // 낙관적 업데이트 — Realtime 지연 없이 즉시 반영
      setRemarks((prev) => [...prev, data])
      setRemarkInput('')
    }
    setSending(false)
  }

  // ── 리마크 삭제 ───────────────────────────────
  const handleDeleteRemark = async (remarkId) => {
    setDeletingRemark(remarkId)
    await supabase.from('facility_order_remarks').delete().eq('id', remarkId)
    setDeletingRemark(null)
  }

  // ── 입력창 엔터키: 줄바꿈 (전송은 버튼으로) ──
  const handleRemarkKeyDown = (e) => {
    // 모바일에서 Shift+Enter 어려우므로 Enter는 줄바꿈, 전송은 버튼만
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

  const authorName   = record.author?.name   || '-'
  const updaterName  = record.updater?.name  || null
  const acceptorName = record.acceptor?.name || null

  // ── 렌더 ─────────────────────────────────────
  return (
    <div>
      {/* 이미지 슬라이드 */}
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
            <p className="text-xs text-white/40 mb-1.5">메모</p>
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
            {/* 처리중 → 완료 (권한 있는 경우만) */}
            {record.status === '처리중' && (
              canComplete ? (
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
              ) : (
                // 완료 권한 없음 — 접수자 안내
                <div className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-center">
                  <p className="text-xs text-white/40">
                    완료는 접수자({acceptorName})만 처리할 수 있습니다
                  </p>
                </div>
              )
            )}
          </div>
        )}

        {/* 이관 버튼 */}
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
          {acceptorName && (
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
              <span className="text-xs text-white/40 w-20 shrink-0">접수자</span>
              <span className="text-sm text-blue-400">{acceptorName}</span>
            </div>
          )}
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

        {/* ── 리마크 섹션 ─────────────────────────── */}
        <div className="pt-2">
          <div className="flex items-center justify-between px-1 mb-3">
            <p className="text-xs text-white/40">리마크</p>
            <button
              onClick={() => setRemarkBarOpen(true)}
              className="flex items-center gap-1 text-xs text-amber-400/70 hover:text-amber-400 transition-colors"
            >
              <MessageSquare size={12} />
              리마크 입력
            </button>
          </div>

          {/* 리마크 목록 */}
          <div className="space-y-2 mb-3">
            {remarks.length === 0 ? (
              <p className="text-xs text-white/20 text-center py-4">리마크가 없습니다</p>
            ) : (
              remarks.map((remark) => {
                const isMyRemark = remark.author?.id === user?.id
                const canDeleteRemark = isMyRemark || isManager

                return (
                  <div
                    key={remark.id}
                    className={`flex flex-col gap-0.5 ${isMyRemark ? 'items-end' : 'items-start'}`}
                  >
                    {/* 작성자명 + 시각 */}
                    <div className={`flex items-center gap-1.5 px-1 ${isMyRemark ? 'flex-row-reverse' : ''}`}>
                      <span className="text-xs text-white/40 font-medium">{remark.author?.name}</span>
                      <span className="text-xs text-white/25">{dayjs(remark.created_at).format('MM/DD HH:mm')}</span>
                    </div>

                    {/* 말풍선 */}
                    <div className={`flex items-end gap-1.5 ${isMyRemark ? 'flex-row-reverse' : ''}`}>
                      <div
                        className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          isMyRemark
                            ? 'bg-amber-400/90 text-slate-900 rounded-tr-sm'
                            : 'bg-slate-800 text-white/80 rounded-tl-sm'
                        }`}
                      >
                        {remark.content}
                      </div>

                      {/* 삭제 버튼 */}
                      {canDeleteRemark && (
                        <button
                          onClick={() => handleDeleteRemark(remark.id)}
                          disabled={deletingRemark === remark.id}
                          className="shrink-0 w-5 h-5 flex items-center justify-center
                            text-white/20 hover:text-red-400 transition-colors"
                        >
                          {deletingRemark === remark.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <X size={11} />
                          }
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={remarksEndRef} />
          </div>

        </div>


        {/* 삭제 버튼 */}
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

      {/* 리마크 fixed 하단 입력바 — 목록과 동일한 오버레이 방식 */}
      {remarkBarOpen && (
        <>
          {/* 배경 딤 — 탭 시 닫기 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setRemarkBarOpen(false)}
          />
          <div
            className="fixed left-0 right-0 z-50 bg-slate-950 border-t border-white/10
              flex items-end gap-2 px-3 py-2 lg:left-60"
            style={{ bottom: kbHeight, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <textarea
              ref={remarkInputRef}
              value={remarkInput}
              onChange={(e) => setRemarkInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setRemarkBarOpen(false) }}
              placeholder="리마크 입력 (버튼으로 전송)"
              rows={1}
              style={{ fontSize: '16px', maxHeight: '96px' }}
              className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3.5 py-2.5
                text-sm text-white placeholder:text-white/25 outline-none resize-none
                focus:border-amber-400/40 transition-colors leading-relaxed"
              onInput={(e) => {
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`
              }}
            />
            <button
              onClick={handleSendRemark}
              disabled={!remarkInput.trim() || sending}
              className="shrink-0 w-10 h-10 rounded-xl bg-amber-400 text-slate-900
                flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
            >
              {sending
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />
              }
            </button>
          </div>
        </>
      )}
    </div>
  )
}
