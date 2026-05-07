// 역할 기반 권한 상수 — 이 파일을 단일 출처(source of truth)로 사용
// 역할이 추가되면 여기만 수정하면 전체 앱에 반영됨

// 관리자 그룹 (소장·주임 포함)
export const MANAGER_ROLES = ['admin', 'manager', 'supervisor']

// 시설 오더를 등록/접수할 수 있는 역할
export const FACILITY_ORDER_ROLES = ['admin', 'manager', 'supervisor', 'facility', 'houseman', 'front']

// 인스펙션/객실하자를 등록할 수 있는 역할
export const INSPECTION_ROLES = ['admin', 'manager', 'supervisor', 'maid']

// 역할이 관리자 그룹에 속하는지 확인
export const isManager = (role) => MANAGER_ROLES.includes(role)

// 역할이 시설 오더 담당자인지 확인 (facility 역할: 접수/완료 가능, 삭제 불가)
export const isFacilityRole = (role) => role === 'facility'
