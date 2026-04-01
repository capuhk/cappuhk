import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Trash2, ImageOff } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import { getSignedUrls } from '../../utils/imageUpload'
import { getMasterData, getCachedDataSync, CACHE_KEYS } from '../../utils/masterCache'
import { getBadgeClass } from '../../utils/statusColors'

export default function InspectionDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [statuses, setStatuses] = useState(
    () => getCachedDataSync(CACHE_KEYS.inspectionStatuses) || []
  )
  const [record, setRecord]     = useState(null)
  const [imgUrls, setImgUrls]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState(false)

  // ── 데이터 로드 ───────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select(`
          *,
          inspection_images(id, thumb_path, sort_order),
          author:users!author_id(name),
          updater:users!updated_by(name)
        `)
        .eq('id', id)
        .single()

      if (error || !data) {
        navigate('/inspection', { replace: true })
        return
      }

      setRecord(data)

      // 이미지 signed URL 로드
      const sorted = [...(data.inspection_images || [])].sort((a, b) => a.sort_order - b.sort_order)
      const paths  = sorted.map((img) => img.thumb_path).filter(Boolean)

      if (paths.length > 0) {
        try {
          const signed = await getSignedUrls(paths, 'inspections')
          const urlMap = Object.fromEntries(signed.map((s) => [s.path, s.signedUrl]))
          setImgUrls(sorted.map((img) => ({
            thumb_path: img.thumb_path,
            url:        img.thumb_path ? (urlMap[img.thumb_path] ?? null) : null,
          })))
        } catch {
          // signed URL 실패 → 만료 처리
          setImgUrls(sorted.map((img) => ({ thumb_path: img.thumb_path, url: null })))
        }
      }

      setLoading(false)
    }

    fetchData()
    getMasterData(CACHE_KEYS.inspectionStatuses).then(setStatuses)
  }, [id, navigate])

  // ── 권한 계산 ─────────────────────────────────
  const isManager = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'supervisor'
  // 수정: 관리자·소장·주임 또는 작성자 본인 (FAB에서 처리)
  // 삭제: 관리자·소장·주임만
  const canDelete = isManager

  // ── 삭제 ─────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm('이 인스펙션을 삭제하시겠습니까?\n이미지도 함께 삭제됩니다.')) return

    setDeleting(true)

    // Storage 이미지 먼저 삭제
    const paths = (record.inspection_images || [])
      .map((img) => img.thumb_path)
      .filter(Boolean)

    if (paths.length > 0) {
      await supabase.storage.from('thumb-inspections').remove(paths)
    }

    // DB 레코드 삭제 (inspection_images는 CASCADE로 자동 삭제)
    const { error } = await supabase
      .from('inspections')
      .delete()
      .eq('id', id)

    if (error) {
      alert('삭제 중 오류가 발생했습니다.')
      setDeleting(false)
      return
    }

    navigate('/inspection', { replace: true })
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
      {/* 이미지 슬라이드 — 전체 너비 가로 스크롤 */}
      {imgUrls.length > 0 && (
        <div
          className="flex gap-2 overflow-x-auto px-4 pt-4"
          style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}
        >
          {imgUrls.map((item, idx) => (
            <div
              key={idx}
              className="shrink-0 w-[calc(100vw-2rem)] max-w-[640px] aspect-[4/3]
                rounded-2xl overflow-hidden bg-white/10"
              style={{ scrollSnapAlign: 'start' }}
            >
              {item.url ? (
                <img
                  src={item.url}
                  alt={`이미지 ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                // 만료된 이미지
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <ImageOff size={28} className="text-white/20" />
                  <span className="text-sm text-white/30">이미지가 만료되었습니다</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 상세 정보 */}
      <div className="px-4 pt-6 pb-6 space-y-4">
        {/* 객실번호 + 상태 */}
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-white">{record.room_no}</span>
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${getBadgeClass(statuses, record.status)}`}>
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

        {/* 메타 정보 */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <span className="text-xs text-white/40 w-20 shrink-0">작성자</span>
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
          {updaterName && (
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
              <span className="text-xs text-white/40 w-20 shrink-0">최종수정자</span>
              <span className="text-sm text-white/70">{updaterName}</span>
            </div>
          )}
        </div>

        {/* 삭제 버튼 — 관리자·소장·주임만 표시 */}
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
            {deleting ? '삭제 중...' : '인스펙션 삭제'}
          </button>
        )}
      </div>
    </div>
  )
}
