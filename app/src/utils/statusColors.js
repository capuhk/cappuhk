// ─────────────────────────────────────────────
// 인스펙션 상태 컬러 팔레트
// DB color 필드값 → Tailwind 클래스 매핑
// ─────────────────────────────────────────────

// badge: 목록/상세에서 상태 뱃지
// btn:   폼에서 상태 선택 버튼 (활성 시)
// swatch: 설정에서 색상 선택 스왓치 배경
export const STATUS_COLOR_MAP = {
  emerald: {
    badge:  'bg-emerald-500/20 text-emerald-400',
    btn:    'bg-emerald-500 text-white',
    swatch: 'bg-emerald-500',
  },
  blue: {
    badge:  'bg-blue-500/20 text-blue-400',
    btn:    'bg-blue-500 text-white',
    swatch: 'bg-blue-500',
  },
  yellow: {
    badge:  'bg-yellow-500/20 text-yellow-400',
    btn:    'bg-yellow-500 text-zinc-900',
    swatch: 'bg-yellow-500',
  },
  orange: {
    badge:  'bg-orange-500/20 text-orange-400',
    btn:    'bg-orange-500 text-white',
    swatch: 'bg-orange-500',
  },
  red: {
    badge:  'bg-red-500/20 text-red-400',
    btn:    'bg-red-500 text-white',
    swatch: 'bg-red-500',
  },
  purple: {
    badge:  'bg-purple-500/20 text-purple-400',
    btn:    'bg-purple-500 text-white',
    swatch: 'bg-purple-500',
  },
  zinc: {
    badge:  'bg-zinc-500/20 text-zinc-400',
    btn:    'bg-zinc-500 text-white',
    swatch: 'bg-zinc-500',
  },
}

// 사용 가능한 색상 목록 (설정 UI에서 순서대로 표시)
export const COLOR_OPTIONS = ['emerald', 'blue', 'yellow', 'orange', 'red', 'purple', 'zinc']

// 상태 배열에서 name → badge 클래스 조회
export const getBadgeClass = (statuses, name) => {
  const s = statuses.find((s) => s.name === name)
  return STATUS_COLOR_MAP[s?.color]?.badge ?? 'bg-zinc-500/20 text-zinc-400'
}

// 상태 배열에서 name → btn 클래스 조회
export const getBtnClass = (statuses, name) => {
  const s = statuses.find((s) => s.name === name)
  return STATUS_COLOR_MAP[s?.color]?.btn ?? 'bg-zinc-500 text-white'
}
