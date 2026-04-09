import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { clearAllCache, getMasterData, CACHE_KEYS } from '../utils/masterCache'
import useNotificationStore from './useNotificationStore'

// localStorage 키: 재진입 시 아이디 자동완성
const SAVED_ID_KEY = 'hk_saved_id'

// Supabase URL (텔레그램 자동 로그인 Edge Function 호출용)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// 이메일 형식 여부 판별 (관리자 vs 일반직원 구분)
const isEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)

const useAuthStore = create((set, get) => ({
  user: null,             // users 테이블 프로필 (id, name, email, role, ...)
  session: null,          // Supabase 세션 객체
  loading: true,          // 앱 첫 로드 시 세션 복원 중 여부
  error: null,            // 로그인 에러 메시지
  noticeReadRoles: null,  // 게시판 접근 허용 역할 (null = 아직 로드 안 됨)

  // ─────────────────────────────────────────────
  // 앱 시작 시 호출 — 기존 세션 복원 + 세션 변경 구독
  //
  // INITIAL_SESSION 이벤트 방식 대신 getSession() 직접 호출:
  //   onAuthStateChange의 INITIAL_SESSION은 내부적으로 토큰 갱신 네트워크 요청 가능
  //   → iOS 백그라운드 복귀 시 네트워크 미준비 → hanging → 무한스피너
  //
  //   getSession()은 valid token이면 localStorage에서 즉시 반환 (네트워크 불필요)
  //   → loading: false가 수십 ms 내 해제
  //
  // 3초 안전장치: getSession()도 hanging 시 강제 해제
  // ─────────────────────────────────────────────
  init: () => {
    // 3초 안전장치
    const timer = setTimeout(() => set({ loading: false }), 3000)

    // getSession()으로 즉시 세션 복원 — valid token이면 네트워크 불필요
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        clearTimeout(timer)

        // 기존 세션 없고 텔레그램 미니앱 환경이면 자동 로그인 시도
        if (!session) {
          const initData = sessionStorage.getItem('tg_init_data')
          if (initData) {
            try {
              const res = await fetch(
                `${SUPABASE_URL}/functions/v1/telegram-auth`,
                {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({ initData }),
                },
              )
              const json = await res.json()
              if (json.status === 'ok' && json.token_hash) {
                // magiclink 토큰으로 세션 획득
                const { data: otpData } = await supabase.auth.verifyOtp({
                  token_hash: json.token_hash,
                  type:       'email',
                })
                if (otpData?.session) {
                  session = otpData.session
                }
              }
              // status === 'not_linked' → 기존 PIN 로그인으로 진행
            } catch {
              // 텔레그램 자동 로그인 실패 → PIN 로그인으로 fallback
            }
          }
        }

        if (session) set({ session })
        set({ loading: false })
        // 프로필 + 게시판 접근 정책 백그라운드 로드 (loading 해제 후 별도 진행)
        if (session) {
          get()._fetchProfile(session.user.id).then(profile => {
            if (profile) set({ user: profile })
          })
          // 게시판 접근 허용 역할 — masterCache 활용 (24h 캐시)
          getMasterData(CACHE_KEYS.appPolicies).then((policies) => {
            const found = (policies || []).find((p) => p.key === 'notice_read_roles')
            try {
              const roles = JSON.parse(found?.value || '[]')
              set({ noticeReadRoles: roles })
            } catch {
              set({ noticeReadRoles: [] })
            }
          }).catch(() => set({ noticeReadRoles: [] }))
        }
      })
      .catch(() => {
        // getSession 실패 (토큰 만료 + 갱신 오류 등) → 세션 없이 진행
        clearTimeout(timer)
        set({ loading: false })
      })

    // TOKEN_REFRESHED, SIGNED_OUT만 구독 — INITIAL_SESSION/SIGNED_IN은 위에서 처리
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED') {
          if (session) {
            // 토큰 갱신 성공 — 세션 업데이트
            set({ session })
          } else {
            // 토큰 갱신 실패 — 세션 만료 처리
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
        .select('id, name, email, role, avatar_url, is_locked, is_active, push_room_order, push_facility_order, push_common_order, telegram_id, telegram_chat_id')
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

    // 게시판 접근 정책 로드 (로그인 직후 SideMenu/Router에서 즉시 사용)
    getMasterData(CACHE_KEYS.appPolicies).then((policies) => {
      const found = (policies || []).find((p) => p.key === 'notice_read_roles')
      try {
        const roles = JSON.parse(found?.value || '[]')
        set({ noticeReadRoles: roles })
      } catch {
        set({ noticeReadRoles: [] })
      }
    }).catch(() => set({ noticeReadRoles: [] }))

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
    set({ session: null, user: null, error: null, noticeReadRoles: null })
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
