import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import ImageUploader from '../../components/common/ImageUploader'
import { networkSave } from '../../utils/networkSave'
import { sendPush } from '../../utils/sendPush'

export default function NoticeFormPage() {
  const { id }   = useParams()
  const isEdit   = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // ── 폼 필드 ───────────────────────────────────────
  const [isPinned, setIsPinned]   = useState(false)
  const [title, setTitle]         = useState('')
  const [content, setContent]     = useState('')
  const [imagePaths, setImagePaths] = useState([])

  // ── 메타 (수정 모드) ──────────────────────────────
  const [authorName, setAuthorName]   = useState('')
  const [createdAt, setCreatedAt]     = useState(null)
  const [updaterName, setUpdaterName] = useState(null)

  // ── UI 상태 ──────────────────────────────────────
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  // ── 등록 모드: 작성자명 세팅 ──────────────────────
  useEffect(() => {
    if (!isEdit && user) setAuthorName(user.name)
  }, [isEdit, user])

  // ── 수정 모드: 기존 데이터 로드 ──────────────────
  useEffect(() => {
    if (!isEdit) return

    const fetchData = async () => {
      const { data, error: fetchErr } = await supabase
        .from('notices')
        .select(`
          *,
          notice_images(id, thumb_path, sort_order),
          author:users!author_id(name),
          updater:users!updated_by(name)
        `)
        .eq('id', id)
        .single()

      if (fetchErr || !data) {
        navigate('/notice', { replace: true })
        return
      }

      setIsPinned(data.is_pinned)
      setTitle(data.title)
      setContent(data.content)
      setAuthorName(data.author?.name || '')
      setCreatedAt(data.created_at)
      setUpdaterName(data.updater?.name || null)

      const sorted = [...(data.notice_images || [])].sort((a, b) => a.sort_order - b.sort_order)
      setImagePaths(sorted.map((img) => img.thumb_path).filter(Boolean))

      setLoading(false)
    }

    fetchData()
  }, [id, isEdit, navigate])

  // ── 저장 ─────────────────────────────────────────
  const handleSubmit = async () => {
    if (!title.trim()) { setError('제목을 입력해주세요.'); return }
    if (!content.trim()) { setError('내용을 입력해주세요.'); return }

    setSaving(true)
    setError(null)

    try {
      await networkSave(async () => {
      if (isEdit) {
        // ── 수정 ──────────────────────────────────
        const { error: upErr } = await supabase
          .from('notices')
          .update({
            is_pinned:  isPinned,
            title:      title.trim(),
            content:    content.trim(),
            updated_by: user.id,
          })
          .eq('id', id)

        if (upErr) throw upErr

        // 이미지 전체 교체
        await supabase.from('notice_images').delete().eq('notice_id', id)
        if (imagePaths.length > 0) {
          await supabase.from('notice_images').insert(
            imagePaths.map((path, idx) => ({
              notice_id:  id,
              thumb_path: path,
              sort_order: idx,
            })),
          )
        }

        navigate(`/notice/${id}`, { replace: true })

      } else {
        // ── 등록 ──────────────────────────────────
        const { data: noticeData, error: insertErr } = await supabase
          .from('notices')
          .insert({
            is_pinned: isPinned,
            title:     title.trim(),
            content:   content.trim(),
            author_id: user.id,
          })
          .select('id')
          .single()

        if (insertErr) throw insertErr

        if (imagePaths.length > 0) {
          await supabase.from('notice_images').insert(
            imagePaths.map((path, idx) => ({
              notice_id:  noticeData.id,
              thumb_path: path,
              sort_order: idx,
            })),
          )
        }

        // 공지(is_pinned=true) 신규 등록 시 주임·메이드·시설에게 푸시 발송
        if (isPinned) {
          sendPush({
            roles: ['supervisor', 'maid', 'facility'],
            title: '📌 공지 등록',
            body:  title.trim(),
            url:   `/notice/${noticeData.id}`,
          })
        }

        navigate('/notice', { replace: true })
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

  // ── 로딩 ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-white/40 animate-spin" />
      </div>
    )
  }

  // ── 렌더 ─────────────────────────────────────────
  return (
    <div>
      <div className="px-4 pt-6 pb-36 space-y-6">

        {/* 구분 — 일반 / 공지 토글 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">구분</label>
          <div className="flex gap-2">
            {[
              { value: false, label: '일반' },
              { value: true,  label: '공지' },
            ].map(({ value, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => setIsPinned(value)}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                  isPinned === value
                    ? value
                      ? 'bg-amber-500 text-white'
                      : 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/50 hover:bg-white/15'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* 제목 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">제목 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20
              text-white placeholder:text-white/30 text-sm outline-none
              focus:border-white/40 transition-colors"
          />
        </section>

        {/* 내용 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">내용 *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용을 입력하세요"
            rows={6}
            className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20
              text-white placeholder:text-white/30 text-sm resize-none outline-none
              focus:border-white/40 transition-colors"
          />
        </section>

        {/* 이미지 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">이미지 (최대 3장)</label>
          <ImageUploader
            type="notices"
            value={imagePaths}
            onChange={setImagePaths}
          />
        </section>

        {/* 작성자 / 날짜 */}
        <section className="space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <span className="text-xs text-white/40 w-20 shrink-0">작성자</span>
            <span className="text-sm text-white/60">{authorName}</span>
          </div>
          {isEdit && createdAt && (
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
              <span className="text-xs text-white/40 w-20 shrink-0">작성일</span>
              <span className="text-sm text-white/60">
                {dayjs(createdAt).format('YYYY년 M월 D일')}
              </span>
            </div>
          )}
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
      <div className="fixed bottom-0 left-0 right-0 z-20 lg:pl-60">
        <div className="max-w-[680px] mx-auto lg:max-w-none px-4 pb-4 pt-3
          bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent">
          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim() || !content.trim()}
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
