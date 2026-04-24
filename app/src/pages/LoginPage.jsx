import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import useAuthStore from '../store/useAuthStore'

// PIN 입력 상태 표시 (● / ○)
const PinDots = ({ length, filled }) => (
  <div className="flex gap-4 justify-center my-8 z-10 relative">
    {Array.from({ length }).map((_, i) => (
      <span
        key={i}
        className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
          i < filled
            ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)] scale-110'
            : 'bg-white/10'
        }`}
      />
    ))}
  </div>
)

// 숫자 키패드 버튼 레이아웃
const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['삭제', '0', '확인'],
]

const PIN_LENGTH = 6

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, getSavedId, clearSavedId, error, clearError, session, loading } = useAuthStore()

  // 단계: null = 로드 중, 'id' = 아이디 입력, 'pin' = PIN 입력
  const [step, setStep] = useState(null)
  const [savedId, setSavedId] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 브랜딩 정책 (호텔명, 로고, 배경)
  const [hotelName, setHotelName]   = useState('')
  const [logoUrl,   setLogoUrl]     = useState('')
  const [bgUrl,     setBgUrl]       = useState('')

  // ── 브랜딩 정책 로드 (로그인 전이므로 직접 조회) ──
  useEffect(() => {
    const loadBranding = async () => {
      const { data } = await supabase
        .from('app_policies')
        .select('key, value')
        .in('key', ['hotel_name', 'login_logo_url', 'login_bg_url'])

      if (data) {
        const map = Object.fromEntries(data.map((p) => [p.key, p.value]))
        setHotelName(map['hotel_name']     || '')
        setLogoUrl(  map['login_logo_url'] || '')
        setBgUrl(    map['login_bg_url']   || '')
      }
    }
    loadBranding()
  }, [])

  // 이미 로그인된 경우 메인으로 이동
  useEffect(() => {
    if (!loading && session) {
      navigate('/inspection', { replace: true })
    }
  }, [loading, session, navigate])

  // 저장된 아이디 확인 — 있으면 PIN 단계, 없으면 ID 단계
  useEffect(() => {
    const saved = getSavedId()
    if (saved) {
      setSavedId(saved)
      setStep('pin')
    } else {
      setStep('id')
    }
  }, [])

  // 에러 메시지는 3초 후 자동 소멸
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => clearError(), 3000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  // PIN 자동 제출 (6자리 완성 즉시)
  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleLogin()
    }
  }, [pin])

  // 키보드 입력 지원 — PIN 단계에서 숫자/백스페이스/엔터 처리
  useEffect(() => {
    if (step !== 'pin') return
    const onKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key)
      else if (e.key === 'Backspace')    handleKey('삭제')
      else if (e.key === 'Enter')        handleKey('확인')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [step, pin, submitting])

  // ── 로그인 처리 ───────────────────────────────
  const handleLogin = async () => {
    if (submitting) return
    const id = step === 'id' ? identifier.trim() : savedId

    if (!id || pin.length !== PIN_LENGTH) return
    setSubmitting(true)

    const { success } = await login(id, pin)

    if (success) {
      // 텔레그램 미니앱 환경이면 telegram_id / telegram_chat_id 연동 저장
      const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
      if (tgUser?.id) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          await supabase
            .from('users')
            .update({
              telegram_id:      tgUser.id,
              telegram_chat_id: String(tgUser.id),
            })
            .eq('id', session.user.id)
        }
      }
      navigate('/inspection', { replace: true })
    } else {
      setPin('')
    }
    setSubmitting(false)
  }

  // 키패드 눌렀을 때 처리
  const handleKey = (key) => {
    if (submitting) return

    if (key === '삭제') {
      setPin((prev) => prev.slice(0, -1))
    } else if (key === '확인') {
      handleLogin()
    } else {
      if (pin.length < PIN_LENGTH) {
        setPin((prev) => prev + key)
      }
    }
  }

  // 다른 계정으로 로그인 클릭
  const handleSwitchAccount = () => {
    clearSavedId()
    setSavedId('')
    setPin('')
    clearError()
    setStep('id')
  }

  // ID 단계에서 다음 버튼
  const handleIdNext = () => {
    if (!identifier.trim()) return
    setStep('pin')
    setSavedId(identifier.trim())
  }

  // 저장된 아이디 확인 전 — 빈 화면 유지 (깜빡임 방지)
  if (step === null) return null

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center px-4">

      {/* 배경 이미지 — 업로드된 경우 표시, 없으면 기존 그라디언트 */}
      {bgUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${bgUrl})` }}
        >
          {/* 어두운 오버레이 */}
          <div className="absolute inset-0 bg-black/55" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-slate-950">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-amber-600/10 via-transparent to-transparent pointer-events-none" />
        </div>
      )}

      <div className="w-full max-w-sm z-10 relative">
        {/* 로고 + 호텔명 */}
        <div className="text-center mb-10">
          {/* 로고 이미지 또는 기본 HK 박스 */}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="로고"
              className="w-16 h-16 mx-auto mb-4 object-contain rounded-2xl"
            />
          ) : (
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-amber-200 to-amber-500 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              <span className="text-2xl font-black text-slate-900 tracking-tighter">HK</span>
            </div>
          )}
          {/* 호텔명 — 설정값 우선, 없으면 기본값 */}
          <h1 className="text-white text-2xl font-bold tracking-widest uppercase">
            {hotelName || 'Housekeeping'}
          </h1>
          <p className="text-white/40 text-xs mt-1 tracking-widest uppercase font-medium">Housekeeping</p>
        </div>

        {/* ID 입력 단계 */}
        {step === 'id' && (
          <div className="space-y-4">
            <p className="text-white/60 text-center text-sm font-medium">
              이메일(관리자) 또는 이름을 입력하세요
            </p>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleIdNext()}
              placeholder="이메일 또는 이름"
              autoFocus
              className="w-full bg-white/5 text-white placeholder-white/30 rounded-xl px-4 py-3.5
                         border border-white/10 focus:outline-none focus:border-amber-400/50 focus:bg-white/10
                         text-center text-lg transition-all"
            />
            <button
              onClick={handleIdNext}
              disabled={!identifier.trim()}
              className="w-full py-3.5 rounded-xl font-bold text-slate-900 bg-amber-400
                         disabled:opacity-30 disabled:bg-white/10 disabled:text-white/40 active:scale-95 transition-all shadow-[0_4px_14px_rgba(251,191,36,0.2)]"
            >
              다음
            </button>
          </div>
        )}

        {/* PIN 입력 단계 */}
        {step === 'pin' && (
          <>
            <p className="text-white text-center text-lg font-medium tracking-wide">
              안녕하세요, <span className="text-amber-400 font-bold">{savedId}</span>님
            </p>

            <PinDots length={PIN_LENGTH} filled={pin.length} />

            {error && (
              <p className="text-red-400 text-center text-sm mb-2 animate-pulse">
                {error}
              </p>
            )}

            <div className="grid grid-cols-3 gap-3 mt-4">
              {KEYPAD.flat().map((key) => (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  disabled={submitting}
                  className={`
                    h-14 rounded-xl text-lg font-medium touch-manipulation transition-transform duration-75 active:scale-90
                    ${key === '삭제' || key === '확인'
                      ? 'bg-white/5 border border-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                      : 'bg-white/5 border border-white/10 text-white/90 hover:bg-white/10'}
                    disabled:opacity-40
                  `}
                >
                  {key}
                </button>
              ))}
            </div>

            <div className="text-center mt-8">
              <button
                onClick={handleSwitchAccount}
                className="text-white/40 text-sm hover:text-white/70 transition-colors underline underline-offset-4"
              >
                다른 계정으로 로그인
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
