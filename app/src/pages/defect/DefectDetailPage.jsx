import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Trash2, ImageOff, X, ZoomIn } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import { getSignedUrls } from '../../utils/imageUpload'

// 상태별 뱃지 색상
const STATUS_COLOR = {
  미완료: 'bg-red-500/20 text-red-400',
  처리중: 'bg-yellow-500/20 text-yellow-400',
  완료:   'bg-emerald-500/20 text-emerald-400',
}

export default function DefectDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [record, setRecord]         = useState(null)
  const [imgUrls, setImgUrls]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [deleting, setDeleting]     = useState(false)
  const [viewerIndex, setViewerIndex] = useState(null)

  // ── 데이터 로드 ───────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase
          .from('defects')
          .select(`
            *,
            defect_images(id, thumb_path, sort_order),
            author:users!author_id(name),
            updater:users!updated_by(name)
          `)
          .eq('id', id)
          .single()

        if (error || !data) {
          navigate('/defect', { replace: true })
          return
        }

        setRecord(data)

        const sorted = [...(data.defect_images || [])].sort((a, b) => a.sort_order - b.sort_order)
        const paths  = sorted.map((img) => img.thumb_path).filter(Boolean)

        if (paths.length > 0) {
          try {
            const signed = await getSignedUrls(paths, 'defects')
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
        console.error('객실하자 상세 로드 오류:', err)
        navigate('/defect', { replace: true })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id, navigate])

  // ── 권한 ─────────────────────────────────────
  const isManager = ['admin', 'manager', 'supervisor'].includes(user?.role)
  const canDelete = isManager

  // ── 삭제 ─────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm('이 하자 기록을 삭제하시겠습니까?\n이미지도 함께 삭제됩니다.')) return

    setDeleting(true)

    // Storage 이미지 먼저 삭제 (영구보관이지만 레코드 삭제 시 같이 제거)
    const paths = (record.defect_images || [])
      .map((img) => img.thumb_path)
      .filter(Boolean)

    if (paths.length > 0) {
      await supabase.storage.from('thumb-defects').remove(paths)
    }

    // DB 레코드 삭제 (defect_images는 CASCADE로 자동 삭제)
    const { error } = await supabase
      .from('defects')
      .delete()
      .eq('id', id)

    if (error) {
      alert('삭제 중 오류가 발생했습니다.')
      setDeleting(false)
      return
    }

    navigate('/defect', { replace: true })
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
      {/* 이미지 슬라이드 — 전체 너비 가로 스크롤, 클릭 시 전체화면 */}
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
                  <span className="text-sm text-white/30">이미지를 불러올 수 없습니다</span>
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
        {/* 객실번호 + 상태 */}
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-white">{record.room_no}</span>
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLOR[record.status]}`}>
            {record.status}
          </span>
        </div>

        {/* 구분 / 위치 / 하자분류 */}
        <div className="px-4 py-4 bg-white/5 rounded-2xl space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 w-16 shrink-0">구분</span>
            <span className="text-sm text-white/80">{record.division}</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xs text-white/40 w-16 shrink-0 pt-0.5">위치</span>
            {/* 쉼표 구분 문자열을 태그 형태로 표시 */}
            <div className="flex flex-wrap gap-1.5">
              {record.location.split(',').filter(Boolean).map((loc, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white/10 text-white/70"
                >
                  {loc.trim()}
                </span>
              ))}
            </div>
          </div>
          {record.category && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/40 w-16 shrink-0">하자분류</span>
              <span className="text-sm text-white/80">{record.category}</span>
            </div>
          )}
        </div>

        {/* 메모 */}
        {record.memo && (
          <div className="px-4 py-4 bg-white/5 rounded-2xl">
            <p className="text-xs text-white/40 mb-1.5">메모</p>
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{record.memo}</p>
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
              {dayjs(record.created_at).format('YYYY년 M월 D일 (ddd)')}
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
            {deleting ? '삭제 중...' : '하자 삭제'}
          </button>
        )}
      </div>
    </div>
  )
}
