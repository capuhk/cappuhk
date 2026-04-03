import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { clearAllCache } from '../utils/masterCache'
import useNotificationStore from './useNotificationStore'

// localStorage 키: 재진입 시 아이디 자동완성
const SAVED_ID_KEY = 'hk_saved_id'

// 이메일 형식 여부 판별 (관리자 vs 일반직원 구분)
const isEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)

const useAuthStore = create((set, get) => ({
  user: null,     // users 테이블 프로필 (id, name, email, role, ...)
  session: null,  // Supabase 세션 객체
  loading: true,  // 앱 첫 로드 시 세션 복원 중 여부
  error: null,    // 로그인 에러 메시지

  // ─────────────────────────────────────────────
  // 앱 시작 시 호출 — 기존 세션 복원 + 세션 변경 구독
  //
  // 무한 스피닝 원인:
  //   1시간 idle → access_token 만료 → refresh_token 갱신 시도
  //   → refresh_token도 만료 → 400 Bad Request → loading 미해제
  //
  // 해결:
  //   - onAuthStateChange 이벤트로 토큰 만료·갱신 처리
  //   - SIGNED_OUT / TOKEN_REFRESHED 실패 → 로컬 스토리지 초기화 후 로그인으로
  //   - 5초 타임아웃 안전장치
  // ─────────────────────────────────────────────
  init: () => {
    // 5초 안전장치 — 어떤 이유로든 이벤트가 오지 않으면 강제 해제
    const timer = setTimeout(() => set({ loading: false }), 5000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') {
          // 앱 첫 로드 — 세션 즉시 반영 후 프로필 조회
          // session을 먼저 set해야 타이머(5s)가 먼저 터져도 /login으로 튕기지 않음
          if (session) {
            set({ session })
            clearTimeout(timer)
            set({ loading: false })
            const profile = await get()._fetchProfile(session.user.id)
            if (profile) set({ user: profile })
          } else {
            clearTimeout(timer)
            set({ loading: false })
          }

        } else if (event === 'SIGNED_IN') {
          // 로그인 성공
          if (session) {
            const profile = await get()._fetchProfile(session.user.id)
            set({ session, user: profile })
          }

        } else if (event === 'TOKEN_REFRESHED') {
          if (session) {
            // 토큰 갱신 성공 — 세션 업데이트
            set({ session })
          } else {
            // 토큰 갱신 실패 — 세션 만료 처리 (SIGNED_OUT 이벤트와 동일)
            const savedId = localStorage.getItem(SAVED_ID_KEY)
            localStorage.clear()
            if (savedId) localStorage.setItem(SAVED_ID_KEY, savedId)
            set({ session: null, user: null, loading: false })
          }

        } else if (event === 'SIGNED_OUT') {
          // 로그아웃 또는 세션 강제 만료
          // SAVED_ID_KEY는 유지 — 재로그인 시 아이디 자동완성
          const savedId = localStorage.getItem(SAVED_ID_KEY)
          localStorage.clear()
          if (savedId) localStorage.setItem(SAVED_ID_KEY, savedId)
          set({ session: null, user: null, loading: false })
        }
      }
    )

    // 언마운트 시 구독 해제 (메모리 누수 방지)
    return () => { subscription.unsubscribe(); clearTimeout(timer) }
  },

  // ─────────────────────────────────────────────
  // users 테이블에서 프로필 조회 (내부 전용)
  // 실패 시 null 반환 — init의 finally에서 loading: false 보장
  // ─────────────────────────────────────────────
  _fetchProfile: async (userId) => {
    try {
      const { data } = await supabase
        .from('users')
        .select('id, name, email, role, avatar_url, is_locked, is_active')
        .eq('id', userId)
        .single()
      return data
    } catch (err) {
      console.error('프로필 조회 오류:', err)
      return null
    }
  },

  // ─────────────────────────────────────────────
  // 로그인
  //   - 이메일 형식 → 관리자 로그인 (email + PIN)
  //   - 이름 형식  → 일반직원 로그인 (이름 → internal_email 조회 → PIN)
  // ─────────────────────────────────────────────
  login: async (identifier, pin) => {
    set({ error: null })

    let email = identifier

    // 일반직원: 이름으로 internal_email 조회 (SECURITY DEFINER RPC — RLS 우회)
    if (!isEmail(identifier)) {
      const { data: foundEmail, error: lookupError } = await supabase
        .rpc('get_internal_email_by_name', { p_name: identifier })

      if (lookupError || !foundEmail) {
        set({ error: '등록되지 않은 직원 이름입니다.' })
        return { success: false }
      }
      email = foundEmail
    }

    // Supabase Auth 로그인
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    })

    if (error) {
      set({ error: 'PIN이 올바르지 않습니다.' })
      return { success: false }
    }

    // 로그인 성공 — 아이디를 localStorage에 저장 (재진입용)
    localStorage.setItem(SAVED_ID_KEY, identifier)

    const profile = await get()._fetchProfile(data.user.id)
    set({ session: data.session, user: profile, error: null })
    return { success: true }
  },

  // ─────────────────────────────────────────────
  // 로그아웃 — 세션 종료 + 마스터 캐시 전체 삭제
  // ─────────────────────────────────────────────
  logout: async () => {
    await supabase.auth.signOut()

    // 마스터 캐시 전체 삭제 (계정 오염 방지)
    clearAllCache()

    // 알림 스토어 초기화 (다음 계정 로그인 시 오염 방지)
    useNotificationStore.getState().reset()

    localStorage.removeItem(SAVED_ID_KEY)
    set({ session: null, user: null, error: null })
  },

  // ─────────────────────────────────────────────
  // 저장된 아이디 관련 유틸
  // ─────────────────────────────────────────────
  getSavedId: () => localStorage.getItem(SAVED_ID_KEY),
  clearSavedId: () => localStorage.removeItem(SAVED_ID_KEY),
  clearError: () => set({ error: null }),

  // ─────────────────────────────────────────────
  // 권한 체크 헬퍼 (관리자·소장·주임 여부)
  // ─────────────────────────────────────────────
  isManager: () => {
    const role = get().user?.role
    return role === 'admin' || role === 'manager' || role === 'supervisor'
  },

  // ─────────────────────────────────────────────
  // 내 정보 수정 후 로컬 상태 갱신
  // ─────────────────────────────────────────────
  refreshProfile: async () => {
    const userId = get().user?.id
    if (!userId) return
    const profile = await get()._fetchProfile(userId)
    if (profile) set({ user: profile })
  },
}))

export default useAuthStore
