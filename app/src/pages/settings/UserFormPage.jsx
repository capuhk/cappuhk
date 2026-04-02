import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Camera } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../store/useAuthStore'
import { uploadAvatar } from '../../utils/imageUpload'

const ROLES = [
  { value: 'admin',      label: '관리자' },
  { value: 'manager',    label: '소장' },
  { value: 'supervisor', label: '주임' },
  { value: 'maid',       label: '메이드' },
  { value: 'facility',   label: '시설' },
]

export default function UserFormPage() {
  const { id }   = useParams()
  const isEdit   = Boolean(id)
  const navigate = useNavigate()
  const { user: currentUser, isManager } = useAuthStore()

  // 관리자만 접근 가능
  useEffect(() => {
    if (currentUser && !isManager()) {
      navigate('/settings', { replace: true })
    }
  }, [currentUser, isManager, navigate])

  // ── 폼 필드 ───────────────────────────────────
  const [name, setName]   = useState('')
  const [role, setRole]   = useState('maid')
  const [phone, setPhone] = useState('')
  const [pin, setPin]     = useState('')

  // ── 아바타 ────────────────────────────────────
  const [avatarUrl, setAvatarUrl]         = useState(null)   // 현재 저장된 URL
  const [avatarFile, setAvatarFile]       = useState(null)   // 선택된 파일 객체
  const [avatarPreview, setAvatarPreview] = useState(null)   // 로컬 미리보기 URL
  const fileInputRef = useRef(null)

  // ── 수정 모드 전용 상태 ───────────────────────
  const [isActive, setIsActive] = useState(true)
  const [isLocked, setIsLocked] = useState(false)
  const [resetPin, setResetPin] = useState(false)

  // ── UI 상태 ──────────────────────────────────
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  // ── 수정 모드: 기존 데이터 로드 ──────────────
  useEffect(() => {
    if (!isEdit) return

    const fetchUser = async () => {
      const { data, error: fetchErr } = await supabase
        .from('users')
        .select('id, name, role, phone, is_active, is_locked, avatar_url')
        .eq('id', id)
        .single()

      if (fetchErr || !data) {
        navigate('/settings', { replace: true })
        return
      }

      setName(data.name)
      setRole(data.role)
      setPhone(data.phone || '')
      setIsActive(data.is_active)
      setIsLocked(data.is_locked)
      setAvatarUrl(data.avatar_url || null)
      setLoading(false)
    }

    fetchUser()
  }, [id, isEdit, navigate])

  // ── 아바타 파일 선택 핸들러 ───────────────────
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    // 로컬 미리보기 생성
    setAvatarPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  // ── 저장 ─────────────────────────────────────
  const handleSubmit = async () => {
    setError(null)

    if (!name.trim()) { setError('이름을 입력해주세요.'); return }
    if (!isEdit && pin.length < 6) {
      setError('PIN은 6자리 이상이어야 합니다.')
      return
    }
    if (resetPin && pin.length > 0 && pin.length < 6) {
      setError('새 PIN은 6자리 이상이어야 합니다.')
      return
    }

    setSaving(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token

      if (!accessToken) {
        setError('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
        return
      }

      if (!isEdit) {
        // ── 등록: Edge Function 호출 ──────────────
        const controller = new AbortController()
        const timeoutId  = setTimeout(() => controller.abort(), 15000)

        let res
        try {
          res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
            {
              method:  'POST',
              headers: {
                'Content-Type':  'application/json',
                Authorization:   `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                name:  name.trim(),
                pin,
                role,
                phone: phone.trim() || undefined,
              }),
              signal: controller.signal,
            },
          )
        } finally {
          clearTimeout(timeoutId)
        }

        const result = await res.json()

        if (!res.ok) {
          setError(result.error || '등록 중 오류가 발생했습니다.')
          return
        }

        // 아바타 파일이 있으면 업로드 — Edge Function 응답에서 userId 획득
        if (avatarFile) {
          // result.id 또는 이름으로 조회하여 userId 확보
          const newUserId = result.id ?? result.user?.id
          if (newUserId) {
            try {
              const publicUrl = await uploadAvatar(avatarFile, newUserId)
              await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', newUserId)
            } catch (avatarErr) {
              // 아바타 실패는 무시하고 등록 완료 처리
              console.error('아바타 업로드 실패:', avatarErr)
            }
          }
        }

        navigate('/settings', { replace: true })

      } else {
        // ── 수정: 기본 정보 업데이트 ──────────────
        const { error: upErr } = await supabase
          .from('users')
          .update({
            name:      name.trim(),
            role,
            phone:     phone.trim() || null,
            is_active: isActive,
            is_locked: isLocked,
          })
          .eq('id', id)

        if (upErr) throw upErr

        // 아바타 파일이 있으면 업로드 후 URL 업데이트
        if (avatarFile) {
          const publicUrl = await uploadAvatar(avatarFile, id)
          await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', id)
        }

        // PIN 재설정 요청 시 Edge Function 호출
        if (resetPin && pin.length >= 6) {
          const ctrl2    = new AbortController()
          const timeout2 = setTimeout(() => ctrl2.abort(), 15000)

          let pinRes
          try {
            pinRes = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-pin`,
              {
                method:  'POST',
                headers: {
                  'Content-Type':  'application/json',
                  Authorization:   `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ userId: id, pin }),
                signal: ctrl2.signal,
              },
            )
          } finally {
            clearTimeout(timeout2)
          }

          if (!pinRes.ok) {
            const result = await pinRes.json()
            setError(result.error || 'PIN 재설정 중 오류가 발생했습니다.')
            return
          }
        }

        navigate('/settings', { replace: true })
      }
    } catch (err) {
      console.error(err)
      setError('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // ── 로딩 ─────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-white/40 animate-spin" />
      </div>
    )
  }

  // ── 현재 표시할 아바타 이미지 (미리보기 우선) ──
  const displayAvatar = avatarPreview || avatarUrl

  // ── 렌더 ─────────────────────────────────────
  return (
    <div>
      <div className="px-4 pt-6 pb-48 space-y-6 max-w-xl mx-auto">

        {/* 아바타 */}
        <section className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-20 h-20 rounded-full overflow-hidden
              bg-white/10 border-2 border-white/20 hover:border-white/40
              transition-colors group"
          >
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt="아바타"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="flex items-center justify-center w-full h-full text-2xl text-white/30">
                {name.trim() ? name.trim()[0].toUpperCase() : '?'}
              </span>
            )}
            {/* 호버 오버레이 */}
            <span className="absolute inset-0 flex items-center justify-center
              bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={18} className="text-white" />
            </span>
          </button>
          <p className="text-xs text-white/30">사진을 눌러 변경</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </section>

        {/* 이름 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">이름 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="직원 이름"
            className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20
              text-white placeholder:text-white/30 text-sm outline-none
              focus:border-white/40 transition-colors"
          />
        </section>

        {/* 역할 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">역할 *</label>
          <div className="flex flex-wrap gap-2">
            {ROLES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                  role === value
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/50 hover:bg-white/15'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* 전화번호 */}
        <section>
          <label className="block text-sm text-white/50 mb-2">전화번호</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-0000-0000"
            className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20
              text-white placeholder:text-white/30 text-sm outline-none
              focus:border-white/40 transition-colors"
          />
        </section>

        {/* PIN */}
        {!isEdit ? (
          <section>
            <label className="block text-sm text-white/50 mb-2">초기 PIN * (6자리 숫자)</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="숫자 6자리"
              inputMode="numeric"
              className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20
                text-white placeholder:text-white/30 text-sm outline-none
                focus:border-white/40 transition-colors"
            />
          </section>
        ) : (
          <section>
            <button
              type="button"
              onClick={() => { setResetPin((v) => !v); setPin('') }}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {resetPin ? '▲ PIN 재설정 취소' : '▼ PIN 재설정'}
            </button>
            {resetPin && (
              <div className="mt-2">
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="새 PIN (6자리)"
                  inputMode="numeric"
                  className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20
                    text-white placeholder:text-white/30 text-sm outline-none
                    focus:border-white/40 transition-colors"
                />
              </div>
            )}
          </section>
        )}

        {/* 수정 모드 전용: 계정 잠금 + 활성 */}
        {isEdit && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-4 py-3.5 bg-white/5 rounded-xl">
              <div>
                <p className="text-sm text-white/70">계정 잠금</p>
                <p className="text-xs text-white/30 mt-0.5">PIN 5회 오류 시 자동 잠금됨</p>
              </div>
              <button
                type="button"
                onClick={() => setIsLocked((v) => !v)}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  isLocked ? 'bg-red-500' : 'bg-white/20'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all
                  ${isLocked ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between px-4 py-3.5 bg-white/5 rounded-xl">
              <div>
                <p className="text-sm text-white/70">계정 활성</p>
                <p className="text-xs text-white/30 mt-0.5">비활성 시 로그인 불가</p>
              </div>
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                disabled={id === currentUser?.id}
                className={`w-12 h-6 rounded-full transition-colors relative disabled:opacity-40 ${
                  isActive ? 'bg-emerald-500' : 'bg-white/20'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all
                  ${isActive ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
          </section>
        )}

        {/* 에러 */}
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>

      {/* Thumb-zone 저장 버튼 */}
      <div className="fixed left-0 right-0 z-20 lg:pl-60" style={{ bottom: 'var(--form-btn-bottom)' }}>
        <div className="max-w-[680px] mx-auto lg:max-w-none px-4 pb-4 pt-3
          bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent">
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || (!isEdit && pin.length < 4)}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white text-base font-semibold
              hover:bg-blue-500 active:scale-[0.98] transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={18} className="animate-spin" />}
            {saving ? '저장 중...' : isEdit ? '수정 완료' : '직원 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
