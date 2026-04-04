import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Pin } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import useRefreshStore from '../../store/useRefreshStore'

export default function NoticeListPage() {
  const navigate = useNavigate()
  const { user, isManager } = useAuthStore()
  // 헤더 🔄 버튼 트리거 — 변경 시 데이터 재조회
  const refreshKey = useRefreshStore((s) => s.refreshKey)

  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)

  // ── 목록 로드 ─────────────────────────────────────
  useEffect(() => {
    const fetchNotices = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('notices')
        .select(`
          id, title, content, is_pinned, target_roles, created_at,
          author:users!author_id(name)
        `)
        // 공지 상단 고정 → is_pinned DESC, 최신순
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (!error) {
        // 관리자(소장/주임 포함)는 전체 조회, 그 외는 공개 대상 필터 적용
        const filtered = isManager()
          ? (data || [])
          : (data || []).filter((n) =>
              !n.target_roles?.length || n.target_roles.includes(user?.role)
            )
        setNotices(filtered)
      }
      setLoading(false)
    }

    fetchNotices()
  }, [refreshKey]) // refreshKey 변경 시 재조회

  // ── 렌더 ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-white/40 animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-24">
      {notices.length === 0 && (
        <div className="flex items-center justify-center h-40">
          <p className="text-white/30 text-sm">게시글이 없습니다.</p>
        </div>
      )}

      <div className="space-y-2">
        {notices.map((notice) => (
          <button
            key={notice.id}
            onClick={() => navigate(`/notice/${notice.id}`)}
            className={`w-full text-left px-4 py-4 rounded-2xl transition-all active:scale-[0.99]
              ${notice.is_pinned
                ? 'bg-amber-500/10 border border-amber-500/20'
                : 'bg-white/5 hover:bg-white/8'
              }`}
          >
            {/* 제목 줄 */}
            <div className="flex items-start gap-2 mb-1.5">
              {notice.is_pinned && (
                <Pin size={13} className="text-amber-400 mt-0.5 shrink-0" />
              )}
              <span className={`text-sm font-semibold leading-snug ${
                notice.is_pinned ? 'text-amber-200' : 'text-white'
              }`}>
                {notice.title}
              </span>
            </div>

            {/* 내용 미리보기 */}
            <p className="text-xs text-white/40 line-clamp-2 leading-relaxed mb-2">
              {notice.content}
            </p>

            {/* 메타 */}
            <div className="flex items-center gap-2 text-xs text-white/25">
              <span>{notice.author?.name || '-'}</span>
              <span>·</span>
              <span>{dayjs(notice.created_at).format('YYYY.M.D')}</span>
            </div>
          </button>
        ))}
      </div>

      {/* FAB는 전역 FAB.jsx에서 처리 */}
    </div>
  )
}
