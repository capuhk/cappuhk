# Architecture Discussion — 하우스키핑 v3

---

# Claude의 의견

> 작성일: 2026-03-28
> 대상 문서: `housekeeping_v3_설계서_무료버전.md` v3.4
> 분류: 잠재적 버그 / 일관성 문제 / 개선 제안

---

## 1. DDL과 실제 동작 불일치 (잠재적 버그)

### 1-1. `inspection_images.thumb_path NOT NULL` 문제

DDL에는 `thumb_path TEXT NOT NULL`로 정의되어 있지만, 자동삭제 Edge Function이 삭제 후 `thumb_path = NULL`로 업데이트한다.

- **현상**: Edge Function이 실행될 때 NOT NULL 제약 위반으로 오류 발생 가능
- **확인 필요**: `migration_v2.sql`에서 `ALTER COLUMN thumb_path DROP NOT NULL`이 실행되었는지 검증
- **권장**: DDL 주석에 `-- 자동삭제 후 NULL 가능` 명시 또는 DDL 자체를 `thumb_path TEXT` (nullable)로 수정

### 1-2. `facility_orders.status` 값 불일치

| 위치 | 값 |
|------|-----|
| DDL CHECK 제약 | `'접수', '진행중', '완료'` |
| 설계서 12.3 / 로드맵 | `'접수대기', '접수중', '완료'` |
| Edge Function / 통계 RPC | `'접수', '진행중'` 혼용 |

- **권장**: DDL, 화면 명세, RPC 전체를 하나로 통일. `migration_v2.sql` 반영 여부 확인 필요

---

## 2. 마스터 캐시 — 멀티 기기 동기화 문제

현재 캐싱 전략은 **동일 기기, 단일 세션** 기준으로 동작한다.

- **문제**: A 기기(관리자)에서 구분·위치 마스터 변경 → B 기기(메이드)는 localStorage 캐시가 그대로라 구 데이터로 폼 렌더링
- **근본 원인**: 캐시에 만료(TTL)나 버전이 없음

**개선 방법 (선택지):**

1. ⭐ **베스트** — DB에 `master_version` 단일 숫자 컬럼 관리. 앱 포커스(visibilitychange) 시 버전 비교 → 다르면 해당 캐시만 무효화
2. 🔶 **중간** — TTL 방식: 캐시 저장 시 timestamp 기록, 앱 로드마다 1시간 초과면 재fetch
3. 설정 변경 후 "캐시 갱신 안내 토스트" 표시 (사용자가 수동 새로고침)
4. 캐시 없이 매번 fetch (MAU 3명이라 Supabase 무료 한도에 영향 없음)

> 현재 규모(3명)라면 **4번도 실용적 선택**이다.

---

## 3. Signed URL 목록 화면 성능

목록에서 이미지 썸네일을 표시할 때 카드 수만큼 Signed URL API를 호출한다.

- **인스펙션 목록**: 하루 60건 × 5장 = 최대 300번 Signed URL 호출 (1회 접속)
- **Bandwidth 소비**: Signed URL 생성 자체는 무료이나, 실제 이미지 로드가 모두 발생하면 10GB/월 한도에 영향

**권장사항:**

- 목록 화면에서는 이미지를 아예 표시하지 않거나 (현재 설계서 명세 재확인 필요)
- Intersection Observer로 뷰포트 진입 시에만 Signed URL 생성 + 이미지 로드 (지연 로딩)
- Signed URL 생성 결과를 컴포넌트 메모리에 캐싱 (React `useMemo` 또는 `Map`)

---

## 4. `defects` 테이블 — `division`/`location` 저장 방식 불일치

```sql
-- 현재 DDL
division   TEXT NOT NULL,   -- 텍스트 스냅샷
location   TEXT NOT NULL,   -- 텍스트 스냅샷
category_id UUID REFERENCES defect_categories(id)  -- FK
```

- `division`, `location`은 텍스트 스냅샷으로 저장 (마스터 삭제 후에도 이름 보존 목적)
- `category_id`는 FK로 저장 (마스터 삭제 시 NULL 처리)
- **일관성 없음**: 같은 "마스터에서 선택하는 값"인데 저장 방식이 다름

**권장**: `category_id` 도 텍스트 스냅샷(`category TEXT`)으로 통일하거나, 반대로 `division_id`/`location_id` FK + 소프트 삭제로 통일. 현재 소프트 삭제(`is_active=false`) 정책이 있으므로 FK 방식이 더 일관적.

---

## 5. admin / manager / supervisor 권한 분리 실익 없음

현재 설계:
> "관리자(admin) = 소장(manager) = 주임(supervisor) 완전 동일 권한"

- RLS, 화면 권한 매트릭스 모두 `is_manager()` 하나로 처리
- 3개 role이 존재하지만 실제로는 구분 의미 없음

**리스크**: 나중에 "주임은 삭제 불가" 같은 권한 분리가 생기면 RLS 전체를 수정해야 함.

**권장**: 지금은 그냥 두되, 향후 권한 분리 가능성이 있다면 `is_manager()` 대신 `get_role()` 헬퍼를 사용해 각 정책에서 role 비교를 명시적으로 작성하는 것을 검토. 확장성 측면에서 유리.

---

## 6. 사용자 계정 생성 Edge Function 명세 누락

설계서에 "사용자 생성: Edge Function 경유 (internal_email 자동 생성)"이라고만 명시되어 있고, 해당 Edge Function의 구체적인 명세가 없다.

- **우려**: `supabase.auth.admin.createUser()`는 `service_role` 키가 필요 → 브라우저에서 직접 호출 불가
- **필수 구현 사항**: Edge Function 이름, 입력 파라미터, internal_email 생성 로직, 에러 처리

**권장**: 설계서 섹션 17에 `create-user` Edge Function 명세 추가

---

## 7. `page_settings` — DB 저장 vs localStorage 저장

현재 `page_settings` 테이블은 사용자별 UI 설정(정렬 기준, 기본값 등)을 DB에 저장한다.

- **문제**: 매우 가벼운 개인 설정임에도 Supabase API 호출 발생
- **MAU 3명**이라 무료 한도 초과 우려는 없지만, 설정 변경마다 네트워크 비용 발생

**권장**: localStorage에 `user_{id}_settings` 키로 저장. DB 테이블 불필요.
단, 여러 기기 동기화가 필요하다면 DB 저장 유지.

---

## 8. `facility_order_log` 만 있고 인스펙션/하자 로그 없음

시설오더에는 상태 이력(`facility_order_log`)이 있지만, 인스펙션과 객실하자에는 없다.

- "누가 언제 완료 처리했는가" → `completed_by`, `completed_at` 컬럼으로 부분 대체 가능하지만, 중간 상태 변경 이력은 없음
- 현재 규모에서는 문제없지만, 감사(audit) 용도나 분쟁 처리 시 이력이 필요할 수 있음

**권장**: 필요하다면 `defect_log` 테이블 추가를 Phase 3에서 검토. 현재는 불필요.

---

## 9. 오프라인 지원 — 순서 재검토 권장

"오프라인 대응"이 핵심 가치(섹션 1.2)이지만 Phase 3-19(마지막)에 배치되어 있다.

- **리스크**: CRUD 구현 완료 후 오프라인 지원을 추가하면, 낙관적 업데이트(optimistic update) / 동기화 충돌 처리가 복잡해짐
- **현실**: 매일 사용하는 업무 앱이라 Supabase 비활성 정지(7일) 걱정은 없지만, 호텔 현장 WiFi 불안정 환경이 진짜 오프라인 필요성

**권장**: Phase 3 시작 전, 최소한 "읽기 캐싱(Service Worker Stale-While-Revalidate)" 정도는 설계에 포함.

---

## 10. 인스펙션 이미지 용량 — 재검토 권장

| 설정 | 현재 | 영향 |
|------|------|------|
| 해상도 | 1600px | 파일당 ~450KB |
| 보관기간 | 20일 | 최대 540MB (전체 1GB의 54%) |
| 보관 목적 | PC 전체화면 선명도 | |

- 인스펙션은 "당일 업무 확인"이 주 목적. 20일 후 열람 빈도는 낮음
- 1600px 해상도는 PC 전체화면 기준이지만, 실제 주 사용 기기가 모바일이라면 과도한 해상도
- **권장**: 1200px + 70% 품질로 낮추면 파일당 ~200KB로 절반 이하. 또는 보관기간 14일로 단축.

---

## 요약 — 우선순위별 조치 항목

| 우선순위 | 항목 | 유형 |
|:-------:|------|------|
| 🔴 즉시 | `thumb_path NOT NULL` vs NULL 업데이트 불일치 확인 | 잠재적 버그 |
| 🔴 즉시 | `facility_orders.status` 값 통일 | 잠재적 버그 |
| 🟠 구현 전 | `create-user` Edge Function 명세 작성 | 누락 명세 |
| 🟠 구현 전 | 목록 화면 이미지 지연 로딩 방침 결정 | 성능 |
| 🟡 나중에 | 마스터 캐시 TTL 또는 버전 전략 | 멀티 기기 |
| 🟡 나중에 | `defects.category_id` vs 텍스트 스냅샷 통일 | 일관성 |
| 🟢 선택 | `page_settings` localStorage 이관 | 최적화 |
| 🟢 선택 | 인스펙션 이미지 해상도/보관기간 재검토 | 용량 절감 |
