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
  // try-catch-finally로 네트워크 hang 시에도 loading: false 보장
  // ─────────────────────────────────────────────
  init: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        const profile = await get()._fetchProfile(session.user.id)
        set({ session, user: profile })
      }
    } catch (err) {
      console.error('세션 초기화 오류:', err)
    } finally {
      // 성공·실패·타임아웃 무관하게 반드시 loading 해제
      set({ loading: false })
    }

    // 세션 변경(로그인/로그아웃/토큰갱신) 실시간 구독
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const profile = await get()._fetchProfile(session.user.id)
        set({ session, user: profile })
      } else {
        set({ session: null, user: null })
      }
    })
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
