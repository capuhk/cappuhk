import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Phone, Mail, MessageSquare, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'

// 역할 한글 레이블
const ROLE_LABEL = {
  admin:      '관리자',
  manager:    '소장',
  supervisor: '주임',
  maid:       '메이드',
  facility:   '시설',
  houseman:   '하우스맨',
  front:      '프론트',
}

const ROLE_COLOR = {
  admin:      'bg-red-500/20 text-red-400',
  manager:    'bg-purple-500/20 text-purple-400',
  supervisor: 'bg-blue-500/20 text-blue-400',
  maid:       'bg-zinc-500/20 text-zinc-400',
  facility:   'bg-emerald-500/20 text-emerald-400',
  houseman:   'bg-orange-500/20 text-orange-400',
  front:      'bg-cyan-500/20 text-cyan-400',
}

export default function StaffDetailPage() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { isManager } = useAuthStore()

  const [staff, setStaff]   = useState(null)
  const [loading, setLoading] = useState(true)

  // ── 데이터 로드 ───────────────────────────────────
  useEffect(() => {
    const fetchStaff = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, phone, avatar_url, is_active, is_locked, created_at')
        .eq('id', id)
        .single()

      if (error || !data) {
        navigate('/staff', { replace: true })
        return
      }

      setStaff(data)
      setLoading(false)
    }

    fetchStaff()
  }, [id, navigate])

  // ── 로딩 ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-white/40 animate-spin" />
      </div>
    )
  }

  if (!staff) return null

  // 내부 이메일 여부 — {uuid}@hk.internal 형식은 표시 생략
  const showEmail = staff.email && !staff.email.includes('@hk.internal')

  // ── 렌더 ─────────────────────────────────────────
  return (
    <div className="px-4 pt-6 pb-8 space-y-6">

      {/* 프로필 이미지 + 이름 + 역할 */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-24 h-24 rounded-full bg-blue-500/25 flex items-center justify-center
          overflow-hidden">
          {staff.avatar_url ? (
            <img
              src={staff.avatar_url}
              alt={staff.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-blue-300 font-bold text-4xl">
              {staff.name?.[0] ?? '?'}
            </span>
          )}
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-white">{staff.name}</h1>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <span className={`text-xs px-3 py-1 rounded-full ${ROLE_COLOR[staff.role] || 'bg-zinc-500/20 text-zinc-400'}`}>
              {ROLE_LABEL[staff.role] || staff.role}
            </span>
            {staff.is_locked && (
              <span className="text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-400">
                계정잠금
              </span>
            )}
            {!staff.is_active && (
              <span className="text-xs px-3 py-1 rounded-full bg-zinc-500/20 text-zinc-400">
                비활성
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 연락처 정보 */}
      <div className="space-y-2">
        {showEmail && (
          <a
            href={`mailto:${staff.email}`}
            className="flex items-center gap-4 px-4 py-4 bg-white/5 rounded-2xl
              hover:bg-white/8 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
              <Mail size={17} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-0.5">이메일</p>
              <p className="text-sm text-white/80">{staff.email}</p>
            </div>
          </a>
        )}

        {staff.phone && (
          <>
            <a
              href={`tel:${staff.phone}`}
              className="flex items-center gap-4 px-4 py-4 bg-white/5 rounded-2xl
                hover:bg-white/8 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Phone size={17} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-white/40 mb-0.5">전화</p>
                <p className="text-sm text-white/80">{staff.phone}</p>
              </div>
            </a>

            <a
              href={`sms:${staff.phone}`}
              className="flex items-center gap-4 px-4 py-4 bg-white/5 rounded-2xl
                hover:bg-white/8 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <MessageSquare size={17} className="text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-white/40 mb-0.5">문자</p>
                <p className="text-sm text-white/80">{staff.phone}</p>
              </div>
            </a>
          </>
        )}

        {/* 전화·이메일 모두 없는 경우 */}
        {!showEmail && !staff.phone && (
          <div className="px-4 py-4 bg-white/5 rounded-2xl">
            <p className="text-sm text-white/30 text-center">연락처 정보가 없습니다.</p>
          </div>
        )}
      </div>

      {/* 수정 버튼 — 관리자·소장·주임만 */}
      {isManager() && (
        <button
          onClick={() => navigate(`/settings/users/${id}/edit`)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
            border border-white/20 text-white/60
            hover:bg-white/5 text-sm font-medium transition-all active:scale-[0.98]"
        >
          <Pencil size={15} />
          직원 정보 수정
        </button>
      )}
    </div>
  )
}
