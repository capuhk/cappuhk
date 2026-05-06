import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Bell } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import useRefreshStore from '../../store/useRefreshStore'

const ROLE_LABEL = {
  admin: '관리자', manager: '소장', supervisor: '주임',
  maid: '메이드', facility: '시설', houseman: '하우스맨', front: '프론트',
}

export default function AnnouncementListPage() {
  const navigate   = useNavigate()
  const refreshKey = useRefreshStore((s) => s.refreshKey)

  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAnnouncements = async () => {
      setLoading(true)
      // Phase 1: 제목·메타만 조회 (내용은 상세 페이지에서 로드)
      const { data } = await supabase
        .from('notices')
        .select('id, title, target_roles, created_at, author:users!author_id(name)')
        .eq('is_pinned', true)
        .order('created_at', { ascending: false })

      setAnnouncements(data || [])
      setLoading(false)
    }
    fetchAnnouncements()
  }, [refreshKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-white/40 animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-24">
      {announcements.length === 0 && (
        <div className="flex items-center justify-center h-40">
          <p className="text-white/30 text-sm">공지가 없습니다.</p>
        </div>
      )}

      <div className="space-y-2">
        {announcements.map((item) => {
          const roles = item.target_roles || []
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/announcement/${item.id}`)}
              className="w-full text-left px-4 py-4 rounded-2xl
                bg-amber-500/10 border border-amber-500/20
                transition-all active:scale-[0.99]"
            >
              <div className="flex items-start gap-2 mb-1.5">
                <Bell size={13} className="text-amber-400 mt-0.5 shrink-0" />
                <span className="text-sm font-semibold text-amber-200 leading-snug">
                  {item.title}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/25 mt-2">
                <span>{item.author?.name || '-'}</span>
                <span>·</span>
                <span>{dayjs(item.created_at).format('YYYY.M.D')}</span>
                <span>·</span>
                <span className="text-amber-400/60">
                  {roles.length === 0
                    ? '전체'
                    : roles.map((r) => ROLE_LABEL[r] || r).join('·')}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
