# 하우스키핑 v3 (HK2) 앱 설계서

> 최종 업데이트: 2026-05-14  
> 버전: v4.15  
> 작성: Claude Sonnet 4.6 기반 자동 분석

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [역할 및 권한](#3-역할-및-권한)
4. [페이지 구조 및 라우팅](#4-페이지-구조-및-라우팅)
5. [핵심 기능 설명](#5-핵심-기능-설명)
6. [데이터베이스 스키마](#6-데이터베이스-스키마)
7. [이미지 처리](#7-이미지-처리)
8. [알림 시스템](#8-알림-시스템)
9. [WINGS PMS 연동](#9-wings-pms-연동)
10. [배포 구성](#10-배포-구성)
11. [환경 변수 목록](#11-환경-변수-목록)
12. [주요 아키텍처 패턴](#12-주요-아키텍처-패턴)
13. [⚠️ 주의사항 및 알려진 제약](#13-️-주의사항-및-알려진-제약)

---

## 1. 프로젝트 개요

호텔 하우스키핑 현장 업무를 모바일로 관리하는 **PWA(Progressive Web App)**. iOS Safari, Android Chrome, PC 브라우저, Telegram Mini App 환경을 동시 지원한다.

| 항목 | 내용 |
|------|------|
| 프로젝트명 | 하우스키핑 v3 (cappuhk) |
| 레포지토리 | https://github.com/capuhk/cappuhk |
| 프로덕션 URL | https://cappuhk-ecru.vercel.app |
| 배포 플랫폼 | Vercel (GitHub push → 자동 배포) |
| 백엔드 | Supabase Free Plan |
| 푸시 | Firebase FCM |

---

## 2. 기술 스택

### 프론트엔드

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| React | 19.2.4 | UI 프레임워크 |
| React Router | 7.13.2 | SPA 라우팅 |
| Vite | 7.x | 빌드 툴 |
| Tailwind CSS | 4.2.2 | 스타일링 |
| Zustand | 5.0.12 | 전역 상태 관리 |
| Supabase JS | 2.100.1 | DB/Auth/Storage 클라이언트 |
| Firebase | 12.11.0 | FCM 푸시 알림 |
| dayjs | 1.11.20 | 날짜 처리 (한국어 locale) |
| lucide-react | 1.7.0 | 아이콘 |
| recharts | 3.8.1 | 대시보드 차트 |
| xlsx | 0.18.5 | Excel 내보내기 |
| vite-plugin-pwa | 1.2.0 | Service Worker / PWA |

### 백엔드 (Supabase)

- PostgreSQL 데이터베이스
- Row Level Security (RLS)
- Storage (5개 버킷)
- Edge Functions (푸시 발송, 이미지 자동삭제)
- Auth (이메일/비밀번호 방식)

---

## 3. 역할 및 권한

### 역할 목록

| 역할 코드 | 한국어 | 기본 홈 | 그룹 |
|-----------|--------|---------|------|
| `admin` | 관리자 | `/inspection` | 관리자 |
| `manager` | 소장 | `/inspection` | 관리자 |
| `supervisor` | 주임 | `/inspection` | 관리자 |
| `maid` | 메이드 | `/rooms` | 일반 |
| `facility` | 시설 | `/facility-order` | 일반 |
| `houseman` | 하우스맨 | `/facility-order` | 일반 |
| `front` | 프론트 | `/facility-order` | 일반 |

### 권한 그룹 (`permissions.js`)

```js
MANAGER_ROLES          = ['admin', 'manager', 'supervisor']
FACILITY_ORDER_ROLES   = ['admin', 'manager', 'supervisor', 'facility', 'houseman', 'front']
INSPECTION_ROLES       = ['admin', 'manager', 'supervisor', 'maid']
```

### 기능별 접근 제한

| 기능 | 접근 불가 역할 |
|------|--------------|
| 인스펙션 (목록·등록·수정·삭제) | maid, facility, houseman, front |
| 객실하자 (목록·등록·수정·삭제) | maid |
| 삭제 (인스펙션·하자·오더) | 관리자 그룹만 가능 |
| 공지사항 작성 | maid, facility, houseman, front |
| 설정 페이지 | houseman, front |
| 사용자 생성/수정 | 전체 접근 (단, 관리자만 이동 경로 존재) |
| 게시판(`/notice`) | `app_policies.notice_read_roles` 정책으로 동적 제어 |

---

## 4. 페이지 구조 및 라우팅

```
/login                        # PIN 로그인
/                             # 역할별 홈으로 리다이렉트

/inspection                   # 인스펙션 목록 (계층형 아코디언)
/inspection/new               # 등록
/inspection/:id               # 상세
/inspection/:id/edit          # 수정

/defect                       # 객실하자 목록
/defect/new                   # 등록
/defect/:id                   # 상세
/defect/:id/edit              # 수정

/facility-order               # 시설오더 목록 (계층형 아코디언)
/facility-order/new           # 등록
/facility-order/:id           # 상세
/facility-order/:id/edit      # 수정

/announcement                 # 공지사항 목록 (팝업 공지 — is_pinned=true)
/announcement/new             # 등록 (관리자 그룹만)
/announcement/:id             # 상세
/announcement/:id/edit        # 수정 (관리자 그룹만)

/notice                       # 게시판 (일반 공지 — is_pinned=false, 정책으로 접근 제어)
/notice/new                   # 등록
/notice/:id                   # 상세
/notice/:id/edit              # 수정

/rooms                        # 객실현황 (WINGS PMS 연동)
/staff                        # 직원 목록
/staff/:id                    # 직원 상세
/dashboard                    # 대시보드 (차트)
/inspection-review            # 인스펙션 현황 조회

/settings                     # 관리자 설정
/settings/users/new           # 사용자 생성
/settings/users/:id/edit      # 사용자 수정
```

---

## 5. 핵심 기능 설명

### 5-1. 인증 (LoginPage + useAuthStore)

- **PIN 로그인**: 이름 선택 → 숫자 키패드 PIN 입력 → `signInWithPassword(internal_email, pin)`
- **Telegram Mini App**: `tg_init_data` → Edge Function `telegram-auth` → `verifyOtp()`
- **세션 복원**: 앱 시작 시 `getSession()` 직접 호출 (localStorage 기반, 네트워크 불필요)
  - iOS PWA에서 5분 이상 백그라운드 후 토큰 갱신 hanging 문제 → 2분 이상 백그라운드 감지 시 강제 `reload()`
- **3초 안전장치**: 세션 로드 3초 초과 시 강제 로딩 해제 (무한 스피너 방지)

### 5-2. 인스펙션 (Inspection)

- **목록**: Phase 1 RPC (`get_inspection_date_counts`) → 날짜별 건수만 조회  
  Phase 2 → 날짜 아코디언 클릭 시 해당 날짜 레코드 로드 (dateCache로 중복 요청 방지)
- **계층형 아코디언**: 당월 → 날짜 목록 / 이전 달 → 월 아코디언 / 이전 연도 → 연도 > 월 아코디언
- **등록 폼**: sessionStorage 임시저장 (다른 페이지 이동 후 복귀 시 입력값 복원)
- **상태**: `app_policies.inspection_default_status` 정책으로 기본값 지정
- **시설 오더 연동**: 인스펙션 등록 시 "시설" 상태 + 체크박스 선택 → 시설오더 자동 생성 + 푸시 발송
- **검색**: 작성자명, 객실번호 검색 (limit 5,000 / 초과 시 경고 메시지)

### 5-3. 객실하자 (Defect)

- 구분 / 위치 / 하자분류 선택형 (마스터 데이터 기반)
- 이미지 영구 보관 (자동삭제 없음)
- 수동 삭제만 가능 (관리자 그룹)

### 5-4. 시설오더 (FacilityOrder)

- 오더 종류: 객실 / 시설 / 공용부
- 상태 흐름: `접수대기` → `처리중` → `완료` / `이관`
- **접수**: facility·houseman·front·관리자 그룹 → 처리중으로 변경 + 접수자 기록
- **완료**: 접수자 본인 또는 관리자 그룹
- **이관**: 관리자 그룹 → 시설오더를 객실하자로 전환 (RPC `move_facility_to_defect_v1`)
  - 이미지 복사: `thumb-facility-orders` 버킷 → `thumb-defects` 버킷
- **리마크**: 채팅 형태 메모 (작성자 본인 또는 관리자 삭제 가능)
- **긴급 뱃지**: `is_urgent=true` 시 🚨 표시
- 계층형 아코디언 + 검색 구조는 인스펙션과 동일

### 5-5. 공지 시스템 (두 종류)

| 구분 | 경로 | is_pinned | 팝업 | 뱃지 | 푸시 |
|------|------|-----------|------|------|------|
| 공지사항(팝업공지) | `/announcement` | `true` | ✅ | ✅ | ✅ |
| 게시판 | `/notice` | `false` | ❌ | ❌ | ❌ |

**팝업 공지 동작 흐름:**
1. 관리자가 `/announcement/new`에서 공지 작성 → `is_pinned=true` 저장 + 대상 역할에 푸시
2. 다른 사용자 앱 진입 시 `NoticePopup` → `is_pinned=true` 미확인 공지 조회
3. 팝업 "확인" 클릭 → `notification_reads`에 `popup_notice_X` + `notice_X` 동시 저장 (뱃지 해소)
4. 다음 앱 진입 시 팝업 및 뱃지 모두 사라짐

### 5-6. 객실현황 (RoomDashboard)

- WINGS PMS scraper가 `rooms` 테이블에 upsert → 앱이 폴링 조회
- 초기 전체 로드 → 30초마다 delta 폴링 (`updated_at > lastFetchAt`)
- 대부분 0건 반환 (변경 없을 때) → DB/네트워크 부하 최소화
- 필터: 층별, 상태별(다중), BK(예약), NG(청소중), 텍스트 검색

**WINGS 객실 상태 코드:**

| 코드 | 의미 |
|------|------|
| VD | 빈방/미청소 |
| VI | 빈방/점검완료 |
| VC | 빈방/청소완료 |
| OO | 사용불가 |
| OC | 투숙/청소완료 |
| OD | 투숙/미청소 |
| OI | 투숙/점검완료 |

---

## 6. 데이터베이스 스키마

### 핵심 테이블

#### `users`
```
id              uuid (PK, auth.users FK)
name            text
role            text  -- admin|manager|supervisor|maid|facility|houseman|front
internal_email  text  -- 로그인용 내부 이메일
avatar_url      text
telegram_id     text
push_enabled    bool  -- 오더 종류별 알림 ON/OFF
notif_last_read_at  timestamptz  -- 알림 드로어 마지막 닫은 시각
```

#### `rooms` (WINGS 동기화)
```
room_no         text (PK)
floor_code      text
room_type_code  text
room_sts_text   text  -- 객실 상태 코드 (VD/VI/VC/OO/OC/OD/OI)
room_status     text
inroom_status   text
clean_sts_text  text  -- 청소 상태 (NG=청소중, OR=청소전)
arrv_date       date
dept_date       date
nights          int
balance_amt     int
updated_at      timestamptz (트리거 자동 갱신)
```

#### `inspections`
```
id              uuid (PK)
room_no         text
status          text  -- inspection_statuses 참조
note            text
author_id       uuid (users FK)
updated_by      uuid (users FK)
facility_order_id uuid (facility_orders FK, nullable)
work_date       date
created_at      timestamptz
```

#### `inspection_images`
```
id              uuid (PK)
inspection_id   uuid (inspections FK, CASCADE DELETE)
thumb_path      text  -- Storage 경로 (thumb-inspections 버킷)
sort_order      int
```

#### `defects`
```
id              uuid (PK)
room_no         text
division        text  -- 구분 (스냅샷)
location        text  -- 위치 쉼표 구분 (스냅샷)
category        text  -- 하자분류 (스냅샷)
status          text  -- 미완료|처리중|완료
memo            text
author_id       uuid
updated_by      uuid
work_date       date
created_at      timestamptz
```

#### `facility_orders`
```
id                  uuid (PK)
room_no             text
location_type       text  -- 객실|시설|공용부
facility_type_id    uuid (facility_types FK)
facility_type_name  text  -- 스냅샷
note                text
status              text  -- 접수대기|처리중|완료|이관
is_urgent           bool
author_id           uuid
accepted_by         uuid
updated_by          uuid
completed_at        timestamptz
work_date           date
created_at          timestamptz
```

#### `facility_order_remarks`
```
id                  uuid (PK)
facility_order_id   uuid (facility_orders FK, CASCADE DELETE)
author_id           uuid (users FK)
content             text
created_at          timestamptz
```

#### `notices`
```
id            uuid (PK)
is_pinned     bool  -- true: 팝업공지(/announcement), false: 게시판(/notice)
title         text
content       text
target_roles  text[]  -- 빈 배열 = 전체 공개
author_id     uuid
updated_by    uuid
created_at    timestamptz
```

#### `notification_reads`
```
user_id   uuid
item_id   text  -- popup_notice_X | notice_X | fo_X_접수대기 | fo_X_완료
UNIQUE(user_id, item_id)
```

#### `app_policies`
```
key    text (PK)
value  text (JSON 또는 단순 문자열)
```

**주요 정책 키:**

| 키 | 값 예시 | 설명 |
|----|---------|------|
| `inspection_default_status` | `"청소완료"` | 인스펙션 기본 상태 |
| `daily_reset_hour` | `"6"` | 이 시각 이전이면 전날로 처리 |
| `notice_read_roles` | `["admin","manager","supervisor"]` | 게시판 읽기 허용 역할 |
| `notice_write_roles` | `["admin","manager"]` | 게시판 쓰기 허용 역할 |
| `hotel_name` | `"카푸치노"` | 로그인 화면 표시명 |
| `login_logo_url` | `"https://..."` | 로그인 로고 URL |

### 마스터 테이블

| 테이블 | 용도 |
|--------|------|
| `inspection_statuses` | 인스펙션 상태 목록 + 색상 |
| `room_master` | 층/객실 마스터 |
| `defect_divisions` | 하자 구분 목록 |
| `defect_locations` | 위치 목록 (division_id FK) |
| `defect_categories` | 하자분류 목록 |
| `facility_types` | 시설오더 종류 목록 |

### Storage 버킷

| 버킷명 | 공개 여부 | 자동삭제 | 리사이징 |
|--------|----------|---------|---------|
| `thumb-inspections` | Private | 20일 | 1600px, 75% |
| `thumb-defects` | Private | 없음 (영구) | 800px, 70% |
| `thumb-facility-orders` | Private | 60일 | 300px, 70% |
| `thumb-notices` | Private | 없음 | 300px, 70% |
| `avatars` | **Public** | 없음 | 300px, 80% |

---

## 7. 이미지 처리

### 업로드 흐름

```
카메라/갤러리 선택 → Canvas API 리사이징 → JPEG 변환 → Supabase Storage 업로드 → thumb_path(경로) DB 저장
```

### 표시 흐름

```
DB에서 thumb_path 배열 로드 → createSignedUrls(24시간) → img src에 적용
```

- Signed URL 만료 후: `null` 반환 → UI에 "이미지 만료" 표시
- 아바타: Public 버킷 → Signed URL 불필요, `?t={timestamp}` 캐시 버스터 사용

### 이미지 자동삭제 (Edge Function + pg_cron)

- `thumb-inspections`: 20일 경과 이미지 삭제
- `thumb-facility-orders`: 60일 경과 이미지 삭제
- Storage 삭제 실패 시 DB 삭제는 계속 진행 (toast 경고 표시)
- 고아 파일은 다음 자동삭제 사이클에서 처리

---

## 8. 알림 시스템

### 뱃지 카운트 계산 (`useNotificationStore._refreshBadge`)

1. `users.notif_last_read_at` 조회 (NULL이면 now()로 초기화 → 뱃지 0)
2. `notification_reads` 조회 → 개별 읽음 항목 Set
3. `is_pinned=true` 공지 중 `created_at > lastReadAt` + `notice_X` 미읽음 → 카운트
4. 관리자: `접수대기` + `완료` 시설오더 중 `updated_at > lastReadAt` + 미읽음 → 카운트

### 뱃지 초기화 방법

- **드로어 닫기**: `notif_last_read_at = now()` 갱신 → 모든 이전 알림 뱃지 0
- **팝업 확인**: `popup_notice_X` + `notice_X` 동시 저장 → 해당 공지 뱃지 즉시 해소

### 푸시 알림 (FCM)

- `sendPush({ roles, title, body, url, orderType })` → Edge Function 호출
- Fire & Forget (응답 대기 없음)
- `push_enabled` 및 `orderType` 기반 필터링 (시설·객실·공용부 알림 개별 ON/OFF)
- 수신: Service Worker → `notificationclick` → `url`로 이동

### 알림 항목 유형별 item_id

| 항목 | item_id 형식 |
|------|-------------|
| 팝업 공지 (확인 방지용) | `popup_notice_{uuid}` |
| 공지 (뱃지 해소용) | `notice_{uuid}` |
| 시설오더 접수대기 | `fo_{uuid}_접수대기` |
| 시설오더 완료 | `fo_{uuid}_완료` |

---

## 9. WINGS PMS 연동

별도 문서 참조: [wings_scraper_가이드.md](./wings_scraper_가이드.md)

**연동 방식 요약:**
- Windows PC에서 Python 스크래퍼 상시 실행
- WINGS Room Indicator API POST 요청 캡처 후 주기적 재실행
- 응답 JSON → `rooms` 테이블 upsert (room_no 기준)
- 앱은 30초 delta 폴링으로 변경분만 조회

---

## 10. 배포 구성

```
GitHub (capuhk/cappuhk)
    │
    └─ push to master
            │
            ▼
     Vercel CI/CD
     (자동 빌드 + 배포, 약 1~2분)
            │
            ▼
   https://cappuhk-ecru.vercel.app
```

**배포 시 주의:**
- `app/` 서브디렉토리에 Vite 프로젝트 위치
- Vercel 루트 디렉토리 설정: `app`
- `npx vercel --prod` CLI 직접 실행 금지 (잘못된 프로젝트에 배포될 수 있음)
- `.env.local` 파일은 Vercel 환경 변수 대시보드에 별도 등록 필요

---

## 11. 환경 변수 목록

### 앱 (`app/.env.local`)

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FCM_VAPID_KEY=
```

### 스크래퍼 (`wings_scraper/.env`)

```env
WINGS_URL=
WINGS_LOGIN_URL=
WINGS_COMPANY_ID=
WINGS_ID=
WINGS_PW=
PROPERTY_NO=
BSNS_CODE=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=      # Service Role Key (RLS 우회)
SCRAPE_INTERVAL=300        # 수집 간격(초), 기본 5분
SCRAPE_HOUR_START=6
SCRAPE_MINUTE_START=30
SCRAPE_HOUR_END=22
SCRAPE_MINUTE_END=30
```

---

## 12. 주요 아키텍처 패턴

### 마스터 데이터 캐시 (`masterCache.js`)

- TTL: 24시간 (localStorage 저장)
- 앱 시작 시 캐시 우선 사용 → 오프라인에서도 폼 즉시 열림
- 캐시 만료 후 첫 요청에서만 Supabase fetch
- `clearAllCache()` 로그아웃 시 강제 초기화 (계정 오염 방지)

### 네트워크 저장 래퍼 (`networkSave.js`)

- 타임아웃: 8초
- 초과 시 `isTimeout: true` 에러 throw
- 호출부에서 `if (!err?.isTimeout)` 조건으로 타임아웃과 실제 오류 구분

### Pull-to-Refresh (`usePullToRefresh.js`)

- 터치 저항감 포함 (50px threshold)
- 새로고침 트리거 → `useRefreshStore.trigger()` → 구독 컴포넌트 자동 재조회

### 2-Phase 데이터 로딩 (인스펙션·시설오더 목록)

```
Phase 1: RPC로 날짜별 건수만 조회 (경량, 1000건 이상도 문제없음)
    ↓ 아코디언 클릭
Phase 2: 해당 날짜 레코드 조회 (dateCache로 중복 요청 방지)
```

### 인라인 삭제 확인 UI

`window.confirm` 대신 컴포넌트 내 `confirmDelete` state로 두 단계 확인:
1. 삭제 버튼 클릭 → 빨간 확인 영역 표시 + 취소/삭제 버튼
2. 삭제 버튼 클릭 → 실제 삭제 실행

---

## 13. ⚠️ 주의사항 및 알려진 제약

### Supabase Free Plan 한도

| 항목 | 한도 | 현재 상태 |
|------|------|----------|
| DB 용량 | 500 MB | 모니터링 필요 |
| Storage | 1 GB | 자동삭제로 관리 중 |
| Bandwidth | 10 GB/월 | 이미지 리사이징으로 최소화 |
| MAU | 50,000 | 단일 호텔 운영 시 문제없음 |
| Edge Function 호출 | 500,000/월 | 푸시 발송 빈도 주의 |

### iOS PWA 관련

- **백그라운드 토큰 갱신 Hanging**: iOS Safari는 5분 이상 백그라운드 후 토큰 갱신 fetch가 멈추는 현상 발생
  - 해결: `App.jsx`에서 2분 이상 백그라운드 감지 시 `window.location.reload()` 강제 실행
  - localStorage 세션 유지로 재로그인 없이 자동 복원
- **카메라 전용 입력**: `InspectionFormPage`의 `ImageUploader`는 `cameraOnly=true` (사진첩 선택 불가)

### 검색 한도

- 인스펙션 검색: 최대 5,000건 (초과 시 경고 메시지 표시)
- 시설오더·객실하자 검색: 의도적으로 제한 없음 (건수가 적음)
- Phase 1 RPC는 날짜별 집계이므로 건수 제한 없음

### 이미지 Signed URL 만료

- 유효기간: 24시간
- 만료 후 재방문 시 "이미지 만료" 표시
- 재생성 방법: 페이지 재진입 (useImageUrls 훅이 자동 재요청)

### 공지 팝업 작동 조건

- **`/announcement`에서 작성한 공지만 팝업 발생** (`is_pinned=true`)
- `/notice` 게시판 공지는 팝업 없음
- 팝업 미표시 시 설정 확인: Settings → app_policies → `notice_read_roles`

### Storage 삭제 실패

- DB 삭제는 계속 진행 (고아 파일 발생 가능)
- Edge Function 자동삭제 주기에서 정리됨 (inspections: 20일, facility_orders: 60일)
- `thumb-defects`는 자동삭제 없음 — 수동 삭제 또는 Supabase 대시보드에서 정리 필요

### WINGS 스크래퍼

- **Windows PC 상시 실행 필수** — 앱 서버 아님, 별도 PC에서 독립 실행
- `captured_request.json` 삭제 시 재설정 필요 (최초 수동 캡처 다시 진행)
- WINGS 시스템 업데이트 시 POST body 구조 변경 가능 → `captured_request.json` 재캡처 필요
- 운영 시간(기본 06:30~22:30) 외 자동 대기

### 데이터 스냅샷 정책

마스터 데이터(위치, 구분, 시설유형 등)가 변경되어도 기존 기록은 등록 시점 값 유지:
- `defects.division`, `defects.location`, `defects.category` → 등록 시 텍스트 직접 저장
- `facility_orders.facility_type_name` → 등록 시 텍스트 직접 저장

### 역할별 홈 경로

역할 변경 후 앱 재진입 시 자동 적용됨. 단, 현재 세션이 살아있으면 기존 경로에 머뭄 → 직접 이동 필요.

---

*이 설계서는 Claude Code가 소스코드를 직접 분석해 생성했습니다. 코드 변경 시 관련 섹션을 함께 업데이트하세요.*
