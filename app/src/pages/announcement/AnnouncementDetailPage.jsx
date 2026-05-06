import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Trash2, ImageOff, Send } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import { getSignedUrls } from '../../utils/imageUpload'

export default function AnnouncementDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user, isManager } = useAuthStore()

  const [record, setRecord]     = useState(null)
  const [imgUrls, setImgUrls]   = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState(false)

  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [deletingCmt, setDeletingCmt] = useState(null)

  const commentInputRef = useRef(null)

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('notices')
      .select(`
        id, title, content, target_roles, created_at, updated_by,
        notice_images(id, thumb_path, sort_order),
        author:users!author_id(name),
        updater:users!updated_by(name)
      `)
      .eq('id', id)
      .eq('is_pinned', true)
      .single()

    if (error || !data) {
      navigate('/announcement', { replace: true })
      return
    }

    setRecord(data)

    const sorted = [...(data.notice_images || [])].sort((a, b) => a.sort_order - b.sort_order)
    const paths  = sorted.map((img) => img.thumb_path).filter(Boolean)

    if (paths.length > 0) {
      try {
        const signed = await getSignedUrls(paths, 'notices')
        const urlMap = Object.fromEntries(signed.map((s) => [s.path, s.signedUrl]))
        setImgUrls(sorted.map((img) => ({
          thumb_path: img.thumb_path,
          url:        img.thumb_path ? (urlMap[img.thumb_path] ?? null) : null,
        })))
      } catch {
        setImgUrls(sorted.map((img) => ({ thumb_path: img.thumb_path, url: null })))
      }
    }

    setLoading(false)
  }

  const fetchComments = async () => {
    const { data } = await supabase
      .from('notice_comments')
      .select('id, content, created_at, author_id, author:users!author_id(name)')
      .eq('notice_id', id)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  useEffect(() => {
    fetchData()
    fetchComments()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!window.confirm('이 공지를 삭제하시겠습니까?\n이미지와 댓글도 함께 삭제됩니다.')) return
    setDeleting(true)

    const paths = (record.notice_images || []).map((img) => img.thumb_path).filter(Boolean)
    if (paths.length > 0) {
      await supabase.storage.from('thumb-notices').remove(paths)
    }

    const { error } = await supabase.from('notices').delete().eq('id', id)
    if (error) {
      alert('삭제 중 오류가 발생했습니다.')
      setDeleting(false)
      return
    }
    navigate('/announcement', { replace: true })
  }

  const handleCommentSubmit = async () => {
    const trimmed = commentText.trim()
    if (!trimmed) return
    setSubmitting(true)
    const { error } = await supabase.from('notice_comments').insert({
      notice_id: id,
      author_id: user.id,
      content:   trimmed,
    })
    if (!error) {
      setCommentText('')
      await fetchComments()
    }
    setSubmitting(false)
  }

  const handleCommentDelete = async (cmtId) => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return
    setDeletingCmt(cmtId)
    await supabase.from('notice_comments').delete().eq('id', cmtId)
    await fetchComments()
    setDeletingCmt(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-white/40 animate-spin" />
      </div>
    )
  }

  if (!record) return null

  return (
    <div className="pb-4">
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
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <ImageOff size={28} className="text-white/20" />
                  <span className="text-sm text-white/30">이미지가 만료되었습니다</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 본문 */}
      <div className="px-4 pt-6 space-y-4">
        <h1 className="text-xl font-bold text-white leading-snug">{record.title}</h1>

        <div className="flex items-center gap-2 text-xs text-white/30">
          <span>{record.author?.name || '-'}</span>
          <span>·</span>
          <span>{dayjs(record.created_at).format('YYYY.M.D HH:mm')}</span>
          {record.updater?.name && (
            <>
              <span>·</span>
              <span>수정: {record.updater.name}</span>
            </>
          )}
        </div>

        <div className="px-4 py-4 bg-white/5 rounded-2xl">
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
            {record.content}
          </p>
        </div>

        {/* 수정/삭제 — 관리자·소장·주임만 */}
        {isManager() && (
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/announcement/${id}/edit`)}
              className="flex-1 py-3 rounded-xl border border-white/20 text-white/60
                hover:bg-white/5 text-sm font-medium transition-all active:scale-[0.98]"
            >
              수정
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-3 rounded-xl border border-red-500/30 text-red-400
                hover:bg-red-500/10 text-sm font-medium transition-all active:scale-[0.98]
                flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        )}
      </div>

      {/* 댓글 영역 */}
      <div className="px-4 mt-6">
        <p className="text-xs text-white/30 mb-3">댓글 {comments.length}개</p>

        <div className="space-y-3 mb-4">
          {comments.map((cmt) => {
            const isMine    = cmt.author_id === user?.id
            const canDelCmt = isMine || isManager()
            return (
              <div key={cmt.id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-500/30 flex items-center justify-center
                  text-blue-300 text-xs font-bold shrink-0 mt-0.5">
                  {(cmt.author?.name || '?')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xs font-medium text-white/70">{cmt.author?.name || '-'}</span>
                    <span className="text-xs text-white/25">{dayjs(cmt.created_at).format('M/D HH:mm')}</span>
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed break-words">{cmt.content}</p>
                </div>
                {canDelCmt && (
                  <button
                    onClick={() => handleCommentDelete(cmt.id)}
                    disabled={deletingCmt === cmt.id}
                    className="text-white/20 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                  >
                    {deletingCmt === cmt.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />
                    }
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 items-end">
          <textarea
            ref={commentInputRef}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleCommentSubmit()
              }
            }}
            placeholder="댓글을 입력하세요"
            rows={2}
            className="flex-1 px-3 py-2.5 bg-white/10 rounded-xl border border-white/15
              text-white placeholder:text-white/30 text-sm resize-none outline-none
              focus:border-white/35 transition-colors"
          />
          <button
            onClick={handleCommentSubmit}
            disabled={submitting || !commentText.trim()}
            className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center
              hover:bg-blue-500 active:scale-95 transition-all
              disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {submitting
              ? <Loader2 size={16} className="text-white animate-spin" />
              : <Send size={16} className="text-white" />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
