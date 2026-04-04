import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Phone, Mail } from 'lucide-react'
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

// 역할별 뱃지 색상
const ROLE_COLOR = {
  admin:      'bg-red-500/20 text-red-400',
  manager:    'bg-purple-500/20 text-purple-400',
  supervisor: 'bg-blue-500/20 text-blue-400',
  maid:       'bg-zinc-500/20 text-zinc-400',
  facility:   'bg-emerald-500/20 text-emerald-400',
  houseman:   'bg-orange-500/20 text-orange-400',
  front:      'bg-cyan-500/20 text-cyan-400',
}

// 역할 정렬 우선순위
const ROLE_ORDER = { admin: 0, manager: 1, supervisor: 2, maid: 3, facility: 4, houseman: 5, front: 6 }

export default function StaffListPage() {
  const navigate = useNavigate()
  const { isManager } = useAuthStore()

  const [staffList, setStaffList] = useState([])
  const [loading, setLoading]     = useState(true)

  // ── 목록 로드 ─────────────────────────────────────
  useEffect(() => {
    const fetchStaff = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, phone, avatar_url, is_active, is_locked')
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (!error) {
        // 역할 우선순위 → 이름 순 정렬
        const sorted = (data || []).sort((a, b) => {
          const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
          if (roleDiff !== 0) return roleDiff
          return a.name.localeCompare(b.name, 'ko')
        })
        setStaffList(sorted)
      }
      setLoading(false)
    }

    fetchStaff()
  }, [])

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
      {staffList.length === 0 && (
        <div className="flex items-center justify-center h-40">
          <p className="text-white/30 text-sm">직원 정보가 없습니다.</p>
        </div>
      )}

      <div className="space-y-2">
        {staffList.map((staff) => (
          <button
            key={staff.id}
            onClick={() => navigate(`/staff/${staff.id}`)}
            className="w-full flex items-center gap-4 px-4 py-4 bg-white/5 rounded-2xl
              hover:bg-white/8 active:scale-[0.99] transition-all text-left"
          >
            {/* 아바타 */}
            <div className="w-11 h-11 rounded-full bg-blue-500/25 flex items-center justify-center
              shrink-0 overflow-hidden">
              {staff.avatar_url ? (
                <img
                  src={staff.avatar_url}
                  alt={staff.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-blue-300 font-bold text-base">
                  {staff.name?.[0] ?? '?'}
                </span>
              )}
            </div>

            {/* 이름 + 역할 + 연락처 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-white truncate">{staff.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${ROLE_COLOR[staff.role] || 'bg-zinc-500/20 text-zinc-400'}`}>
                  {ROLE_LABEL[staff.role] || staff.role}
                </span>
                {staff.is_locked && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 shrink-0">
                    잠금
                  </span>
                )}
              </div>

              {/* 전화·문자 아이콘 버튼 (번호 텍스트 미표시) */}
              {staff.phone && (
                <div className="flex items-center gap-2 mt-1">
                  {/* 전화 걸기 */}
                  <a
                    href={`tel:${staff.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center w-7 h-7 rounded-full
                      bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                    aria-label={`${staff.name}에게 전화`}
                  >
                    <Phone size={13} />
                  </a>
                  {/* 문자 보내기 */}
                  <a
                    href={`sms:${staff.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center w-7 h-7 rounded-full
                      bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                    aria-label={`${staff.name}에게 문자`}
                  >
                    <Mail size={13} />
                  </a>
                </div>
              )}
            </div>

            <span className="text-white/20 text-lg shrink-0">›</span>
          </button>
        ))}
      </div>

      {/* FAB는 전역 FAB.jsx에서 처리 */}
    </div>
  )
}
