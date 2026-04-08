import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pin, ChevronRight } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'

// ─────────────────────────────────────────────
// NoticePopup — 앱 진입 시 미확인 공지 팝업
//
// - is_pinned=true 공지 중 notification_reads에 없는 것만 표시
// - 확인 클릭 → notification_reads에 저장 → 다음 미확인 공지 순차 표시
// - 다기기 동기화: DB 기준이므로 다른 기기에서 확인 시 재표시 안 됨
// ─────────────────────────────────────────────

export default function NoticePopup() {
  const { user, isManager } = useAuthStore()
  const navigate = useNavigate()

  // 미확인 공지 목록 — 순차적으로 하나씩 표시
  const [queue,   setQueue]   = useState([])
  const [current, setCurrent] = useState(null)
  const [loading, setLoading] = useState(false)

  // ── 앱 마운트 시 미확인 공지 조회 ───────────────
  useEffect(() => {
    if (!user?.id) return
    fetchUnreadNotices()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUnreadNotices = async () => {
    // is_pinned=true 공지 최근 10개
    const { data: notices } = await supabase
      .from('notices')
      .select('id, title, content, created_at, target_roles')
      .eq('is_pinned', true)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!notices?.length) return

    // 역할 필터링
    const filtered = notices.filter((n) =>
      isManager() || !n.target_roles?.length || n.target_roles.includes(user.role)
    )
    if (!filtered.length) return

    // 이미 확인한 공지 조회
    const ids = filtered.map((n) => `popup_notice_${n.id}`)
    const { data: reads } = await supabase
      .from('notification_reads')
      .select('item_id')
      .eq('user_id', user.id)
      .in('item_id', ids)

    const readSet = new Set((reads || []).map((r) => r.item_id))

    // 미확인 공지만 큐에 추가 (오래된 순 — 오래된 것부터 확인)
    const unread = filtered
      .filter((n) => !readSet.has(`popup_notice_${n.id}`))
      .reverse()

    if (unread.length > 0) {
      setQueue(unread.slice(1))   // 첫 번째 제외 나머지는 큐
      setCurrent(unread[0])       // 첫 번째 즉시 표시
    }
  }

  // ── 확인 클릭 — DB에 읽음 저장 후 다음 공지로 ──
  const handleConfirm = async () => {
    if (!current || loading) return
    setLoading(true)

    await supabase
      .from('notification_reads')
      .upsert(
        { user_id: user.id, item_id: `popup_notice_${current.id}` },
        { onConflict: 'user_id,item_id' },
      )

    setLoading(false)

    // 다음 공지 표시 or 팝업 닫기
    if (queue.length > 0) {
      setCurrent(queue[0])
      setQueue((prev) => prev.slice(1))
    } else {
      setCurrent(null)
    }
  }

  // ── 상세 보기 이동 ────────────────────────────
  const handleDetail = async () => {
    await handleConfirm()
    navigate(`/notice/${current.id}`)
  }

  if (!current) return null

  return (
    <>
      {/* 배경 오버레이 */}
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" />

      {/* 팝업 — 화면 너비 70% */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="min-w-[320px] w-[70vw] max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

          {/* 헤더 */}
          <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10 bg-amber-500/10">
            <Pin size={18} className="text-amber-400 shrink-0" />
            <span className="text-base font-bold text-amber-400 flex-1">공지사항</span>
            {/* 큐 남은 개수 표시 */}
            {queue.length > 0 && (
              <span className="text-sm text-white/40">+{queue.length}개 더</span>
            )}
          </div>

          {/* 본문 */}
          <div className="px-5 py-5">
            <p className="text-lg font-bold text-white leading-snug">
              {current.title}
            </p>
            <p className="text-sm text-white/40 mt-1.5">
              {dayjs(current.created_at).format('YYYY.MM.DD')}
            </p>
            {/* 내용 미리보기 — 최대 4줄 */}
            {current.content && (
              <p className="text-base text-white/70 mt-4 leading-relaxed line-clamp-4 whitespace-pre-line">
                {current.content}
              </p>
            )}
          </div>

          {/* 버튼 */}
          <div className="flex border-t border-white/10">
            {/* 상세 보기 */}
            <button
              onClick={handleDetail}
              className="flex-1 flex items-center justify-center gap-1.5 py-4
                text-base text-blue-400 hover:bg-white/5 transition-colors"
            >
              상세 보기
              <ChevronRight size={16} />
            </button>

            <div className="w-px bg-white/10" />

            {/* 확인 */}
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 py-4 text-base font-semibold text-white
                hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
