import { useState, useEffect, useRef } from 'react'
import { Loader2, Save, Upload, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { invalidateCache, CACHE_KEYS } from '../../utils/masterCache'

// ─────────────────────────────────────────────
// AppPolicyEditor — 앱 전체 운영 정책 관리
// DB app_policies 테이블을 직접 읽고 씀
// 변경 즉시 저장 (선택값 변경 → DB update → 캐시 무효화)
// ─────────────────────────────────────────────

// 저장 상태 표시 (키별 개별 관리)
const SAVE_IDLE    = 'idle'
const SAVE_LOADING = 'loading'
const SAVE_DONE    = 'done'

export default function AppPolicyEditor() {
  const [policies, setPolicies]   = useState({})
  const [loading, setLoading]     = useState(true)
  // 키별 저장 상태
  const [saveState, setSaveState] = useState({})

  // ── 데이터 로드 ───────────────────────────────
  useEffect(() => {
    const fetchPolicies = async () => {
      const { data } = await supabase.from('app_policies').select('key, value')
      if (data) {
        const map = Object.fromEntries(data.map((p) => [p.key, p.value]))
        setPolicies(map)
      }
      setLoading(false)
    }
    fetchPolicies()
  }, [])

  // ── 값 변경 → 즉시 DB 저장 ───────────────────
  const handleChange = async (key, value) => {
    // 로컬 즉시 반영
    setPolicies((prev) => ({ ...prev, [key]: value }))
    setSaveState((prev) => ({ ...prev, [key]: SAVE_LOADING }))

    const { error } = await supabase
      .from('app_policies')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key)

    if (error) {
      alert('저장 실패: ' + error.message)
      setSaveState((prev) => ({ ...prev, [key]: SAVE_IDLE }))
      return
    }

    // 캐시 무효화 → 전 직원 다음 접속 시 자동 갱신
    await invalidateCache(CACHE_KEYS.appPolicies)
    setSaveState((prev) => ({ ...prev, [key]: SAVE_DONE }))
    // 2초 후 done 표시 제거
    setTimeout(() => setSaveState((prev) => ({ ...prev, [key]: SAVE_IDLE })), 2000)
  }

  // ── 저장 인디케이터 렌더 헬퍼 ────────────────
  const SaveIndicator = ({ policyKey }) => {
    const state = saveState[policyKey]
    if (state === SAVE_LOADING) return <Loader2 size={12} className="animate-spin text-white/30 shrink-0" />
    if (state === SAVE_DONE)    return <span className="text-xs text-emerald-400 shrink-0">저장됨</span>
    return null
  }

  // ── 체크박스 그룹 (역할 배열 정책용) ────────────
  // value는 JSON 배열 문자열로 저장, ALWAYS_ON 역할은 항상 포함
  const ALWAYS_ON = ['admin', 'manager', 'supervisor']
  const CheckboxGroup = ({ policyKey, options }) => {
    const current = (() => {
      try { return JSON.parse(policies[policyKey] || '[]') } catch { return [] }
    })()

    const toggle = (role) => {
      // ALWAYS_ON 역할은 토글 불가
      if (ALWAYS_ON.includes(role)) return
      const next = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role]
      // ALWAYS_ON은 항상 포함 보장
      const merged = [...new Set([...ALWAYS_ON, ...next])]
      handleChange(policyKey, JSON.stringify(merged))
    }

    return (
      <div className="flex flex-wrap gap-2">
        {options.map(({ label, value, disabled }) => {
          const checked = current.includes(value)
          return (
            <button
              key={value}
              disabled={disabled}
              onClick={() => toggle(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${checked
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/10 text-white/50 hover:bg-white/15'
                }
                ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {label}
            </button>
          )
        })}
      </div>
    )
  }

  // ── 라디오 그룹 컴포넌트 ─────────────────────
  const RadioGroup = ({ policyKey, options }) => (
    <div className="flex flex-wrap gap-2">
      {options.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => policies[policyKey] !== value && handleChange(policyKey, value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
            ${policies[policyKey] === value
              ? 'bg-blue-500 text-white'
              : 'bg-white/10 text-white/50 hover:bg-white/15'
            }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  // ── 숫자 입력 + 저장 버튼 ────────────────────
  const NumberField = ({ policyKey, unit = '일' }) => {
    const [localVal, setLocalVal] = useState(policies[policyKey] || '')

    // policies 로드 후 동기화
    useEffect(() => {
      setLocalVal(policies[policyKey] || '')
    }, [policies[policyKey]])

    return (
      <div className="flex items-center gap-2">
        <input
          type="number" min="1" max="365"
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          className="w-20 px-3 py-1.5 bg-white/10 rounded-lg border border-white/15
            text-white text-sm text-center outline-none focus:border-white/35 transition-colors"
        />
        <span className="text-xs text-white/40">{unit}</span>
        <button
          onClick={() => localVal && localVal !== policies[policyKey] && handleChange(policyKey, String(localVal))}
          disabled={!localVal || localVal === policies[policyKey] || saveState[policyKey] === SAVE_LOADING}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-white/50 text-xs
            hover:bg-white/15 transition-colors disabled:opacity-30"
        >
          {saveState[policyKey] === SAVE_LOADING
            ? <Loader2 size={11} className="animate-spin" />
            : <Save size={11} />
          }
          저장
        </button>
        {saveState[policyKey] === SAVE_DONE && (
          <span className="text-xs text-emerald-400">저장됨</span>
        )}
      </div>
    )
  }

  // ── 브랜딩 이미지 업로드 ─────────────────────
  const logoInputRef = useRef(null)
  const bgInputRef   = useRef(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingBg,   setUploadingBg]   = useState(false)

  const handleBrandingUpload = async (file, policyKey, setUploading) => {
    if (!file) return
    setUploading(true)
    try {
      // 기존 파일 삭제 (덮어쓰기 방지)
      const ext      = file.name.split('.').pop()
      const fileName = `${policyKey}.${ext}`
      await supabase.storage.from('branding').remove([fileName])

      const { error: upErr } = await supabase.storage
        .from('branding')
        .upload(fileName, file, { contentType: file.type, upsert: true })

      if (upErr) throw upErr

      // 공개 URL 획득 후 정책 저장
      const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(fileName)
      // 캐시 버스팅용 타임스탬프 추가
      await handleChange(policyKey, `${publicUrl}?t=${Date.now()}`)
    } catch (err) {
      alert('업로드 실패: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveBranding = async (policyKey) => {
    if (!window.confirm('이미지를 삭제하시겠습니까?')) return
    await handleChange(policyKey, '')
  }

  if (loading) return (
    <div className="flex justify-center py-6">
      <Loader2 size={18} className="text-white/30 animate-spin" />
    </div>
  )

  // ── 렌더 ─────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── 섹션 0: 브랜딩 ──────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
          🏨 브랜딩
        </h2>
        <div className="bg-white/5 rounded-2xl px-4 py-4 space-y-4">

          {/* 호텔명 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white/70 flex-1">호텔명 (로그인 화면 표시)</p>
              <SaveIndicator policyKey="hotel_name" />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={policies['hotel_name'] || ''}
                onChange={(e) => setPolicies((prev) => ({ ...prev, hotel_name: e.target.value }))}
                onBlur={(e) => {
                  const val = e.target.value.trim()
                  if (val && val !== policies['hotel_name']) handleChange('hotel_name', val)
                }}
                placeholder="호텔카푸치노"
                className="flex-1 px-3 py-2 bg-white/10 rounded-xl border border-white/15
                  text-white text-sm outline-none focus:border-white/35 transition-colors
                  placeholder:text-white/25"
              />
              <button
                onClick={() => handleChange('hotel_name', policies['hotel_name'] || '')}
                disabled={saveState['hotel_name'] === SAVE_LOADING}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 text-white/50 text-xs
                  hover:bg-white/15 transition-colors disabled:opacity-30"
              >
                {saveState['hotel_name'] === SAVE_LOADING
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Save size={11} />
                }
                저장
              </button>
            </div>
          </div>

          {/* 로고 이미지 */}
          <div className="space-y-2 pt-3 border-t border-white/8">
            <p className="text-sm text-white/70">로고 이미지</p>
            <div className="flex items-center gap-3">
              {/* 미리보기 */}
              {policies['login_logo_url'] ? (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-white/10 shrink-0">
                  <img src={policies['login_logo_url']} alt="로고" className="w-full h-full object-contain" />
                  <button
                    onClick={() => handleRemoveBranding('login_logo_url')}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60
                      flex items-center justify-center text-white/80 hover:bg-black/80"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10
                  flex items-center justify-center shrink-0">
                  <span className="text-xs text-white/20">없음</span>
                </div>
              )}
              <div>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/60
                    text-xs hover:bg-white/15 transition-colors disabled:opacity-40"
                >
                  {uploadingLogo ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {uploadingLogo ? '업로드 중...' : '이미지 선택'}
                </button>
                <p className="text-xs text-white/25 mt-1">PNG/JPG · 권장 512×512</p>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleBrandingUpload(file, 'login_logo_url', setUploadingLogo)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          </div>

          {/* 배경 이미지 */}
          <div className="space-y-2 pt-3 border-t border-white/8">
            <p className="text-sm text-white/70">로그인 배경 이미지</p>
            <div className="flex items-center gap-3">
              {/* 미리보기 */}
              {policies['login_bg_url'] ? (
                <div className="relative w-24 h-16 rounded-xl overflow-hidden bg-white/10 shrink-0">
                  <img src={policies['login_bg_url']} alt="배경" className="w-full h-full object-cover" />
                  <button
                    onClick={() => handleRemoveBranding('login_bg_url')}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60
                      flex items-center justify-center text-white/80 hover:bg-black/80"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div className="w-24 h-16 rounded-xl bg-white/5 border border-white/10
                  flex items-center justify-center shrink-0">
                  <span className="text-xs text-white/20">없음</span>
                </div>
              )}
              <div>
                <button
                  onClick={() => bgInputRef.current?.click()}
                  disabled={uploadingBg}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/60
                    text-xs hover:bg-white/15 transition-colors disabled:opacity-40"
                >
                  {uploadingBg ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {uploadingBg ? '업로드 중...' : '이미지 선택'}
                </button>
                <p className="text-xs text-white/25 mt-1">PNG/JPG · 권장 1080×1920</p>
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleBrandingUpload(file, 'login_bg_url', setUploadingBg)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── 섹션 1: 인스펙션 기본 규칙 ─────────── */}
      <section>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
          🧹 인스펙션 기본 규칙
        </h2>
        <div className="bg-white/5 rounded-2xl px-4 py-4 space-y-4">

          {/* 신규 등록 초기값 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white/70 flex-1">신규 등록 초기값</p>
              <SaveIndicator policyKey="inspection_default_status" />
            </div>
            <RadioGroup
              policyKey="inspection_default_status"
              options={[
                { label: '완료',      value: '완료' },
                { label: '환기중',    value: '환기중' },
                { label: '진행중',    value: '진행중' },
                { label: '선택 안 함', value: '' },
              ]}
            />
          </div>

          {/* 목록 기본 정렬 */}
          <div className="space-y-2 pt-3 border-t border-white/8">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white/70 flex-1">전체 목록 기본 정렬</p>
              <SaveIndicator policyKey="inspection_list_sort" />
            </div>
            <RadioGroup
              policyKey="inspection_list_sort"
              options={[
                { label: '객실 번호순',   value: 'room_no' },
                { label: '시간순',       value: 'created_at' },
                { label: '미완료 우선',   value: 'status_priority' },
              ]}
            />
          </div>

          {/* 일일 리셋 기준 시각 */}
          <div className="space-y-2 pt-3 border-t border-white/8">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white/70 flex-1">일일 리셋 기준 시각</p>
              <SaveIndicator policyKey="daily_reset_hour" />
            </div>
            <RadioGroup
              policyKey="daily_reset_hour"
              options={[
                { label: '자정 00:00', value: '0' },
                { label: '새벽 04:00', value: '4' },
                { label: '오전 08:00', value: '8' },
              ]}
            />
            <p className="text-xs text-white/25">
              이 시각 이후 기록이 대시보드에서 당일 기준으로 집계됩니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 섹션 2: 긴급/경고 알람 기준 ─────────── */}
      <section>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
          🚨 미처리 경보 기준
        </h2>
        <div className="bg-white/5 rounded-2xl px-4 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm text-white/70 flex-1">경보 데드라인</p>
            <SaveIndicator policyKey="alert_deadline_hours" />
          </div>
          <RadioGroup
            policyKey="alert_deadline_hours"
            options={[
              { label: '24시간 초과', value: '24' },
              { label: '48시간 초과', value: '48' },
              { label: '72시간 초과', value: '72' },
            ]}
          />
          <p className="text-xs text-white/25">
            이 기준을 넘긴 미처리 카드가 대시보드에서 빨간색으로 강조됩니다.
          </p>
        </div>
      </section>

      {/* ── 섹션 3: 사진 보존 정책 ───────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
          💾 서버 사진 보존 정책
        </h2>
        <div className="bg-white/5 rounded-2xl px-4 py-4 space-y-4">

          <div className="space-y-1.5">
            <p className="text-sm text-white/70">인스펙션 사진 (thumb)</p>
            <p className="text-xs text-white/30">단순 청소 기록 — 용량 절감 우선</p>
            <NumberField policyKey="inspection_photo_days" unit="일 후 자동 삭제" />
          </div>

          <div className="space-y-1.5 pt-3 border-t border-white/8">
            <p className="text-sm text-white/70">오더 사진</p>
            <p className="text-xs text-white/30">증거 보존 필요 — 길게 유지 권장</p>
            <NumberField policyKey="defect_facility_photo_days" unit="일 후 자동 삭제" />
          </div>

          <div className="pt-3 border-t border-white/8">
            <p className="text-sm text-white/70">객실하자 사진</p>
            <p className="text-xs text-white/25 mt-1">하자 삭제 시에만 함께 삭제 — 자동 삭제 없음</p>
          </div>
        </div>
      </section>

      {/* ── 섹션 4: 게시판 권한 ─────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
          📋 게시판 권한
        </h2>
        <div className="bg-white/5 rounded-2xl px-4 py-4 space-y-4">
          <p className="text-xs text-white/30">
            관리자·소장·주임은 항상 접근·작성 가능합니다.
          </p>

          {/* 게시판 접근 가능 역할 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white/70 flex-1">게시판 접근 가능 역할</p>
              <SaveIndicator policyKey="notice_read_roles" />
            </div>
            <CheckboxGroup
              policyKey="notice_read_roles"
              options={[
                { value: 'admin',      label: '관리자',   disabled: true },
                { value: 'manager',    label: '소장',     disabled: true },
                { value: 'supervisor', label: '주임',     disabled: true },
                { value: 'maid',       label: '메이드',   disabled: false },
                { value: 'facility',   label: '시설',     disabled: false },
                { value: 'houseman',   label: '하우스맨', disabled: false },
                { value: 'front',      label: '프론트',   disabled: false },
              ]}
            />
          </div>

          {/* 게시글 작성 가능 역할 */}
          <div className="space-y-2 pt-3 border-t border-white/8">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white/70 flex-1">게시글 작성 가능 역할</p>
              <SaveIndicator policyKey="notice_write_roles" />
            </div>
            <CheckboxGroup
              policyKey="notice_write_roles"
              options={[
                { value: 'admin',      label: '관리자',   disabled: true },
                { value: 'manager',    label: '소장',     disabled: true },
                { value: 'supervisor', label: '주임',     disabled: true },
                { value: 'maid',       label: '메이드',   disabled: false },
                { value: 'facility',   label: '시설',     disabled: false },
                { value: 'houseman',   label: '하우스맨', disabled: false },
                { value: 'front',      label: '프론트',   disabled: false },
              ]}
            />
          </div>
        </div>
      </section>

    </div>
  )
}
