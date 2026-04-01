import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 환경변수가 설정되지 않았습니다.')
}

// Supabase 클라이언트 인스턴스 (앱 전체에서 공유)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 브라우저 localStorage에 세션 자동 저장
    persistSession: true,
    autoRefreshToken: true,
  },
})
