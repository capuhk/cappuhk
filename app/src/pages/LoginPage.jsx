import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'

// PIN 입력 상태 표시 (● / ○)
const PinDots = ({ length, filled }) => (
  <div className="flex gap-4 justify-center my-6">
    {Array.from({ length }).map((_, i) => (
      <span
        key={i}
        className={`w-4 h-4 rounded-full border-2 transition-all ${
          i < filled
            ? 'bg-white border-white'
            : 'bg-transparent border-white/50'
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
  // null로 시작해서 저장된 아이디 확인 후 결정 — 초기 깜빡임 방지
  const [step, setStep] = useState(null)
  const [savedId, setSavedId] = useState('')
  const [identifier, setIdentifier] = useState('')  // id 단계에서 입력값
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  // PIN 자동 제출 (4자리 완성 즉시)
  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleLogin()
    }
  }, [pin])

  // ─────────────────────────────────────────────
  // 로그인 처리
  // ─────────────────────────────────────────────
  const handleLogin = async () => {
    if (submitting) return
    const id = step === 'id' ? identifier.trim() : savedId

    if (!id || pin.length !== PIN_LENGTH) return
    setSubmitting(true)

    const { success } = await login(id, pin)

    if (success) {
      navigate('/inspection', { replace: true })
    } else {
      // 로그인 실패 시 PIN 초기화
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

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────
  // 저장된 아이디 확인 전 — 빈 화면 유지 (깜빡임 방지)
  if (step === null) return null

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* 로고 + 앱명 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-3 bg-white/10 rounded-2xl flex items-center justify-center">
            <span className="text-2xl font-bold text-white">HK</span>
          </div>
          <h1 className="text-white text-xl font-semibold tracking-wide">하우스키핑</h1>
        </div>

        {/* ID 입력 단계 */}
        {step === 'id' && (
          <div className="space-y-4">
            <p className="text-white/70 text-center text-sm">
              이메일(관리자) 또는 이름을 입력하세요
            </p>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleIdNext()}
              placeholder="이메일 또는 이름"
              autoFocus
              className="w-full bg-white/10 text-white placeholder-white/40 rounded-xl px-4 py-3
                         border border-white/20 focus:outline-none focus:border-white/60
                         text-center text-lg"
            />
            <button
              onClick={handleIdNext}
              disabled={!identifier.trim()}
              className="w-full py-3 rounded-xl font-semibold text-zinc-900 bg-white
                         disabled:opacity-40 active:scale-95 transition-transform"
            >
              다음
            </button>
          </div>
        )}

        {/* PIN 입력 단계 */}
        {step === 'pin' && (
          <>
            <p className="text-white text-center text-lg font-medium">
              안녕하세요, <span className="text-white font-bold">{savedId}</span>님
            </p>

            {/* PIN 도트 표시 */}
            <PinDots length={PIN_LENGTH} filled={pin.length} />

            {/* 에러 메시지 */}
            {error && (
              <p className="text-red-400 text-center text-sm mb-2 animate-pulse">
                {error}
              </p>
            )}

            {/* 숫자 키패드 */}
            <div className="grid grid-cols-3 gap-3 mt-2">
              {KEYPAD.flat().map((key) => (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  disabled={submitting}
                  className={`
                    h-14 rounded-xl text-lg font-semibold transition-all active:scale-95
                    ${key === '삭제' || key === '확인'
                      ? 'bg-white/10 text-white/70 hover:bg-white/20'
                      : 'bg-white/15 text-white hover:bg-white/25'}
                    disabled:opacity-40
                  `}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* 다른 계정으로 로그인 */}
            <div className="text-center mt-6">
              <button
                onClick={handleSwitchAccount}
                className="text-white/50 text-sm hover:text-white/80 transition-colors underline underline-offset-2"
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
