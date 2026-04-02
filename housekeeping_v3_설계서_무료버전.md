# 하우스키핑 v3 — 설계서 v3 무료버전

> **작성일**: 2026-03-26
> **최종 업데이트**: 2026-04-02 (모바일 UX 고도화 + Vercel 배포 완료)
> **버전**: v4.0 (v3.9 + 모바일 UX·배포·pull-to-refresh·무한스피닝 수정)
> **플랫폼**: PWA (iOS Safari + Android Chrome + PC 웹)  
> **백엔드**: Supabase Free Plan (PostgreSQL + Storage + Auth)

---

## Supabase 무료 플랜 제약 및 대응

| 항목 | 무료 한도 | 예상 사용량 | 대응 전략 |
|------|:--------:|:---------:|---------|
| 스토리지 | 1 GB | ~287 MB (초기) | 해상도 최적화 + 자동삭제 |
| Bandwidth | 10 GB/월 | ~3.7 GB/월 | 썸네일 우선 로드 |
| DB 용량 | 500 MB | ~50 MB | 문제 없음 |
| MAU | 50,000 | 3명 | 문제 없음 |
| 프로젝트 정지 | 7일 비활성 | 매일 사용 | 문제 없음 |

> ⚠️ **객실하자 영구 보관** — 하루 등록량에 따라 장기적으로 스토리지 증가  
> 하루 3장 기준 약 5년 후 1GB 초과 예상 → 그 시점에 Pro($25/월) 전환

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [권한 체계](#3-권한-체계)
4. [반응형 레이아웃 전략](#4-반응형-레이아웃-전략)
5. [로그인 / 인증 흐름](#5-로그인--인증-흐름)
6. [전체 화면 구조 (IA)](#6-전체-화면-구조-ia)
7. [사이드 메뉴](#7-사이드-메뉴)
8. [FAB 동작 정의](#8-fab-동작-정의)
9. [객실번호 픽커 UI](#9-객실번호-픽커-ui)
10. [이미지 업로드 / 스토리지 정책](#10-이미지-업로드--스토리지-정책)
11. [최종 변경자 정책](#11-최종-변경자-정책)
12. [화면별 기능 명세](#12-화면별-기능-명세)
13. [출력 기능 명세](#13-출력-기능-명세)
14. [푸시 알림 명세](#14-푸시-알림-명세)
15. [데이터 모델 / DB 설계](#15-데이터-모델--db-설계)
16. [마스터 데이터 캐싱 전략](#16-마스터-데이터-캐싱-전략)
17. [API 설계](#17-api-설계)
18. [개발 우선순위 로드맵](#18-개발-우선순위-로드맵)
19. [전체 URL 라우팅](#19-전체-url-라우팅)

---

## 1. 프로젝트 개요

### 1.1 서비스 목적
호텔 하우스키핑 직원(메이드·주임·소장·시설팀)이  
스마트폰 또는 PC에서 **객실 인스펙션·하자·시설오더를 기록하고 관리**하는 업무용 PWA 앱

### 1.2 핵심 가치

| 가치 | 설명 |
|------|------|
| 앱스토어 불필요 | PWA — 링크 하나로 iPhone·Android·PC 모두 사용 |
| 오프라인 대응 | Service Worker 캐싱으로 네트워크 불안정 환경 대응 |
| 빠른 등록 | 탭별 FAB 1탭으로 즉시 등록 화면 진입 |
| 권한 기반 제어 | 역할에 따라 보이는 메뉴·버튼 자동 조정 |
| 트래픽 최적화 | 썸네일 우선 로드, 원본 버킷 미사용 |
| 무료 운영 | Supabase 무료 플랜으로 장기 운영 가능 |

---

## 2. 기술 스택

| 분류 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | React 18 + Vite | PWA 빌드 최적화 |
| UI | Tailwind CSS + shadcn/ui | 다크 테마 기본 |
| 상태 관리 | Zustand | 경량 전역 상태 |
| 라우팅 | React Router v6 | SPA 라우팅 |
| 차트 | Recharts | 통계/대시보드 |
| 엑셀 출력 | SheetJS (xlsx) | 클라이언트 사이드 |
| PDF 출력 | window.print() + @media print | 별도 라이브러리 불필요 |
| 이미지 처리 | Canvas API (브라우저 내장) | 리사이징·압축 |
| PWA | vite-plugin-pwa | manifest + Service Worker |
| 백엔드/DB | Supabase Free Plan (PostgreSQL) | RLS 정책 포함 |
| 스토리지 | Supabase Storage (무료 1GB) | Private 버킷 4개 + Signed URL |
| 자동삭제 | Supabase Edge Function + Cron | 인스펙션 20일 / 시설오더 60일 (Storage만 삭제, DB 레코드 유지) |
| 푸시 알림 | Web Push API + VAPID | Supabase Edge Function |
| 날짜/시간 | dayjs + dayjs-timezone | KST 기준 처리 |
| 배포 | Vercel | HTTPS 자동 제공 |

> **Next.js 미채택**: PWA + 오프라인 + 모바일 최적화가 핵심. SSR/SEO 이점 없음.  
> Vite가 PWA Service Worker 제어 및 빌드 속도에서 유리.

---

## 3. 권한 체계

### 3.1 권한 등급

| 역할 코드 | 역할명 | 비고 |
|-----------|--------|------|
| `admin` | 관리자 | 소장·주임과 완전 동일 권한 |
| `manager` | 소장 | 관리자·주임과 완전 동일 권한 |
| `supervisor` | 주임 | 관리자·소장과 완전 동일 권한 |
| `maid` | 메이드 | |
| `facility` | 시설 | |

> **관리자(admin) = 소장(manager) = 주임(supervisor)** 완전 동일 권한

### 3.2 계정 구조

| 구분 | 관리자(최초 1명) | 일반 직원 |
|------|:--------------:|:--------:|
| 아이디 | 이메일 형식 | 한글 포함 자유 텍스트(이름) |
| 비밀번호 | 숫자 4자리 PIN | 숫자 4자리 PIN |
| 계정 생성 | Supabase 대시보드에서 직접 생성 | 관리자·소장·주임이 앱에서 등록 |
| 내부 처리 | 이메일 그대로 사용 | `{uuid}@hk.internal` 로 자동 변환 (사용자 비노출) |

- **계정 생성**: 관리자·소장·주임만 가능 (Edge Function 경유)
- **재진입**: 첫 로그인 후 아이디 저장 → 이후 PIN 4자리만 입력
- **PIN 설정**: Supabase Auth 최소 비밀번호 길이를 4자리로 설정 필요 (대시보드 1회 설정)

### 3.3 기능별 권한 매트릭스

> 관리자·소장·주임 완전 동일 권한

| 기능 | 관리자·소장·주임 | 메이드 | 시설 |
|------|:--------------:|:------:|:----:|
| 사용자 등록/권한 부여 | ✅ | ❌ | ❌ |
| 인스펙션 등록 | ✅ | ✅ | ❌ |
| 인스펙션 전체 조회 | ✅ | 본인만 | ❌ |
| 인스펙션 삭제 | ✅ | ❌ | ❌ |
| 객실하자 등록 | ✅ | ✅ | ❌ |
| 객실하자 완료 처리 | ✅ | ❌ | ❌ |
| 객실하자 삭제 | ✅ | ❌ | ❌ |
| 시설오더 등록 | ✅ | ❌ | ✅ |
| 시설오더 완료 처리 | ✅ | ❌ | ✅ |
| 인스펙션조회 | ✅ | ❌ | ❌ |
| 게시판 등록/수정/삭제 | ✅ | ❌ | ❌ |
| 게시판 조회 | ✅ | ✅ | ✅ |
| 구분/위치/하자분류 관리 | ✅ | ❌ | ❌ |
| 통계/대시보드 | ✅ | ❌ | ❌ |
| PDF / 엑셀 출력 | ✅ | ❌ | ✅ |
| 설정 - 사용자 관리 | ✅ | ❌ | ❌ |
| 설정 - 본인 정보 수정 | ✅ | ✅ | ✅ |
| 층/객실 마스터 관리 | ✅ | ❌ | ❌ |

---

## 4. 반응형 레이아웃 전략

### 4.1 브레이크포인트

| 구간 | 범위 | 레이아웃 |
|------|------|----------|
| 모바일 (sm) | 360px ~ 767px | 전체 너비 단일 컬럼, 하단 탭 네비게이션 |
| 태블릿 (md) | 768px ~ 1279px | 중앙 정렬 카드형 (최대 680px), 하단 탭 유지 |
| PC (lg) | 1280px ~ | 좌측 사이드바 240px 고정 + 우측 메인 영역 |

### 4.2 PC 레이아웃

- 하단 탭바 숨김 → 사이드바로 네비게이션 대체
- 목록 클릭 시 우측에 상세 패널 오픈 (마스터-디테일)
- FAB은 메인 영역 우하단에 고정

### 4.3 공통 AppHeader 컴포넌트

모든 화면 상단에 고정 헤더 표시

```
[메인 탭 목록 화면]
┌──────────────────────────────────────┐
│ [ ≡ ]   인스펙션          [ 로그아웃 ] │
└──────────────────────────────────────┘

[하위 화면 (상세/폼/설정 등)]
┌──────────────────────────────────────┐
│ [ ← ]   인스펙션 등록     [ 로그아웃 ] │
└──────────────────────────────────────┘
```

| 위치 | 메인 탭 화면 | 하위 화면 |
|------|:-----------:|:--------:|
| 좌측 | ≡ 사이드메뉴 버튼 | ← 뒤로가기 버튼 |
| 중앙 | 화면 제목 | 화면 제목 |
| 우측 | 로그아웃 텍스트 버튼 | 로그아웃 텍스트 버튼 |

- 로그아웃 클릭 시 확인 없이 즉시 로그아웃 → localStorage 캐시 전체 삭제 → 로그인 화면 이동
- 기존 사이드메뉴 하단 로그아웃도 유지 (중복 제공)

---

## 5. 로그인 / 인증 흐름

### 5.1 인증 구조

| 구분 | 관리자(admin) | 일반 직원 |
|------|:------------:|:--------:|
| 로그인 아이디 | 이메일 | 한글 이름 |
| 내부 처리 | 이메일 그대로 | `{uuid}@hk.internal` 자동 변환 |
| 비밀번호 | PIN 4자리 | PIN 4자리 |
| 계정 생성 | 대시보드 직접 생성 | 관리자/소장/주임이 앱에서 등록 |

**로그인 내부 흐름 (일반 직원)**
```
이름 입력
→ users 테이블에서 name으로 internal_email 조회
→ supabase.auth.signInWithPassword({ email: internal_email, password: pin })
```

### 5.2 첫 로그인

```
앱 접속 → 세션 없음
  └→ 로그인 화면
      ├─ 아이디 입력 (관리자: 이메일 / 일반: 한글 이름)
      ├─ PIN 4자리 숫자 키패드 입력
      └→ 성공 시
          ├─ 아이디 localStorage 저장
          ├─ Supabase 세션 저장
          └→ 메인 화면 진입
```

### 5.3 재진입 (PIN 전용)

```
앱 재접속 → 저장된 아이디 있음
  └→ PIN 입력 화면
      ├─ 저장된 아이디 표시 (수정 불가)
      ├─ "다른 계정으로 로그인" 링크
      ├─ PIN 4자리 입력
      └→ 성공 시 메인 화면 진입
```

### 5.4 PIN 입력 UI

```
┌─────────────────────────┐
│   [호텔 로고]            │
│   안녕하세요, 홍길동님   │
│                          │
│      ● ● ● ○             │
│                          │
│  [ 1 ]  [ 2 ]  [ 3 ]    │
│  [ 4 ]  [ 5 ]  [ 6 ]    │
│  [ 7 ]  [ 8 ]  [ 9 ]    │
│  [삭제] [ 0 ]  [확인]    │
│                          │
│   다른 계정으로 로그인    │
└─────────────────────────┘
```

### 5.5 보안 정책

| 항목 | 내용 |
|------|------|
| PIN 실패 제한 | 5회 연속 실패 시 계정 잠금 |
| 잠금 해제 | 관리자·소장·주임만 가능 |
| 세션 유지 | Supabase JWT 자동 갱신 |
| PIN 최소 길이 | Supabase Dashboard > Authentication > Password > Minimum length = 4 (1회 설정) |

---

## 6. 전체 화면 구조 (IA)

### 6.1 하단 탭 네비게이션 (3탭)

```
탭1: 인스펙션
탭2: 객실하자
탭3: 시설오더
```

> 인스펙션조회는 퇴근 시 출력 용도 → 사이드메뉴로 이동

### 6.2 전체 IA

```
앱 진입
│
├── 로그인 화면
│
└── 메인 앱 (로그인 후)
    │
    ├── 하단 탭 (모바일·태블릿)
    │   ├── 탭1: 인스펙션
    │   ├── 탭2: 객실하자
    │   └── 탭3: 시설오더
    │
    ├── 사이드 메뉴
    │   ├── 인스펙션조회
    │   ├── 게시판
    │   ├── 직원목록
    │   ├── 통계/대시보드
    │   ├── 설정
    │   ├── About / Feedback / Share
    │   └── App Gallery / Add Shortcut
    │
    ├── 인스펙션
    │   ├── 목록 (날짜별 그룹 + All)
    │   ├── 날짜별 상세 목록
    │   ├── 등록 폼 (/inspection/new)
    │   ├── 상세 화면 (/inspection/:id)
    │   ├── 수정 폼 (/inspection/:id/edit)
    │   └── 설정 (/inspection/settings)
    │
    ├── 객실하자
    │   ├── 목록 (객실번호별 그룹 + All)
    │   ├── 객실별 하자 목록
    │   ├── 등록 폼 (/defect/new)
    │   ├── 상세 화면 (/defect/:id)
    │   ├── 수정 폼 (/defect/:id/edit)
    │   └── 설정 (/defect/settings)
    │       └── 구분관리 / 위치관리 / 하자분류관리
    │
    ├── 시설오더
    │   ├── 목록 (날짜별 그룹 + All)
    │   ├── 날짜별 상세 목록
    │   ├── 등록 폼 (/facility-order/new)
    │   ├── 상세 화면 (/facility-order/:id)
    │   ├── 수정 폼 (/facility-order/:id/edit)
    │   └── 설정 (/facility-order/settings)
    │
    ├── 인스펙션조회 (/inspection-review)
    ├── 게시판 (/notice)
    ├── 직원목록 (/staff)
    ├── 통계/대시보드 (/dashboard)
    └── 설정 (/settings)
```

---

## 7. 사이드 메뉴

### 7.1 메뉴 구조

```
┌─────────────────────────────┐
│ [CAPPUCCINO] 하우스키핑v3   │
├─────────────────────────────┤
│  📋  인스펙션조회        >  │  ← 관리자·소장·주임만
│  📚  게시판              >  │
│  👤  직원목록            >  │
│  📊  통계/대시보드       >  │  ← 관리자·소장·주임만
│  ⚙️  설정               >  │
├─────────────────────────────┤
│  [아바타] 이름/이메일 ▼     │
└─────────────────────────────┘
```

### 7.2 하단 계정 `▼` 클릭 시

```
┌─────────────────────┐
│ 내 정보 수정        │
│ 로그아웃            │
└─────────────────────┘
```

### 7.3 권한별 메뉴 표시

| 메뉴 | 관리자·소장·주임 | 메이드 | 시설 |
|------|:--------------:|:------:|:----:|
| 인스펙션조회 | ✅ | ❌ | ❌ |
| 게시판 | ✅ | ✅ | ✅ |
| 직원목록 | ✅ | ✅ | ✅ |
| 통계/대시보드 | ✅ | ❌ | ❌ |
| 설정 | ✅ | ✅ | ✅ |

---

## 8. FAB 동작 정의

| 현재 화면 | FAB 동작 | 이동 |
|----------|---------|------|
| 인스펙션 목록 | 인스펙션 등록 | `/inspection/new` |
| 인스펙션 날짜별 목록 | 인스펙션 등록 | `/inspection/new?date=today` |
| 객실하자 목록 | 하자 등록 | `/defect/new` |
| 객실하자 객실별 목록 | 하자 등록 (객실번호 자동) | `/defect/new?room=객실번호` |
| 시설오더 목록 | 시설오더 등록 | `/facility-order/new` |
| 시설오더 날짜별 목록 | 시설오더 등록 | `/facility-order/new?date=today` |
| 게시판 | 글 등록 (관리자·소장·주임만) | `/notice/new` |
| 직원목록 | 직원 등록 (관리자·소장·주임만) | `/settings/users/new` |
| 상세 화면 | ✏️ 수정 아이콘으로 변경 | 수정 화면 |
| 통계·설정 | FAB 미표시 | — |

### 권한별 FAB 표시

| 역할 | 인스펙션 | 객실하자 | 시설오더 |
|------|:-------:|:-------:|:-------:|
| 관리자·소장·주임 | ✅ | ✅ | ✅ |
| 메이드 | ✅ | ✅ | ❌ |
| 시설 | ❌ | ❌ | ✅ |

---

## 9. 폼 UX 전략 — Bottom Sheet + Thumb-zone

> **핵심 원칙**: 한 손 조작 최적화. 핵심 버튼은 Thumb-zone(화면 하단)에 고정.

### 9.1 공통 UX 규칙

| 항목 | 방식 |
|------|------|
| 선택형 입력 (객실, 구분, 위치, 시설종류) | Bottom Sheet로 올라옴 |
| 저장 버튼 | 화면 최하단 Thumb-zone 고정 |
| 이미지 촬영 버튼 | 크게 디자인 + `capture="environment"` 카메라 직결 |
| 자동진행 (Auto-advance) | **등록 폼에만 적용**, 수정 폼은 제외 |

### 9.2 자동진행 흐름 (등록 폼 한정)

```
객실 선택 완료 → 구분 Sheet 자동 오픈
구분 선택 완료 → 위치 Sheet 자동 오픈
위치 선택 완료 → 이미지 영역으로 스크롤
이미지 완료    → 상태 버튼으로 스크롤
텍스트 메모    → 자동진행 없음 (입력 중 강제이동 금지)
수정 폼        → 자동진행 없음 (이미 값 존재)
```

### 9.3 객실번호 픽커 — Bottom Sheet 방식

```
[트리거 버튼]
┌──────────────────────────────┐
│  🏨 객실번호 선택            │  ← 탭하면 Sheet 오픈
└──────────────────────────────┘

[선택 완료 상태]
┌──────────────────────────────┐
│  15층  |  1502           ✕  │  ← ✕로 초기화
└──────────────────────────────┘

[Bottom Sheet 내부 — Step 1: 층 선택]
━━━━━━━━━ (드래그 핸들) ━━━━━━━━━
  객실번호 선택
  [ 1층 ][ 2층 ][ 3층 ][ 4층 ]
  [ 5층 ][ 6층 ][ 7층 ][ 8층 ]
  ...

[Bottom Sheet 내부 — Step 2: 객실 선택]
━━━━━━━━━ (드래그 핸들) ━━━━━━━━━
  ← 15층
  [ 1501 ][ 1502 ][ 1503 ][ 1504 ]
  ...
```

### 9.4 반응형 그리드

| 화면 너비 | 열 수 |
|----------|:----:|
| ~ 360px | 3열 |
| 361px ~ 480px | 4열 |
| 481px ~ | 5열 |

### 9.5 BottomSheet 공통 컴포넌트 (`<BottomSheet />`)

- 하단에서 슬라이드 업 애니메이션
- 상단 드래그 핸들 — 아래로 드래그 시 닫힘
- 백드롭 클릭 시 닫힘
- 최대 높이 70vh, 내부 스크롤 지원

### 9.6 적용 대상

| 컴포넌트 | Bottom Sheet 사용 |
|----------|:-----------------:|
| RoomPicker | ✅ |
| 구분 선택 (객실하자) | ✅ |
| 위치 선택 (객실하자) | ✅ |
| 시설 종류 선택 | ✅ |

---

## 10. 이미지 업로드 / 스토리지 정책

### 10.1 핵심 원칙

```
원본 버킷 없음 — 썸네일 전용 버킷 4개로 운영
모든 이미지는 업로드 시 Canvas API로 리사이징 후 저장
버킷 접근 정책: Private (Signed URL 24시간)
```

> **버킷 Private 이유**: 업무용 이미지 — URL 노출 방지
> **Signed URL**: `supabase.storage.from(bucket).createSignedUrl(path, 86400)` (24시간 유효)
> **과금**: Signed URL 생성은 Bandwidth 미소모, 이미지 다운로드만 Bandwidth 카운트 (기존과 동일)

### 10.2 버킷 구조 (4개 분리)

```
Supabase Storage (무료 1GB)

├── thumb-inspections/      ← 인스펙션 전용
├── thumb-defects/          ← 객실하자 전용
├── thumb-facility-orders/  ← 시설오더 전용
└── thumb-notices/          ← 게시판 전용
```

### 10.3 페이지별 이미지 정책

| 구분 | 버킷 | 해상도 | 품질 | 최대장수 | 보관기간 | 삭제방식 |
|------|------|:------:|:----:|:-------:|:-------:|---------|
| 인스펙션 | thumb-inspections | **1400px** | 70% | 5장 | **20일** | Cron 자동 |
| 객실하자 | thumb-defects | **800px** | 70% | 5장 | **영구** | 수동(관리자) |
| 시설오더 | thumb-facility-orders | **300px** | 70% | 5장 | **60일** | Cron 자동 |
| 게시판 | thumb-notices | **300px** | 70% | 3장 | 글 삭제 시 | CASCADE |

### 10.4 해상도별 선택 근거

| 구분 | 해상도 | 선택 이유 |
|------|:------:|---------|
| 인스펙션 | 1400px | PC 전체화면 충분한 화질 + 1600px 대비 파일크기 ~22% 절감 |
| 객실하자 | 800px | 영구보관 → 용량 최소화, 상세 확인은 충분 |
| 시설오더 | 300px | 60일 후 Storage 파일 삭제 (DB 레코드 유지) → 간단 확인용으로 충분 |
| 게시판 | 300px | 공지 첨부용, 고화질 불필요 |

### 10.5 스토리지 사용량 추정

| 구분 | 계산 | 최대 고정/누적 |
|------|------|:------------:|
| 인스펙션 | 60장 × 350KB × 20일 | **420 MB 고정** |
| 객실하자 | 1~3장/일 × 130KB × 누적 | **47~141 MB/년 누적** |
| 시설오더 | 3장 × 40KB × 60일 | **7 MB 고정** |
| 게시판 | — | **~10 MB** |
| **초기 합계** | | **~220 MB** |

> ⚠️ 객실하자가 영구 누적되어 장기적으로 스토리지 증가
> 하루 3장 기준 → 약 6년 후 1GB 초과 예상 → 그 시점에 Pro 플랜($25/월) 전환

### 10.6 이미지 로드 전략

| 화면 | 로드 |
|------|------|
| 목록 썸네일 | **Intersection Observer** — 뷰포트 진입 시에만 Signed URL 생성 + 로드 (지연 로딩) |
| 상세 화면 | Signed URL 생성 후 로드 |
| 전체화면 뷰어 | 동일 (원본 없음) |

> ⚠️ 목록에서 카드 수만큼 Signed URL API를 일괄 호출하면 Bandwidth 한도에 영향
> Intersection Observer로 화면에 보이는 카드만 로드 — `useIntersectionObserver` 훅으로 공통화

### 10.7 자동삭제 — Edge Function 방식

> ⚠️ **Storage 파일만 삭제, DB 레코드는 유지**
> Cron SQL만으로는 Storage 파일 삭제 불가 → Edge Function 필요

```
[Supabase Cron: 매일 03:00 KST]
→ Edge Function 'auto-delete-images' 호출

[Edge Function 처리 순서]
1. inspection_images WHERE created_at < NOW() - 20일 AND thumb_path IS NOT NULL 조회
2. thumb-inspections 버킷에서 해당 파일 batch 삭제
3. inspection_images.thumb_path = NULL 로 업데이트 (레코드 유지)

4. facility_order_images WHERE created_at < NOW() - 60일 AND thumb_path IS NOT NULL 조회
5. thumb-facility-orders 버킷에서 해당 파일 batch 삭제
6. facility_order_images.thumb_path = NULL 로 업데이트 (레코드 유지)
```

**만료 이미지 화면 처리**
- `thumb_path = NULL` 인 경우 이미지 영역에 "이미지가 만료되었습니다" 플레이스홀더 표시

### 10.8 업로드 UI (공통)

```
[미업로드]
┌──────────────────────────────┐
│             📷               │
└──────────────────────────────┘

[업로드 후]
┌──────┐ ┌──────┐ ┌──────┐
│ img1 │ │ img2 │ │  📷  │
│  ✕   │ │  ✕   │ └──────┘
└──────┘ └──────┘
※ 최대 장수 도달 시 📷 버튼 숨김
```

### 10.9 업로드 유틸 함수

```javascript
// src/utils/imageUpload.js

// 버킷 상수
const BUCKETS = {
  inspections:    'thumb-inspections',
  defects:        'thumb-defects',
  facilityOrders: 'thumb-facility-orders',
  notices:        'thumb-notices',
};

// 해상도 설정
const RESIZE_CONFIG = {
  inspections:    { maxWidth: 1600, quality: 0.75 },
  defects:        { maxWidth: 800,  quality: 0.70 },
  facilityOrders: { maxWidth: 300,  quality: 0.70 },
  notices:        { maxWidth: 300,  quality: 0.70 },
};

// 이미지 리사이징 (Canvas API)
const resizeImage = (file, maxWidth, quality) => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, 'image/jpeg', quality);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
};

// 공통 업로드 함수
const uploadImage = async (file, type) => {
  const { maxWidth, quality } = RESIZE_CONFIG[type];
  const blob   = await resizeImage(file, maxWidth, quality);
  const path   = `${Date.now()}_${crypto.randomUUID()}.jpg`;
  const bucket = BUCKETS[type];
  await supabase.storage.from(bucket).upload(path, blob);
  return { thumb_path: path };
};

// public URL 생성
const getImageUrl = (path, type) => {
  const { data } = supabase.storage
    .from(BUCKETS[type])
    .getPublicUrl(path);
  return data.publicUrl;
};
```

---

## 11. 최종 변경자 정책

### 11.1 적용 테이블

```sql
-- 전체 폼 updated_by 컬럼 추가
ALTER TABLE inspections     ADD COLUMN updated_by UUID REFERENCES users(id);
ALTER TABLE defects         ADD COLUMN updated_by UUID REFERENCES users(id);
ALTER TABLE facility_orders ADD COLUMN updated_by UUID REFERENCES users(id);
ALTER TABLE notices         ADD COLUMN updated_by UUID REFERENCES users(id);
```

### 11.2 동작 규칙

| 시점 | author_id | updated_by | updated_at |
|------|-----------|------------|------------|
| 등록(INSERT) | 현재 로그인 유저 | 현재 로그인 유저 | NOW() |
| 수정(UPDATE) | 변경 없음 | 현재 로그인 유저로 갱신 | NOW() |

### 11.3 화면 표시 규칙

| 조건 | 표시 |
|------|------|
| 등록 직후 (수정 없음) | 최종수정자 필드 숨김 |
| 타인이 수정 | `최종수정자: 이름` 표시 |
| 본인이 수정 | 최종수정자 필드 숨김 |

---

## 12. 화면별 기능 명세

---

### 12.1 인스펙션

#### 목록 화면 (`/inspection`)
- 날짜별 그룹 + 건수 배지, `All` 선택 시 전체 펼침
- 메이드: 본인 기록만 표시
- 검색: 객실번호

#### 등록/수정 폼

| 순서 | 필드 | 타입 | 필수 | 비고 |
|------|------|------|:----:|------|
| 1 | 객실번호 | RoomPicker | ✅ | 2단계 픽커 |
| 2 | 특이사항 | 텍스트에어리어 | ❌ | |
| 3 | 객실상태 | 토글 버튼 | ✅ | 완료 / 진행중 / 환기중 / 시설 |
| 4 | 이미지 | 파일 업로드 | ❌ | 최대 5장, 1600px, 20일 후 Storage 자동삭제 (DB 레코드 유지) |
| 5 | 작성자 | 텍스트 인풋 | — | 자동입력 고정, 수정불가 |
| 6 | 작성일 | 날짜 | — | 자동입력 |
| 7 | 최종수정자 | 텍스트 인풋 | — | 수정 시 자동 표시, 수정불가 |

#### 객실상태 '시설' 선택 시 흐름

```
'시설' 선택
→ 폼 하단에 체크박스 표시:
  ☑ 시설오더로 발송

[체크 O + 저장]
→ 인스펙션 저장 + 시설오더 자동 생성 (동시)
  - 시설종류: '객실' 기본값
  - 오더내용: 인스펙션 메모 자동복사
  - 객실번호: 현재 객실번호
  - 상태: 접수대기
  - facility_order_id 연결

[체크 X + 저장]
→ 인스펙션만 저장 (상태만 '시설'로 기록)
```

> 인스펙션 완료 시 푸시 알림 없음

#### 상세 화면 (`/inspection/:id`)

```
[이미지 슬라이드 — 상단 전체너비]
객실번호 / 특이사항 / 작성자 / 작성일 / 최종수정자(조건부)
```

- 수정 FAB: 관리자·소장·주임·작성자 본인만
- 삭제: 관리자·소장·주임만

#### 설정 화면 (`/inspection/settings`)

| 설정 항목 | 설명 |
|----------|------|
| 층/객실 관리 | room_master CRUD + 순서 |
| 기본 객실상태 | 등록 시 기본값 |
| 목록 정렬 기준 | 최신순/오래된순 |
| 시설오더 자동등록 토글 | ON/OFF |

---

### 12.2 객실하자

#### 목록 화면 (`/defect`)
- 객실번호별 그룹 + 하자건수 배지, `All` 상단 고정
- 상태 필터 칩: 미완료 / 처리중 / 완료

#### 등록/수정 폼

| 순서 | 필드 | 타입 | 필수 | 비고 |
|------|------|------|:----:|------|
| 1 | 객실번호 | RoomPicker | ✅ | 2단계 픽커 |
| 2 | 구분 | 토글 버튼 | ✅ | localStorage 캐시에서 로드 (cache_defect_divisions) |
| 3 | 위치 | 토글 버튼 | ✅ | 구분 선택 후 표시, localStorage 캐시에서 로드 (cache_defect_locations) |
| 4 | 하자분류 | 토글 버튼 | ✅ | localStorage 캐시에서 로드 (cache_defect_categories) |
| 5 | 이미지 | 파일 업로드 | ❌ | 최대 5장, 800px, 영구보관 |
| 6 | 메모 | 텍스트에어리어 | ❌ | |
| 7 | 하자상태 | 토글 버튼 | ✅ | 완료 / 처리중 / 미완료 |
| 8 | 작성자 | 텍스트 인풋 | — | 자동입력 고정, 수정불가 |
| 9 | 작성일 | 날짜 | — | 자동입력 |
| 10 | 최종수정자 | 텍스트 인풋 | — | 수정 시 자동 표시, 수정불가 |

#### 구분별 위치 목록 (앱 확정)

| 구분 | 위치 목록 |
|------|---------|
| 객실 | 벽 / 바닥 / 의자 / 천정 / 드라이기 / 세면대 / 찍힘 / 거울 |
| 사워부스 | 벽 / 바닥 / 수전 / 천정 / 찍힘 |
| 화장실 | 벽 / 바닥 / 천장 / 비데 / 타일 / 찍힘 |
| 침대 | 벽 / 쿠션 / 턱 / 찍힘 |
| 창문 | 틀 / 유리 / 블라인드 |

> 구분·위치는 설정에서 추가/삭제/순서조정 가능 (관리자·소장·주임)
> ⚠️ 설정에서 변경 시 localStorage 캐시 자동 무효화 + 재fetch
> ⚠️ 구분·위치는 **소프트 삭제만 허용** (`is_active=false`) — 기존 하자 기록의 텍스트 보존

#### 폼 동작 규칙
- 구분 선택 시 → 위치 섹션 표시 (미선택 시 숨김)
- 구분 변경 시 → 위치 선택 초기화
- 하자상태 처리중·완료: 관리자·소장·주임만 선택 (메이드는 미완료만)

#### 상태 흐름

```
미완료 → 처리중 → 완료
                   ↑
          관리자·소장·주임만
          완료 시 → 관리자·소장·주임 전체 푸시
```

#### 상세 화면 (`/defect/:id`)

```
[이미지 슬라이드 — 상단 전체너비]
객실번호 / 구분 / 위치 / 하자분류 / 메모
하자상태 / 작성자 / 작성일 / 최종수정자(조건부)
```

#### 설정 화면 (`/defect/settings`)

| 설정 항목 | 설명 |
|----------|------|
| 층/객실 관리 | room_master CRUD + 순서 |
| 구분 관리 | defect_divisions CRUD + 순서조정 |
| 위치 관리 | defect_locations CRUD + 순서조정 (구분별) |
| 하자분류 관리 | defect_categories CRUD + 순서조정 |
| 기본 구분/위치 | 등록 시 기본값 |
| 목록 필터 기본값 | 미완료/처리중/전체 |

#### 설정 — 구분/위치 관리 UI

```
[ 구분 탭 ]  [ 위치 탭 ]

[구분 탭]                    [위치 탭]
☰ 객실      [삭제]           구분 선택: [객실 ▼]
☰ 사워부스  [삭제]           ☰ 벽       [삭제]
☰ 화장실    [삭제]           ☰ 바닥     [삭제]
☰ 침대      [삭제]           ...
☰ 창문      [삭제]           [+ 위치 추가]
[+ 구분 추가]
```

---

### 12.3 시설오더

#### 목록 화면 (`/facility-order`)
- 날짜별 그룹 + 건수 배지, `All` 상단 고정
- 상태 표시: 접수대기·접수중·완료
- 기본 필터: 접수대기 + 접수중 (미완료 묶음)

#### 등록/수정 폼

| 순서 | 필드 | 타입 | 필수 | 비고 |
|------|------|------|:----:|------|
| 1 | 객실번호 | RoomPicker | ✅ | 2단계 픽커 |
| 2 | 시설 종류 | 셀렉트 | ✅ | 설정에서 관리 |
| 3 | 특이사항 | 텍스트에어리어 | ❌ | |
| 4 | 담당자 | 텍스트 인풋 | — | 접수한 사람 자동입력 고정 |
| 5 | 이미지 | 파일 업로드 | ❌ | 최대 5장, 300px, 60일 후 Storage 자동삭제 (DB 레코드 유지) |
| 6 | 작성자 | 텍스트 인풋 | — | 자동입력 고정, 수정불가 |
| 7 | 작성일 | 날짜 | — | 자동입력 |
| 8 | 최종수정자 | 텍스트 인풋 | — | 수정 시 자동 표시, 수정불가 |

#### 상태 흐름

```
접수대기 → [접수] → 접수중 → [완료] → 완료
   ↑                              ↑
모든 오더 초기상태           관리자·소장·주임·시설 가능
(인스펙션 발송 포함)         완료 시 → 소장·주임에게만 푸시
```

- **접수 버튼**: 관리자·소장·주임·시설 가능
- **완료 버튼**: 관리자·소장·주임·시설 가능
- 모든 시설오더(직접등록·인스펙션 발송 모두) 초기상태 = `접수대기`

#### 상세 화면 (`/facility-order/:id`)

```
[이미지 슬라이드 — 상단 전체너비]
객실번호 / 시설종류 / 특이사항 / 상태
담당자 / 작성자 / 작성일 / 최종수정자(조건부)
```

#### 설정 화면 (`/facility-order/settings`)

| 설정 항목 | 설명 |
|----------|------|
| 층/객실 관리 | room_master CRUD + 순서 |
| 시설 종류 목록 | 추가·삭제·순서변경 |

---

### 12.4 인스펙션조회 (`/inspection-review`)

> 위치: 사이드메뉴 / 권한: 관리자·소장·주임 / 용도: 퇴근 시 출력·제출

- **다중선택 필터 버튼**: 전체 / 환기중 / 진행중 / 시설오더 / 완료
  - 전체 선택 시 다중선택 불가 (단일 모드)
  - 개별 클릭 시 다중선택 가능, 모두 선택 시 전체 모드로 복귀
- 출력: PDF / 엑셀

**컬럼**: 유형배지 / 객실번호 / 특이사항 / 작성자 / 등록시간(HH:mm) / 날짜

> **구현 변경점** (v3.7): 기존 탭 → 다중선택 버튼 필터로 교체, 등록시간 컬럼 추가, 시설오더도 동일 페이지에서 조회

---

### 12.5 게시판

#### 목록 화면 (`/notice`)
- 2열 테이블 (제목 / 내용 미리보기)
- 공지: 상단 고정 + 📌 배지
- FAB: 글 등록 (관리자·소장·주임만)

#### 등록/수정 폼

| 순서 | 필드 | 타입 | 필수 | 비고 |
|------|------|------|:----:|------|
| 1 | 구분 | 토글 버튼 | ❌ | 일반(기본) / 공지 |
| 2 | 제목 | 텍스트 인풋 | ✅ | |
| 3 | 내용 | 텍스트에어리어 | ✅ | |
| 4 | 이미지 | 파일 업로드 | ❌ | 최대 3장, 300px |
| 5 | 작성자 | 텍스트 인풋 | — | 자동입력 고정, 수정불가 |
| 6 | 작성일 | 날짜 | — | 자동입력 |

#### 공지 등록 시 푸시

```
구분 = '공지' 저장 시
→ 주임 전체 실시간 팝업 푸시
→ 1회 확인 시 이후 동일 게시물 팝업 미노출
```

#### 수정/삭제 권한

| 역할 | 수정 | 삭제 |
|------|:----:|:----:|
| 관리자·소장·주임 | 모든 게시물 | 모든 게시물 |
| 메이드·시설 | ❌ | ❌ |

---

### 12.6 직원목록

#### 목록 (`/staff`)
- 카드: 프로필이미지 + 이름 + 이메일 + 📞 ✉️
- FAB: 직원 등록 (관리자·소장·주임만)

#### 상세 (`/staff/:id`)
- 이름 / 메일주소(✉️) / 연락처(📞 💬) / 직원이미지

---

### 12.7 통계/대시보드 (`/dashboard`)

**권한**: 관리자·소장·주임

#### 상단 다중선택 필터 버튼

```
[전체] [💨 환기중] [🚧 진행중] [🛠️ 시설오더] [✅ 완료]
```

- 전체: 4개 카테고리 모두 표시
- 개별 클릭: 다중선택 가능, 모두 켜면 전체 모드로 복귀

#### 칸반 보드 레이아웃 (PC)

```
[ 💨 환기중 | 3 ]   [ 🚧 진행중 | 1 ]   [ 🛠️ 시설오더 | 5 ]   [ ✅ 완료 | 8 ]
- 1502호  홍길동     - 1405호  김주임     - 1201호  이시설      - 1101호  홍길동
  특이사항 없음 3/28   짐늦음 3/28  [완료]    냉난방 3/28  [접수][완료]  3/28
```

- **모바일**: `grid-cols-1` — 세로 1열 스택
- **PC (lg)**: 활성 필터 수에 따라 동적 컬럼 (`lg:grid-cols-1` ~ `lg:grid-cols-4`)
  - 2개 필터만 켜면 → 화면 반반 (`lg:grid-cols-2`)

#### 카드 구성 요소

| 요소 | 설명 |
|------|------|
| 객실번호 | 굵은 텍스트 |
| 작성자 | 작은 회색 텍스트 |
| 시설종류 | 시설오더만 표시 (amber 색상) |
| 특이사항 | 1줄 truncate |
| 날짜 | M/D 형식 |
| → 화살표 | 클릭 시 상세 페이지 이동 |

#### 빠른 처리 버튼

| 유형 | 버튼 | 동작 |
|------|------|------|
| 환기중·진행중 | `완료` (초록) | inspections.status → '완료', 목록 제거 |
| 시설오더(접수대기) | `접수` (파랑) + `완료` (초록) | facility_orders.status → '접수중' or '완료' |
| 시설오더(접수중) | `완료` (초록)만 | 접수 버튼 숨김 |
| 완료 | 버튼 없음 | — |

#### 데이터 소스 — `get_unresolved_stats()` RPC

| 구분 | 조건 |
|------|------|
| 환기중 | inspections.status = '환기중', 최근 50일 |
| 진행중 | inspections.status = '진행중', 최근 50일 |
| 시설오더 | facility_orders.status IN ('접수대기','접수중'), 최근 50일 |
| 완료 | inspections.status = '완료', 당일만 (KST) |

반환 컬럼: `id, type, room_no, note, author, created_at, work_date, sub_label, status`

---

### 12.8 설정 (`/settings`)

#### 내 정보
- 이름 수정 / PIN 변경 / 프로필 이미지 변경

#### 알림 설정 (푸시 토글)
- 푸시 알림 ON/OFF (Web Push API 구독/해제)
- 미지원 기기·거부 상태 시 UI 비활성화 + 안내 문구 표시

#### 층/객실 마스터 관리 (관리자·소장·주임, /settings에 통합)
- 층별 그룹으로 객실 목록 표시
- 객실 추가 (층 번호 + 객실번호 입력)
- 객실 소프트 삭제 (is_active=false)
- 변경 시 `clearAllCache()` 자동 호출 → localStorage 갱신

#### 사용자 관리 (관리자·소장·주임)
- 사용자 목록 / 등록 / 권한변경 / 잠금해제 / 비활성화

> **구현 변경점** (v3.7): 층/객실 관리를 각 탭 설정페이지에서 /settings 하나로 중앙화
> 개별 탭 설정페이지(/inspection/settings 등)는 해당 탭 전용 옵션만 제공 (미구현)

---

## 13. 출력 기능 명세

| 페이지 | PDF | 엑셀 |
|--------|:---:|:----:|
| 인스펙션조회 | ✅ | ✅ |
| 객실하자 목록 | ✅ | ✅ |
| 시설오더 목록 | ✅ | ✅ |
| 통계/대시보드 | ✅ | ✅ |

**출력 권한**: 관리자·소장·주임·시설 / 메이드 ❌

---

## 14. 전역 헤더 알림 / 새로고침

### 14.1 헤더 버튼 구성 (AppHeader.jsx)

| 위치 | 버튼 | 동작 |
|------|------|------|
| 우측 첫 번째 | 🔄 RefreshCw | `useRefreshStore.triggerRefresh()` → 현재 목록 페이지 재조회 |
| 우측 두 번째 | 🔔 Bell + 빨간 뱃지 | `useNotificationStore.openDrawer()` → 알림 드로어 열기 |
| 우측 세 번째 | 나가기 | 로그아웃 |

### 14.2 새로고침 (useRefreshStore)

- `refreshKey` (숫자 카운터) 전역 공유
- 🔄 클릭 → `triggerRefresh()` → `refreshKey++`
- 구독 페이지: `InspectionList`, `FacilityOrderList`, `DefectList`, `NoticeList`, `Dashboard`
- `useEffect` 의존성 배열에 `[refreshKey]` 추가만으로 연동

### 14.3 알림 드로어 (useNotificationStore + NotificationDrawer.jsx)

**알림 항목 종류:**
| 종류 | 아이콘 | 대상 | 데이터 출처 |
|------|--------|------|-------------|
| 공지사항 | 📣 Megaphone | 전 직원 | `notices` 최근 20개 |
| 시설오더 접수대기 | 🔧 Wrench | 관리자·소장·주임만 | `facility_orders` where status='접수대기' 최근 20개 |

**읽음 처리 방식:**
- `notif_init_{userId}` (localStorage) — 최초 앱 로드 기준 시각. 이 시각 이전 항목은 자동 읽음(뱃지 폭탄 방지)
- `notif_read_{userId}` (localStorage) — 읽은 item ID 배열 (`notice_{uuid}` / `fo_{uuid}`)
- 앱 로드 시 `initBadge()` → `initTime` 이후 + 안 읽은 항목 수 → 헤더 뱃지
- 드로어 항목 클릭 → `markRead()` → 뱃지 감소 → 상세 페이지 이동
- 전체 읽음 버튼 → `markAllRead()`
- 로그아웃 → `reset()` (다음 계정 오염 방지)

**드로어 UX:**
- 우측에서 슬라이드 인 (`animate-slide-in-right` 0.22s ease)
- 배경 오버레이 클릭 → 닫힘
- 드로어 내 새로고침 버튼 → 항목 재조회

### 14.4 구 푸시 알림 명세 (미구현 — 향후 검토)

| 이벤트 | 발송 대상 | 내용 |
|--------|-----------|------|
| 시설오더 신규 등록 | 시설팀 전체 | `[1602] 시설오더 — 슬라이딩도어` |
| 공지 등록 | 주임 전체 | 실시간 팝업 (1회 확인 후 미노출) |

### iOS PWA 푸시 제약

| 조건 | 내용 |
|------|------|
| iOS 최소 버전 | iOS 16.4 이상 |
| 설치 필요 | Safari → 홈화면 추가 후에만 수신 |

---

## 15. 데이터 모델 / DB 설계

### 15.1 테이블 목록

| 테이블명 | 설명 | 신규 |
|----------|------|:----:|
| `users` | 직원 계정 및 권한 | |
| `room_master` | 층·객실 마스터 | |
| `inspections` | 인스펙션 기록 | |
| `inspection_images` | 인스펙션 이미지 (thumb only) | |
| `defects` | 객실 하자 기록 | |
| `defect_images` | 하자 이미지 (thumb only) | |
| `defect_categories` | 하자 분류 코드 | |
| `defect_divisions` | 하자 구분 마스터 | ✅ |
| `defect_locations` | 구분별 위치 마스터 | ✅ |
| `facility_orders` | 시설 오더 기록 | |
| `facility_order_images` | 시설오더 이미지 (thumb only) | |
| `facility_order_log` | 시설오더 상태 이력 | |
| `facility_types` | 시설 종류 마스터 | ✅ |
| `notices` | 게시판 글 | |
| `notice_images` | 게시판 이미지 (thumb only) | ✅ |
| `notice_comments` | 게시판 댓글 | ✅ |
| `notice_reads` | 공지 확인 이력 (팝업 1회 제어) | ✅ |
| `push_subscriptions` | PWA 푸시 구독 | |
| `page_settings` | 페이지별 설정 값 | |

### 15.2 DDL

```sql
-- =============================================
-- 직원(사용자) 테이블
-- =============================================
CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'maid'
                CHECK (role IN ('admin','manager','supervisor','maid','facility')),
  avatar_url  TEXT,
  phone       TEXT,
  pin_failed  INT NOT NULL DEFAULT 0,
  is_locked   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 층·객실 마스터
-- =============================================
CREATE TABLE room_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor       INT  NOT NULL,
  room_no     TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 인스펙션
-- =============================================
CREATE TABLE inspections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT '진행중'
                      CHECK (status IN ('환기중','진행중','완료','시설')),
  note              TEXT,
  author_id         UUID NOT NULL REFERENCES users(id),
  updated_by        UUID REFERENCES users(id),
  facility_order_id UUID REFERENCES facility_orders(id) ON DELETE SET NULL,
  work_date         DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 인스펙션 이미지 (thumb-inspections 버킷 / 10일 자동삭제)
-- =============================================
CREATE TABLE inspection_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  thumb_path     TEXT,            -- thumb-inspections 버킷 / 자동삭제 후 NULL 가능
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 하자 구분 마스터 (신규)
-- =============================================
CREATE TABLE defect_divisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 구분별 위치 마스터 (신규)
-- =============================================
CREATE TABLE defect_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id  UUID NOT NULL REFERENCES defect_divisions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sort_order   INT  NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(division_id, name)
);

-- =============================================
-- 하자 분류 코드
-- =============================================
CREATE TABLE defect_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 객실 하자
-- =============================================
CREATE TABLE defects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no       TEXT NOT NULL,
  category      TEXT,            -- 등록 시 하자분류명 스냅샷 (division/location과 방식 통일)
  division      TEXT NOT NULL,
  location      TEXT NOT NULL,
  memo          TEXT,
  status        TEXT NOT NULL DEFAULT '미완료'
                  CHECK (status IN ('미완료','처리중','완료')),
  author_id     UUID NOT NULL REFERENCES users(id),
  updated_by    UUID REFERENCES users(id),
  completed_by  UUID REFERENCES users(id),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 하자 이미지 (thumb-defects 버킷 / 영구보관)
-- =============================================
CREATE TABLE defect_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_id      UUID NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
  thumb_path     TEXT NOT NULL,   -- thumb-defects 버킷
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 시설 종류 마스터 (신규)
-- =============================================
CREATE TABLE facility_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 시설 오더
-- =============================================
CREATE TABLE facility_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no            TEXT NOT NULL,
  facility_type_id   UUID REFERENCES facility_types(id) ON DELETE SET NULL,
  facility_type_name TEXT NOT NULL,   -- 등록 시 스냅샷 (facility_type 삭제/변경 시 보존)
  note               TEXT,
  status             TEXT NOT NULL DEFAULT '접수대기'
                       CHECK (status IN ('접수대기','접수중','완료')),
  author_id          UUID NOT NULL REFERENCES users(id),
  updated_by         UUID REFERENCES users(id),
  assigned_to        UUID REFERENCES users(id),
  completed_at       TIMESTAMPTZ,
  work_date          DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 시설오더 이미지 (thumb-facility-orders 버킷 / 60일 자동삭제)
-- =============================================
CREATE TABLE facility_order_images (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_order_id  UUID NOT NULL REFERENCES facility_orders(id) ON DELETE CASCADE,
  thumb_path         TEXT,            -- thumb-facility-orders 버킷 / 자동삭제 후 NULL 가능
  sort_order         INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 시설 오더 이력 로그
-- =============================================
CREATE TABLE facility_order_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_order_id  UUID NOT NULL REFERENCES facility_orders(id) ON DELETE CASCADE,
  changed_by         UUID NOT NULL REFERENCES users(id),
  old_status         TEXT,
  new_status         TEXT,
  memo               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 게시판
-- =============================================
CREATE TABLE notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  author_id   UUID NOT NULL REFERENCES users(id),
  updated_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 게시판 이미지 (thumb-notices 버킷 / 신규)
-- =============================================
CREATE TABLE notice_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id   UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  thumb_path  TEXT NOT NULL,   -- thumb-notices 버킷
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 게시판 댓글 (신규)
-- =============================================
CREATE TABLE notice_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id   UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 공지 확인 이력 (팝업 1회 제어 / 신규)
-- =============================================
CREATE TABLE notice_reads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id  UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(notice_id, user_id)
);

-- =============================================
-- PWA 푸시 구독
-- =============================================
CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  device_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- =============================================
-- 페이지별 설정
-- =============================================
CREATE TABLE page_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page        TEXT NOT NULL
                CHECK (page IN ('inspection','defect','facility_order')),
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, page, key)
);
```

### 15.3 초기 데이터 (Seed)

```sql
-- 구분 초기 데이터
INSERT INTO defect_divisions (name, sort_order) VALUES
  ('객실', 0), ('사워부스', 1), ('화장실', 2), ('침대', 3), ('창문', 4);

-- 위치 초기 데이터
INSERT INTO defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['벽','바닥','의자','천정','드라이기','세면대','찍힘','거울']),
       generate_series(0,7) FROM defect_divisions WHERE name = '객실';

INSERT INTO defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['벽','바닥','수전','천정','찍힘']),
       generate_series(0,4) FROM defect_divisions WHERE name = '사워부스';

INSERT INTO defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['벽','바닥','천장','비데','타일','찍힘']),
       generate_series(0,5) FROM defect_divisions WHERE name = '화장실';

INSERT INTO defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['벽','쿠션','턱','찍힘']),
       generate_series(0,3) FROM defect_divisions WHERE name = '침대';

INSERT INTO defect_locations (division_id, name, sort_order)
SELECT id, unnest(ARRAY['틀','유리','블라인드']),
       generate_series(0,2) FROM defect_divisions WHERE name = '창문';

-- 하자분류 초기 데이터
INSERT INTO defect_categories (name, sort_order) VALUES
  ('스크래치', 0), ('얼룩', 1), ('파손', 2),
  ('냄새', 3), ('소음', 4), ('누수', 5), ('기타', 6);

-- 시설종류 초기 데이터 (신규)
INSERT INTO facility_types (name, sort_order) VALUES
  ('객실', 0), ('공용부', 1), ('시설', 2);
```

### 15.4 인덱스

```sql
CREATE INDEX idx_inspections_work_date  ON inspections(work_date DESC);
CREATE INDEX idx_inspections_author_id  ON inspections(author_id);
CREATE INDEX idx_inspections_room_no    ON inspections(room_no);
CREATE INDEX idx_inspections_status     ON inspections(status);

CREATE INDEX idx_defects_room_no        ON defects(room_no);
CREATE INDEX idx_defects_status         ON defects(status);
CREATE INDEX idx_defects_author         ON defects(author_id);

CREATE INDEX idx_facility_orders_date   ON facility_orders(work_date DESC);
CREATE INDEX idx_facility_orders_status ON facility_orders(status);

CREATE INDEX idx_room_master_floor      ON room_master(floor, sort_order);
CREATE INDEX idx_defect_locations_div   ON defect_locations(division_id, sort_order);

-- 자동삭제 Cron 성능을 위한 인덱스
CREATE INDEX idx_inspection_images_created  ON inspection_images(created_at);  -- 20일 자동삭제 Cron 성능
CREATE INDEX idx_facility_order_img_created ON facility_order_images(created_at);
```

### 15.5 RLS 정책

```sql
-- =============================================
-- 헬퍼 함수 (반복 권한 쿼리 최소화)
-- =============================================
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('admin','manager','supervisor')
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- =============================================
-- RLS 활성화
-- =============================================
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_master          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE defects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_divisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_locations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_order_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_order_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_reads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_settings        ENABLE ROW LEVEL SECURITY;

-- =============================================
-- users
-- =============================================
CREATE POLICY "users_select" ON users FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "users_update" ON users FOR UPDATE USING (auth.uid() = id OR is_manager());
CREATE POLICY "users_delete" ON users FOR DELETE USING (is_manager());

-- =============================================
-- room_master (마스터 데이터 — 관리자만 변경)
-- =============================================
CREATE POLICY "room_select" ON room_master FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "room_insert" ON room_master FOR INSERT WITH CHECK (is_manager());
CREATE POLICY "room_update" ON room_master FOR UPDATE USING (is_manager());
CREATE POLICY "room_delete" ON room_master FOR DELETE USING (is_manager());

-- =============================================
-- inspections (메이드: 본인만 조회)
-- =============================================
CREATE POLICY "inspection_select" ON inspections FOR SELECT
  USING (
    is_manager()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'facility')
    OR auth.uid() = author_id
  );
CREATE POLICY "inspection_insert" ON inspections FOR INSERT
  WITH CHECK (
    is_manager()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'maid')
  );
CREATE POLICY "inspection_update" ON inspections FOR UPDATE
  USING (is_manager() OR auth.uid() = author_id);
CREATE POLICY "inspection_delete" ON inspections FOR DELETE USING (is_manager());

-- =============================================
-- inspection_images
-- =============================================
CREATE POLICY "insp_img_select" ON inspection_images FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "insp_img_insert" ON inspection_images FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "insp_img_delete" ON inspection_images FOR DELETE USING (is_manager());

-- =============================================
-- defects
-- =============================================
CREATE POLICY "defect_select" ON defects FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "defect_insert" ON defects FOR INSERT
  WITH CHECK (
    is_manager()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'maid')
  );
CREATE POLICY "defect_update" ON defects FOR UPDATE
  USING (is_manager() OR auth.uid() = author_id);
CREATE POLICY "defect_delete" ON defects FOR DELETE USING (is_manager());

-- =============================================
-- defect_images
-- =============================================
CREATE POLICY "defect_img_select" ON defect_images FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "defect_img_insert" ON defect_images FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "defect_img_delete" ON defect_images FOR DELETE USING (is_manager());

-- =============================================
-- defect_divisions / defect_locations / defect_categories (마스터)
-- =============================================
CREATE POLICY "div_select"  ON defect_divisions  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "div_write"   ON defect_divisions  FOR ALL    USING (is_manager());
CREATE POLICY "loc_select"  ON defect_locations  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "loc_write"   ON defect_locations  FOR ALL    USING (is_manager());
CREATE POLICY "cat_select"  ON defect_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cat_write"   ON defect_categories FOR ALL    USING (is_manager());

-- =============================================
-- facility_orders
-- =============================================
CREATE POLICY "fo_select" ON facility_orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fo_insert" ON facility_orders FOR INSERT
  WITH CHECK (
    is_manager()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'facility')
  );
CREATE POLICY "fo_update" ON facility_orders FOR UPDATE
  USING (
    is_manager()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'facility')
  );
CREATE POLICY "fo_delete" ON facility_orders FOR DELETE USING (is_manager());

-- =============================================
-- facility_order_images / facility_order_log
-- =============================================
CREATE POLICY "fo_img_select" ON facility_order_images FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fo_img_insert" ON facility_order_images FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "fo_img_delete" ON facility_order_images FOR DELETE USING (is_manager());
CREATE POLICY "fo_log_select" ON facility_order_log FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fo_log_insert" ON facility_order_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- facility_types (마스터)
-- =============================================
CREATE POLICY "ft_select" ON facility_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ft_write"  ON facility_types FOR ALL    USING (is_manager());

-- =============================================
-- notices
-- =============================================
CREATE POLICY "notice_select" ON notices FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "notice_insert" ON notices FOR INSERT WITH CHECK (is_manager());
CREATE POLICY "notice_update" ON notices FOR UPDATE USING (is_manager());
CREATE POLICY "notice_delete" ON notices FOR DELETE USING (is_manager());

-- =============================================
-- notice_images
-- =============================================
CREATE POLICY "notice_img_select" ON notice_images FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "notice_img_insert" ON notice_images FOR INSERT WITH CHECK (is_manager());
CREATE POLICY "notice_img_delete" ON notice_images FOR DELETE USING (is_manager());

-- =============================================
-- notice_comments
-- =============================================
CREATE POLICY "comment_select" ON notice_comments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comment_insert" ON notice_comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "comment_update" ON notice_comments FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "comment_delete" ON notice_comments FOR DELETE USING (auth.uid() = author_id OR is_manager());

-- =============================================
-- notice_reads
-- =============================================
CREATE POLICY "nread_select" ON notice_reads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nread_insert" ON notice_reads FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- push_subscriptions (본인만)
-- =============================================
CREATE POLICY "push_select" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_insert" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_update" ON push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "push_delete" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- page_settings (본인만)
-- =============================================
CREATE POLICY "ps_select" ON page_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ps_insert" ON page_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ps_update" ON page_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ps_delete" ON page_settings FOR DELETE USING (auth.uid() = user_id);
```

### 15.6 updated_at 자동 갱신 트리거

```sql
-- 공통 트리거 함수
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 적용 테이블
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inspections_updated_at
  BEFORE UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_defects_updated_at
  BEFORE UPDATE ON defects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_facility_orders_updated_at
  BEFORE UPDATE ON facility_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notices_updated_at
  BEFORE UPDATE ON notices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notice_comments_updated_at
  BEFORE UPDATE ON notice_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_page_settings_updated_at
  BEFORE UPDATE ON page_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 15.7 타임존 설정

```sql
-- Supabase 프로젝트 DB 타임존 설정 (Dashboard > Database > Settings 또는 아래 SQL)
ALTER DATABASE postgres SET timezone = 'Asia/Seoul';
```

> 프론트엔드: `dayjs` + `dayjs/plugin/timezone` 사용, KST 기준 날짜 표시

### 15.8 page_settings 키 목록

> ⚠️ **구현 방식 결정**: 기기 간 동기화 불필요 → `localStorage` 저장 채택 (`page_settings` DB 테이블 미사용)
> `localStorage` 키 형식: `settings_{userId}_{page}_{key}`

| page | key | 값 예시 | 설명 |
|------|-----|---------|------|
| `inspection` | `auto_facility_order_popup` | `true/false` | 시설오더 자동등록 팝업 |
| `inspection` | `default_status` | `진행중` | 등록 시 기본 객실상태 |
| `inspection` | `sort_order` | `desc` | 목록 정렬 기준 |
| `defect` | `default_division` | `객실` | 등록 시 기본 구분 |
| `defect` | `default_filter` | `미완료` | 목록 기본 필터 |
| `facility_order` | `default_assigned_to` | `uuid` | 기본 담당자 |

---

## 16. 마스터 데이터 캐싱 전략

### 16.1 캐싱 대상

변동이 거의 없는 마스터 데이터는 **localStorage**에 캐싱하여 Supabase 호출 최소화

| localStorage 키 | 데이터 | 출처 테이블 |
|----------------|--------|------------|
| `cache_room_master` | 층/객실 목록 | room_master |
| `cache_defect_divisions` | 하자 구분 | defect_divisions |
| `cache_defect_locations` | 구분별 위치 | defect_locations |
| `cache_defect_categories` | 하자 분류 | defect_categories |
| `cache_facility_types` | 시설 종류 | facility_types |

### 16.2 캐싱 흐름

> **SWR (Stale-While-Revalidate) 패턴 채택** (v3.7 변경)
>
> | 단계 | 동작 |
> |------|------|
> | 1 | 캐시 있음 → localStorage 데이터를 즉시 반환 (오프라인·음영 구역에서도 폼 즉시 열림) |
> | 2 | 동시에 백그라운드에서 Supabase 재검증 fetch 시작 |
> | 3 | fetch 성공 → localStorage 갱신 (다음 열람부터 최신 데이터 적용) |
> | 4 | fetch 실패 (오프라인) → 에러 무시, 기존 캐시 유지 |
> | 5 | 캐시 없음 (최초 접속 or 로그아웃 후) → fetch 완료 후 반환 |
>
> **효과**: 호텔 복도 끝·지하 주차장 등 와이파이 음영 구역에서도 이전에 캐시된 층/객실/마스터 데이터로 폼 즉시 열림. "오프라인 대응" 핵심 가치 유지.

#### 오프라인 쓰기(저장) 방어

> 저장 API 요청 시 **8초 타임아웃** 적용 (`networkSave` 유틸리티):
> - 타임아웃 초과 → 저장 버튼 스피너 종료 + **빨간 Toast**: "네트워크 연결이 약합니다. 인터넷이 되는 곳에서 다시 저장해 주세요."
> - 일반 Supabase 에러 → 폼 하단 인라인 에러 메시지 (기존 동작 유지)
> - 적용 대상: InspectionFormPage, DefectFormPage, FacilityOrderFormPage, NoticeFormPage

```
앱 로드 또는 캐시 없음
  → Supabase fetch (is_active=true 조건)
  → 컴포넌트 메모리(React 상태)에만 보관 (localStorage 불사용)

화면 전환
  → 이미 fetch된 React 상태 재사용 (앱 생존 동안 유지)

앱 새로고침 / 재접속
  → 다시 fetch (항상 최신 데이터)

로그아웃 시
  → React 상태 초기화 (localStorage 정리 불필요)
```

> 추후 트래픽이 증가하면 Zustand store에 마스터 데이터 보관 + 세션 단위 재사용으로 전환

### 16.3 유틸 구조 (`src/utils/masterCache.js`)

```javascript
// MAU 3명 규모 — localStorage 미사용, 매번 Supabase fetch
// React 상태(Zustand 또는 컴포넌트 상태)에 보관하여 세션 동안 재사용

fetchMasterData(key)    // Supabase에서 fetch (is_active=true 조건)
// 예: fetchMasterData('rooms') → room_master 조회
// 예: fetchMasterData('defectDivisions') → defect_divisions 조회
```

> ℹ️ `masterCache.js`는 fetch 함수 모음으로만 사용.
> 상태 보관은 호출하는 컴포넌트 또는 Zustand 스토어에서 담당.

---

## 17. API 설계

### 17.1 인증

```javascript
// 관리자 로그인
supabase.auth.signInWithPassword({ email, password })

// 일반 직원 로그인 (이름으로 internal_email 조회 후 로그인)
const { data: user } = await supabase
  .from('users').select('email').eq('name', name).single();
supabase.auth.signInWithPassword({ email: user.email, password: pin });

supabase.auth.signOut()        // 로그아웃
supabase.auth.getSession()     // 세션 확인
// 사용자 생성: Edge Function 경유 (internal_email 자동 생성)
```

### 17.2 사용자 계정 생성 Edge Function (`create-user`)

> 브라우저에서 `service_role` 키를 직접 사용할 수 없으므로 Edge Function 필수

**함수명**: `create-user`
**호출 권한**: 관리자·소장·주임만 (Edge Function 내부에서 JWT role 검증)

```typescript
// 요청 (POST /functions/v1/create-user)
{
  name: string,          // 직원 이름 (한글 가능)
  pin: string,           // PIN 4자리
  role: 'admin' | 'manager' | 'supervisor' | 'maid' | 'facility',
  phone?: string
}

// 처리 순서
// 1. JWT에서 호출자 role 확인 → admin/manager/supervisor 아니면 403
// 2. internal_email 생성: `${crypto.randomUUID()}@hk.internal`
// 3. supabase.auth.admin.createUser({ email: internal_email, password: pin })
// 4. public.users INSERT (id=auth.uid, name, email=internal_email, role, phone)
// 5. 생성된 user 정보 반환

// 응답
{ id: string, name: string, email: string, role: string }

// 에러 케이스
// 403 — 호출자 권한 부족
// 409 — 동명이인 (name UNIQUE 제약)
// 400 — PIN 4자리 미만
```

**배포 위치**: `supabase/functions/create-user/index.ts`

---

### 17.4 이미지 업로드

```javascript
// 공통 업로드 (버킷별 해상도 자동 적용)
const uploadImage = async (file, type) => {
  // type: 'inspections' | 'defects' | 'facilityOrders' | 'notices'
  const { maxWidth, quality } = RESIZE_CONFIG[type];
  const blob   = await resizeImage(file, maxWidth, quality);
  const path   = `${Date.now()}_${crypto.randomUUID()}.jpg`;
  const bucket = BUCKETS[type];
  await supabase.storage.from(bucket).upload(path, blob);
  return { thumb_path: path };
};
```

### 17.5 통계 집계 RPC

```sql
-- 직원별 인스펙션 건수
CREATE OR REPLACE FUNCTION get_staff_inspection_stats(
  start_date DATE, end_date DATE
) RETURNS TABLE(staff_name TEXT, count BIGINT) AS $$
  SELECT u.name, COUNT(i.id)
  FROM inspections i JOIN users u ON i.author_id = u.id
  WHERE i.work_date BETWEEN start_date AND end_date
  GROUP BY u.name ORDER BY COUNT(i.id) DESC;
$$ LANGUAGE SQL STABLE;

-- 당일 시설오더 현황
CREATE OR REPLACE FUNCTION get_today_facility_order_stats()
RETURNS TABLE(status TEXT, count BIGINT) AS $$
  SELECT status, COUNT(id) FROM facility_orders
  WHERE work_date = CURRENT_DATE GROUP BY status;
$$ LANGUAGE SQL STABLE;

-- 미처리 현황 (최근 50일) — migration_v5 기준 최신 버전
-- 변경: id·work_date·sub_label·status·완료(당일) 추가
CREATE OR REPLACE FUNCTION get_unresolved_stats()
RETURNS TABLE(
  id UUID, type TEXT, room_no TEXT, note TEXT,
  author TEXT, created_at TIMESTAMPTZ,
  work_date DATE, sub_label TEXT, status TEXT
) AS $$
  SELECT i.id, '환기중'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status
  FROM inspections i JOIN users u ON i.author_id = u.id
  WHERE i.status = '환기중' AND i.created_at >= NOW() - INTERVAL '50 days'
  UNION ALL
  SELECT i.id, '진행중'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status
  FROM inspections i JOIN users u ON i.author_id = u.id
  WHERE i.status = '진행중' AND i.created_at >= NOW() - INTERVAL '50 days'
  UNION ALL
  SELECT f.id, '시설오더'::TEXT, f.room_no, f.note, u.name,
         f.created_at, f.work_date, f.facility_type_name, f.status
  FROM facility_orders f JOIN users u ON f.author_id = u.id
  WHERE f.status IN ('접수대기', '접수중') AND f.created_at >= NOW() - INTERVAL '50 days'
  UNION ALL
  SELECT i.id, '완료'::TEXT, i.room_no, i.note, u.name,
         i.created_at, i.work_date, NULL::TEXT, i.status
  FROM inspections i JOIN users u ON i.author_id = u.id
  WHERE i.status = '완료'
    AND i.work_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE
  ORDER BY created_at DESC;
$$ LANGUAGE SQL STABLE;

-- ⚠️ 적용 순서: DROP FUNCTION IF EXISTS get_unresolved_stats(); 먼저 실행 후 CREATE
```

---

## 18. 개발 우선순위 로드맵

> 마지막 업데이트: 2026-03-28

### Phase 1 — 기반 구축

| 순서 | 작업 | 상태 |
|------|------|:----:|
| 1 | 프로젝트 셋업 (React + Vite + PWA + Tailwind + Supabase) | ✅ 완료 |
| 2 | DB 테이블 + RLS + 트리거 + Private 스토리지 버킷 4개 생성 + Seed 데이터 | ✅ 완료 |
| 3 | 로그인 / PIN 인증 / 권한 시스템 (Zustand) + 마스터 데이터 캐시 유틸 | ✅ 완료 |
| 4 | 공통 레이아웃 (AppHeader + 하단 탭 3개 + 사이드 메뉴 + FAB) | ✅ 완료 |
| 5 | 반응형 레이아웃 (모바일·태블릿·PC) + PageContainer | ✅ 완료 |
| 6 | RoomPicker 컴포넌트 (2단계 스텝) | ✅ 완료 |
| 7 | 이미지 업로드 유틸 (Canvas 리사이징 + 버킷별 분기 + 5장 UI) | ✅ 완료 |
| 8 | Cron 자동삭제 설정 (인스펙션 20일 / 시설오더 60일) | ✅ 완료 |
| 8-b | Service Worker Stale-While-Revalidate 뼈대 설정 (Phase 3-19 리팩토링 방지) | ⬜ 검토 |

> **Phase 1 구현 파일 목록**
> - `src/utils/imageUpload.js` — Canvas 리사이징, Signed URL, 버킷별 분기
> - `src/components/common/ImageUploader.jsx` — 최대 5장 UI, 만료 이미지 처리
> - `supabase/functions/auto-delete-images/index.ts` — Edge Function (Deno)
> - `supabase/cron.sql` — pg_cron 등록 (매일 03:00 KST)
> - `supabase/migration_v2.sql` — 상태값 변경 + thumb_path NULL 허용

### Phase 2 — 핵심 기능

| 순서 | 작업 | 상태 |
|------|------|:----:|
| 9 | 인스펙션 CRUD + 시설오더 체크박스 연동 | ✅ 완료 |
| 10 | 객실하자 CRUD + 구분/위치 동적 로드 | ✅ 완료 |
| 11 | 시설오더 CRUD (접수대기→접수중→완료) | ✅ 완료 |
| 12 | 인스펙션조회 (사이드메뉴 + 탭 + 출력) | ⬜ 다음 |

> **Phase 2-9 구현 파일 목록**
> - `src/pages/inspection/InspectionListPage.jsx` — 날짜 탭 + 검색 + 날짜별 그룹 목록
> - `src/pages/inspection/InspectionFormPage.jsx` — 등록/수정 겸용, 자동진행(객실→이미지), 시설오더 발송 체크박스
> - `src/pages/inspection/InspectionDetailPage.jsx` — 이미지 슬라이드(스크롤 스냅), 상세 정보, 삭제
> - `src/router/AppRouter.jsx` — 인스펙션 3개 페이지 연결, 기본 경로 `/inspection`
> - `src/components/layout/FAB.jsx` — 상세 화면 수정 FAB에서 시설(facility) 역할 제외

> **Phase 2-10 구현 파일 목록**
> - `src/pages/defect/DefectListPage.jsx` — 상태 필터 칩 + 객실번호별 그룹
> - `src/pages/defect/DefectFormPage.jsx` — 등록/수정 겸용, 자동진행, 위치 다중선택(쉼표 구분 저장), 관리자 상태 제한
> - `src/pages/defect/DefectDetailPage.jsx` — 이미지 슬라이드, 위치 칩 표시, 삭제
> - `src/router/AppRouter.jsx` — 객실하자 3개 페이지 연결

> **Phase 2-11 구현 파일 목록**
> - `src/pages/facilityOrder/FacilityOrderListPage.jsx` — 상태 필터(미완료/접수대기/접수중/완료/All) + 날짜별 그룹
> - `src/pages/facilityOrder/FacilityOrderFormPage.jsx` — 등록/수정 겸용, 시설종류 토글, 초기상태 접수대기
> - `src/pages/facilityOrder/FacilityOrderDetailPage.jsx` — 접수/완료 버튼, 이력 로그, 삭제
> - `src/router/AppRouter.jsx` — 시설오더 5개 라우트 연결

### Phase 3 — 부가 기능

| 순서 | 작업 | 상태 |
|------|------|:----:|
| 13 | 게시판 CRUD (일반/공지 + 댓글 + 이미지) | ✅ 완료 |
| 14 | 직원목록 + 직원 상세 | ✅ 완료 |
| 15 | 통계/대시보드 (다중선택 필터 + 칸반 보드 + 빠른 처리 버튼) | ✅ 완료 |
| 16 | PDF / 엑셀 출력 (인스펙션조회) | ✅ 완료 |
| 17 | 푸시 알림 (Web Push + VAPID + Edge Function) | ✅ 완료 |
| 18 | 사용자 관리 (설정 페이지 + 층/객실 마스터 관리) | ✅ 완료 |
| 19 | 오프라인 캐싱 최적화 (Workbox runtime caching) | ✅ 완료 |

> **Phase 3 구현 파일 목록 (v3.7)**
> - `src/pages/notice/NoticeListPage.jsx` — 공지 상단고정 + 목록
> - `src/pages/notice/NoticeFormPage.jsx` — 등록/수정 + 공지 푸시 발송
> - `src/pages/notice/NoticeDetailPage.jsx` — 상세 + 댓글
> - `src/pages/staff/StaffListPage.jsx` — 역할 뱃지 + 연락처
> - `src/pages/staff/StaffDetailPage.jsx` — 직원 상세
> - `src/pages/DashboardPage.jsx` — 칸반 보드 레이아웃, 다중선택 필터, 빠른 처리 버튼
> - `src/pages/InspectionReviewPage.jsx` — 다중선택 필터 버튼 + 등록시간 컬럼 + 엑셀 출력
> - `src/pages/SettingsPage.jsx` — 푸시 토글 + 층/객실 마스터 관리
> - `src/components/layout/SideMenu.jsx` — PC 메인탭(인스펙션/객실하자/시설오더) 링크 추가
> - `src/components/layout/FAB.jsx` — /new·/edit 화면 FAB 숨김 버그 수정, 중복 FAB 제거
> - `src/sw.js` — Workbox NetworkFirst(Supabase API) + StaleWhileRevalidate(이미지), 푸시 tag 제거
> - `supabase/migration_v4.sql` — is_manager() 갱신, is_active_user() 추가, RLS 전체 정책 개선
> - `supabase/migration_v5.sql` — get_unresolved_stats() 확장 (id·status·sub_label·work_date·완료 추가)

### Phase 4 — 완료 항목 (2026-03-31 추가)

| 항목 | 설명 |
|------|------|
| masterCache.js 중복 버그 수정 | `invalidateCache` / `clearAllCache` 이중 선언 제거, `CACHE_TTL_MS` → `TTL_MS` 수정 |
| 긴급오더 (is_urgent) | FacilityOrderFormPage 체크박스, ListPage 긴급 먼저 정렬 + 빨간 카드 강조 |
| 시설오더 → 객실하자 이관 | DetailPage 이관 버튼 + 구분/위치 BottomSheet 2단계 선택 |
| 이관 트랜잭션 RPC | `move_facility_to_defect_v1` — defect INSERT + facility_order UPDATE + log INSERT 원자 처리 |
| 이미지 이관 | RPC 성공 후 thumb-facility-orders → thumb-defects 복사 (경로 파싱 수정) |
| facility_orders.status 통일 | `접수중` → `처리중` 데이터 마이그레이션 + CHECK 제약 수정 |
| 이관 필터 | ListPage `이관` 탭 추가, 미완료 필터에서 이관 제외 |

> - `supabase/migration_v6.sql` — status 통일, is_urgent, 이관 RPC
> - `src/pages/facilityOrder/FacilityOrderDetailPage.jsx` — 이관 버튼 + BottomSheet + migrateImages
> - `src/pages/facilityOrder/FacilityOrderFormPage.jsx` — is_urgent 체크박스
> - `src/pages/facilityOrder/FacilityOrderListPage.jsx` — 이관 필터·긴급 정렬·뱃지

### Phase 5 — 현황 확인 결과 (2026-03-31)

**모든 🔴 높음 항목이 이미 구현되어 있음을 확인.**

| 항목 | 상태 | 비고 |
|------|------|------|
| 로그인 RLS 이슈 | ✅ 이미 동작 중 | `get_internal_email_by_name` RPC DB에 존재, migration_v7.sql은 기록용 |
| 시설종류 설정 | ✅ 구현됨 | SettingsPage `마스터 코드` 탭 — MasterDataEditor |
| 객실하자 설정 (구분/위치/분류) | ✅ 구현됨 | SettingsPage `마스터 코드` 탭 — MasterDataEditor |
| `/facility-order/settings` 라우트 | ⚠️ Placeholder | 기능은 SettingsPage에 있음, 리다이렉트 처리 필요 |
| `/defect/settings` 라우트 | ⚠️ Placeholder | 기능은 SettingsPage에 있음, 리다이렉트 처리 필요 |
| `/inspection/settings` 라우트 | ⚠️ Placeholder | 기능은 SettingsPage에 있음, 리다이렉트 처리 필요 |

### 남은 작업

| 우선순위 | 항목 | 설명 |
|:-------:|------|------|
| 🟢 낮음 | **설정 Placeholder 라우트 정리** | `/facility-order/settings`, `/defect/settings`, `/inspection/settings` → SettingsPage 리다이렉트 |
| 🟢 낮음 | **UserFormPage 아바타** | 관리자가 직원 등록 시 아바타 업로드 |

---

## 19. 전체 URL 라우팅

| 화면 | URL |
|------|-----|
| 로그인 | `/login` |
| 인스펙션 목록 | `/inspection` |
| 인스펙션 날짜별 | `/inspection/date/:date` |
| 인스펙션 등록 | `/inspection/new` |
| 인스펙션 상세 | `/inspection/:id` |
| 인스펙션 수정 | `/inspection/:id/edit` |
| 인스펙션 설정 | `/inspection/settings` |
| 객실하자 목록 | `/defect` |
| 객실하자 등록 | `/defect/new` |
| 객실하자 상세 | `/defect/:id` |
| 객실하자 수정 | `/defect/:id/edit` |
| 객실하자 설정 | `/defect/settings` |
| 시설오더 목록 | `/facility-order` |
| 시설오더 날짜별 | `/facility-order/date/:date` |
| 시설오더 등록 | `/facility-order/new` |
| 시설오더 상세 | `/facility-order/:id` |
| 시설오더 수정 | `/facility-order/:id/edit` |
| 시설오더 설정 | `/facility-order/settings` |
| 인스펙션조회 | `/inspection-review` |
| 게시판 목록 | `/notice` |
| 게시판 등록 | `/notice/new` |
| 게시판 상세 | `/notice/:id` |
| 게시판 수정 | `/notice/:id/edit` |
| 직원목록 | `/staff` |
| 직원 상세 | `/staff/:id` |
| 통계/대시보드 | `/dashboard` |
| 설정 | `/settings` |
| 사용자 등록 | `/settings/users/new` |
| 사용자 수정 | `/settings/users/:id/edit` |

---

*설계서 끝 — 구현 지시 시 Phase 1부터 순차 진행*

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|---------|
| v3.3 | 2026-03-26 | 최초 작성 (Supabase 무료 플랜 최적화) |
| v3.4 | 2026-03-26 | 인증 구조 개선 (internal_email), facility_types 테이블 추가, RLS 전체 정책 작성, updated_at 트리거, notice_reads/notice_comments 추가, Storage Private 전환, Cron Edge Function 방식 변경, KST 타임존, AppHeader UI, localStorage 마스터 캐싱 전략 추가 |
| v3.5 | 2026-03-28 10:00 | 아키텍처 리뷰 반영 — 인스펙션 이미지 1400px/70%로 조정, thumb_path nullable 명시, facility_orders.status 값 통일(접수대기·접수중·완료), defects.category FK→TEXT 스냅샷 통일, 마스터 캐시 전략 변경(매번 fetch), page_settings localStorage 이관 결정, 목록 이미지 지연 로딩 명시, create-user Edge Function 명세 추가, Phase 1에 SW 뼈대 항목 추가 |
| v3.6 | 2026-03-28 11:00 | Phase 2-10 객실하자 CRUD 구현 (위치 다중선택·쉼표 저장), Phase 2-11 시설오더 CRUD 구현 (접수/완료 상태 버튼·이력 로그), 로드맵 상태 업데이트 |
| v3.7 | 2026-03-29 | Phase 3 전체 구현 완료 — 게시판·직원목록 CRUD, 인스펙션조회 재설계(다중선택 필터+등록시간), 대시보드 칸반보드(PC다단그리드+다중선택필터+빠른처리버튼), 설정페이지(푸시토글+층/객실마스터관리중앙화), PC사이드바 메인탭 추가, FAB 버그수정(중복·/new에서 수정아이콘), SW Workbox runtime caching, migration_v4(RLS개선), migration_v5(get_unresolved_stats 확장) |
| v3.8 | 2026-03-30 | Phase 4 고도화 완료 — 아바타 업로드, masterCache TTL 24h 재설계, 동적 인스펙션 상태 관리, 앱 운영 정책, 전역 헤더 알림 벨(NotificationDrawer), 전역 새로고침 버튼(refreshKey), PIN 6자리 통일, 유저등록/PIN변경 무한로딩 수정 |
| v3.9 | 2026-03-31 | 긴급오더(is_urgent), 시설오더→객실하자 이관(BottomSheet 2단계+트랜잭션 RPC+이미지 복사), facility_orders.status 접수중→처리중 통일, masterCache 중복 선언 버그 수정, migration_v6 |
