# WINGS PMS 스크래퍼 설치·운영 가이드

> 대상: WINGS 객실현황을 하우스키핑 앱에 연동하려는 담당자  
> 운영 환경: **Windows PC** (상시 켜져 있는 호텔 사무실 PC 권장)  
> 최종 업데이트: 2026-05-14

---

## 목차

1. [동작 원리](#1-동작-원리)
2. [사전 준비](#2-사전-준비)
3. [설치 방법](#3-설치-방법)
4. [최초 설정 (1회만)](#4-최초-설정-1회만)
5. [일상 실행](#5-일상-실행)
6. [운영 시간 설정](#6-운영-시간-설정)
7. [설정 파일 (`.env`)](#7-설정-파일-env)
8. [파일 구조](#8-파일-구조)
9. [코드 구조 설명](#9-코드-구조-설명)
10. [처음부터 다시 만들려면](#10-처음부터-다시-만들려면)
11. [문제 해결](#11-문제-해결)
12. [⚠️ 주의사항](#12-️-주의사항)

---

## 1. 동작 원리

```
WINGS PMS 웹 시스템
        │
        │  (Playwright 브라우저 자동화)
        │  로그인 → Room Indicator POST 요청 반복
        ▼
  Windows PC (스크래퍼 실행)
        │
        │  (Supabase Python SDK)
        │  객실 데이터 upsert
        ▼
  Supabase rooms 테이블
        │
        │  (30초 delta 폴링)
        ▼
  하우스키핑 앱 객실현황 페이지
```

**핵심 개념:**
- 스크래퍼는 WINGS에 실제 로그인한 브라우저 세션을 유지하면서, Room Indicator 페이지의 POST API 요청을 주기적으로 재실행
- WINGS API가 공개된 것이 아니므로, 최초 1회 사람이 직접 브라우저를 조작해 POST 요청을 캡처해두면 이후 자동으로 반복 실행
- 캡처된 정보는 `captured_request.json` 파일에 저장됨

---

## 2. 사전 준비

### 필요한 것

- [ ] **Windows PC** (호텔 사무실에 상시 켜져 있는 PC 권장)
- [ ] WINGS PMS 로그인 계정 (회사코드, 아이디, 비밀번호)
- [ ] Supabase **Service Role Key** (일반 Anon Key 아님 — RLS 우회 필요)
- [ ] 인터넷 연결

### Supabase Service Role Key 확인 방법

1. [supabase.com](https://supabase.com) → 프로젝트 선택
2. 좌측 메뉴 → **Settings** → **API**
3. `service_role` 키 복사 (⚠️ 절대 외부 공개 금지)

---

## 3. 설치 방법

### 방법 A: 자동 설치 (추천)

`wings_scraper` 폴더 안의 **`install.bat`** 을 더블클릭

자동으로 수행:
1. Python 3.11 설치 (없으면)
2. pip 업그레이드
3. 필요 패키지 설치 (`playwright`, `supabase`, `python-dotenv`)
4. Chromium 브라우저 설치
5. 스크래퍼 실행

### 방법 B: 수동 설치

```bash
# 1. Python 3.11 이상 설치 (python.org)

# 2. 패키지 설치
pip install -r requirements.txt

# 3. Playwright 브라우저 설치
playwright install chromium
```

### 필요 패키지 (`requirements.txt`)

```
playwright==1.44.0
supabase==2.4.6
python-dotenv==1.0.1
```

---

## 4. 최초 설정 (1회만)

### 4-1. `.env` 파일 생성

`wings_scraper/` 폴더 안에 **`.env`** 파일을 만들고 아래 내용 작성:

```env
# WINGS PMS 접속 정보
WINGS_LOGIN_URL=https://wings.kolon.com/pms
WINGS_URL=https://wings.kolon.com/pms/biz/fd01_2400_V50/searchListRoomIndicator.do
WINGS_COMPANY_ID=여기에_회사코드
WINGS_ID=여기에_아이디
WINGS_PW=여기에_비밀번호
PROPERTY_NO=11
BSNS_CODE=11

# Supabase 접속 정보
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...서비스롤키...

# 수집 간격 및 운영 시간
SCRAPE_INTERVAL=300
SCRAPE_HOUR_START=6
SCRAPE_MINUTE_START=30
SCRAPE_HOUR_END=22
SCRAPE_MINUTE_END=30
```

> ⚠️ `.env` 파일에 비밀번호와 키가 들어있으므로 외부에 공유하거나 깃에 올리지 말 것

### 4-2. 스크래퍼 최초 실행

```bash
python scraper_v2.py
```

또는 `run.bat` 더블클릭 (`scraper.py` 실행 — v2로 변경 필요)

### 4-3. 브라우저 조작 (최초 1회)

스크래퍼가 처음 실행되면:

1. **Chromium 브라우저가 자동으로 열리고 WINGS에 자동 로그인**
2. 터미널에 아래 메시지 표시:
   ```
   ============================================
     [최초 1회 설정] Room Indicator 페이지로 이동해주세요
     별표 메뉴 또는 메인 메뉴에서 Room Indicator 클릭
     이동 완료 후 터미널에서 Enter를 누르세요
   ============================================
   ```
3. **브라우저에서 WINGS → Room Indicator 메뉴로 이동**
4. 터미널에서 **Enter 키** 입력
5. 터미널에 아래 메시지 표시:
   ```
   >> 브라우저에서 새로고침(F5) 또는 새로고침 버튼을 클릭해주세요!
   ```
6. **브라우저에서 F5 또는 새로고침 버튼 클릭**
7. 터미널에 `POST 캡처 완료` 메시지 + `captured_request.json 저장 완료` 확인
8. 이후 **완전 자동 실행** 시작

### captured_request.json 저장 확인

`wings_scraper/captured_request.json` 파일이 생성됐으면 최초 설정 완료.

```json
{
  "url": "https://wings.kolon.com/pms/biz/...",
  "headers": { ... },
  "body": "PROPERTY_NO=11&BSNS_CODE=11&..."
}
```

---

## 5. 일상 실행

### 매일 실행

`captured_request.json` 파일이 있으면 다음부터는 **완전 자동**:

```bash
python scraper_v2.py
```

또는 `run.bat` 더블클릭

터미널에 다음과 같이 출력되면 정상:

```
2026-05-14 07:00:05 [INFO] WINGS 스크래퍼 v2 시작
2026-05-14 07:00:05 [INFO] captured_request.json 확인 — 완전 자동 모드
2026-05-14 07:00:06 [INFO] WINGS 로그인 시도: https://wings.kolon.com/pms
2026-05-14 07:00:10 [INFO] 로그인 성공
2026-05-14 07:00:11 [INFO] 초기 설정 완료 — 반복 수집 시작
2026-05-14 07:00:13 [INFO] 객실 데이터 수신: 120개
2026-05-14 07:00:14 [INFO] [07:00:14] upsert 완료: 120개 객실
2026-05-14 07:00:14 [INFO] 300초 대기 후 재시도...
```

### Windows 시작 프로그램에 등록 (자동 실행)

PC가 재시작돼도 자동으로 스크래퍼가 켜지게 하려면:

1. `Win + R` → `shell:startup` 입력 → 시작 프로그램 폴더 열기
2. `run.bat` 파일의 **바로가기** 만들어서 해당 폴더에 복사

---

## 6. 운영 시간 설정

`.env` 파일에서 수집 시간 범위 설정:

```env
SCRAPE_HOUR_START=6      # 시작 시각 (시)
SCRAPE_MINUTE_START=30   # 시작 시각 (분)  → 06:30 부터
SCRAPE_HOUR_END=22       # 종료 시각 (시)
SCRAPE_MINUTE_END=30     # 종료 시각 (분)  → 22:30 까지
```

- 운영 시간 외에는 60초마다 체크 후 대기
- 운영 시간 재진입 시 세션 갱신을 위해 자동 재로그인

---

## 7. 설정 파일 (`.env`)

| 키 | 설명 | 예시 |
|----|------|------|
| `WINGS_LOGIN_URL` | WINGS 로그인 URL | `https://wings.kolon.com/pms` |
| `WINGS_URL` | Room Indicator API URL | `https://wings.kolon.com/pms/biz/.../searchListRoomIndicator.do` |
| `WINGS_COMPANY_ID` | WINGS 로그인 회사코드 | `KH` |
| `WINGS_ID` | WINGS 로그인 아이디 | `housekeeping` |
| `WINGS_PW` | WINGS 로그인 비밀번호 | |
| `PROPERTY_NO` | 호텔 Property 번호 | `11` |
| `BSNS_CODE` | 사업장 코드 | `11` |
| `SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service Role Key | `eyJ...` |
| `SCRAPE_INTERVAL` | 수집 간격(초) | `300` (5분) |
| `SCRAPE_HOUR_START` | 운영 시작 시각(시) | `6` |
| `SCRAPE_MINUTE_START` | 운영 시작 시각(분) | `30` |
| `SCRAPE_HOUR_END` | 운영 종료 시각(시) | `22` |
| `SCRAPE_MINUTE_END` | 운영 종료 시각(분) | `30` |

---

## 8. 파일 구조

```
wings_scraper/
├── .env                    # 설정 파일 (직접 생성, 깃 업로드 금지)
├── config.py               # .env 로드 및 설정값 상수화
├── scraper_v2.py           # 메인 스크래퍼 (권장 버전)
├── scraper.py              # 구버전 (수동 설정 방식)
├── supabase_client.py      # Supabase rooms 테이블 upsert
├── requirements.txt        # Python 패키지 목록
├── install.bat             # 자동 설치 + 실행 스크립트
├── run.bat                 # 빠른 실행 스크립트
├── captured_request.json   # 자동 생성 (최초 설정 후)
├── scraper_v2.log          # 실행 로그 (자동 생성)
└── python/                 # 포터블 Python 런타임 (선택사항)
```

---

## 9. 코드 구조 설명

### `config.py` — 설정 로드

```python
# .env 파일에서 환경변수 로드
WINGS_URL        = os.getenv('WINGS_URL', '기본값')
SCRAPE_INTERVAL  = int(os.getenv('SCRAPE_INTERVAL', '300'))
```

### `scraper_v2.py` — 메인 로직

```
main()
├── setup(page)
│   ├── login(page)                   # WINGS 자동 로그인
│   └── capture_and_save(page)        # 최초: POST 캡처 저장
│                                     # 이후: captured_request.json 로드만
└── while True (무한 루프)
    ├── 운영 시간 체크
    ├── 운영 시간 재진입 시 재로그인
    ├── scrape_once(page)
    │   └── fetch_room_data(page)     # POST 재실행 → JSON 파싱
    │       └── upsert_rooms(rooms)   # Supabase 저장
    └── sleep(SCRAPE_INTERVAL)
```

### `login(page)` — WINGS 자동 로그인

WINGS는 ExtJS 기반 오래된 폼이라 일반 `fill()` 방식이 작동하지 않음.  
JavaScript로 값을 직접 주입하고 이벤트를 강제 발생시키는 방식 사용:

```python
await page.evaluate(f'''() => {{
    function setVal(id, value) {{
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event('input',  {{bubbles: true}}));
        el.dispatchEvent(new Event('change', {{bubbles: true}}));
    }}
    setVal('company',  '{WINGS_COMPANY_ID}');
    setVal('username', '{WINGS_ID}');
    setVal('userpw',   '{WINGS_PW}');
}}''')
await page.click('#btn_login')
```

### `fetch_room_data(page)` — 데이터 수집

```python
# captured_request.json의 URL과 body로 POST 재실행
response = await page.request.post(
    captured['url'],
    data=captured['body'],
    headers={ 'X-Requested-With': 'XMLHttpRequest', ... }
)
data = await response.json()
rows = data.get('rows') or data.get('list') or data.get('data') or []
```

### `supabase_client.py` — DB 저장

```python
# room_no 기준 upsert (있으면 업데이트, 없으면 삽입)
client.table('rooms').upsert(rooms, on_conflict='room_no').execute()
```

### WINGS JSON → Supabase 필드 매핑

| WINGS 필드 | Supabase 컬럼 | 변환 |
|-----------|--------------|------|
| `ROOM_NO` | `room_no` | 그대로 |
| `FLOOR_CODE` | `floor_code` | 그대로 |
| `ROOM_TYPE_CODE` | `room_type_code` | 그대로 |
| `ROOM_STS_TEXT` | `room_sts_text` | 그대로 (VD/VI/VC 등) |
| `CLEAN_STS_TEXT` | `clean_sts_text` | 그대로 (NG=청소중, OR=청소전) |
| `ARRV_DATE` | `arrv_date` | `20260413` → `2026-04-13` |
| `DEPT_DATE` | `dept_date` | 동일 변환 |
| `BALANCE_AMT` | `balance_amt` | 문자열 → 정수 |
| `INHS_GEST_NAME` | (수집 제외) | **개인정보 — 투숙객 이름 수집 금지** |

---

## 10. 처음부터 다시 만들려면

이 섹션은 스크래퍼를 새 PC에 구축하거나 처음부터 개발하는 경우의 가이드입니다.

### Step 1: 프로젝트 폴더 생성

```
wings_scraper/
├── .env
├── config.py
├── scraper_v2.py
├── supabase_client.py
└── requirements.txt
```

### Step 2: 패키지 설치

```bash
pip install playwright supabase python-dotenv
playwright install chromium
```

### Step 3: Supabase `rooms` 테이블 확인

테이블이 없으면 Supabase 대시보드 SQL Editor에서 생성:

```sql
CREATE TABLE rooms (
  room_no           TEXT PRIMARY KEY,
  floor_code        TEXT,
  room_type_code    TEXT,
  room_sts_text     TEXT,
  room_status       TEXT,
  inroom_status     TEXT,
  clean_sts_text    TEXT,
  arrv_date         DATE,
  dept_date         DATE,
  arrv_plan_time    TEXT,
  dept_plan_time    TEXT,
  nights            INTEGER,
  balance_amt       INTEGER,
  lsos_code         TEXT,
  room_sales_sts_text TEXT,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_rooms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- 실제 값이 변경됐을 때만 updated_at 갱신 (delta 폴링 최적화)
  IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_rooms_updated_at();
```

> ⚠️ `updated_at` 트리거가 실제 값 변경 시에만 갱신해야 앱의 delta 폴링이 정확히 동작함

### Step 4: RLS 설정

Service Role Key는 RLS를 우회하므로 별도 정책 불필요.  
앱(Anon Key)에서 읽기 전용 접근을 허용하려면:

```sql
-- 인증된 사용자만 읽기 허용
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read rooms"
ON rooms FOR SELECT
TO authenticated
USING (true);
```

### Step 5: WINGS Room Indicator URL 확인

WINGS 시스템마다 URL이 다를 수 있음. 브라우저 개발자 도구(F12) → Network 탭 → Room Indicator 로드 시 POST 요청 확인:

1. WINGS 로그인
2. Room Indicator 페이지 이동
3. F12 → Network → `searchListRoomIndicator.do` 요청 찾기
4. Request URL, Headers, Payload 복사 → `.env`에 반영

### Step 6: `captured_request.json` 구조 이해

```json
{
  "url": "https://wings.xxx.com/pms/biz/.../searchListRoomIndicator.do",
  "headers": {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "referer": "https://wings.xxx.com/pms/...",
    "user-agent": "Mozilla/5.0 ..."
  },
  "body": "PROPERTY_NO=11&BSNS_CODE=11&LDATE=&FLOOR_CODE=&..."
}
```

### Step 7: 응답 JSON 구조 확인

WINGS API 응답 형태 예시:

```json
{
  "rows": [
    {
      "ROOM_NO": "101",
      "FLOOR_CODE": "1",
      "ROOM_TYPE_CODE": "STD",
      "ROOM_STS_TEXT": "VD",
      "ROOM_STATUS": "V",
      "INROOM_STATUS_CODE": "D",
      "CLEAN_STS_TEXT": "OR",
      "ARRV_DATE": "20260514",
      "DEPT_DATE": "20260516",
      "NIGHTS": "2",
      "BALANCE_AMT": "320000",
      ...
    },
    ...
  ]
}
```

응답 키가 `rows`가 아닐 수 있음 → `scraper_v2.py`의 아래 코드가 자동 처리:

```python
rows = data.get('rows') or data.get('list') or data.get('data') or []
```

---

## 11. 문제 해결

### 로그인 실패

```
[WARNING] 로그인 실패 — URL 미변경
```

**확인사항:**
- `.env`의 `WINGS_ID`, `WINGS_PW`, `WINGS_COMPANY_ID` 오타 확인
- WINGS 비밀번호 만료 여부 확인
- WINGS URL이 변경됐는지 확인

---

### POST 캡처 실패 (60초 대기)

```
[WARNING] POST 캡처 실패 (60초 대기)
```

**확인사항:**
- 60초 안에 브라우저에서 Room Indicator 이동 + F5 클릭 필요
- WINGS URL에서 `searchListRoomIndicator.do` 패턴 확인
- URL이 다른 경우 `scraper_v2.py`의 아래 줄 수정:
  ```python
  if 'searchListRoomIndicator.do' in request.url and request.method == 'POST':
  ```

---

### JSON 파싱 실패 (세션 만료 의심)

```
[ERROR] JSON 파싱 실패 (세션 만료 의심): ... | 응답 앞 200자: <!DOCTYPE html>...
```

**원인:** 세션이 만료돼 WINGS가 HTML 로그인 페이지를 반환함  
**자동 처리:** 3회 연속 실패 시 자동 재로그인 시도  
**수동 처리:** 스크래퍼 재시작

---

### `captured_request.json` 삭제 후 재설정

1. `wings_scraper/captured_request.json` 삭제
2. 스크래퍼 재시작 → 브라우저 열림
3. [4. 최초 설정](#4-최초-설정-1회만) 과정 다시 진행

---

### Supabase upsert 실패

```
[ERROR] rooms upsert 실패: ...
```

**확인사항:**
- `SUPABASE_SERVICE_KEY`가 Service Role Key인지 확인 (Anon Key 아님)
- Supabase 프로젝트가 일시정지(Paused) 상태인지 확인 (Free Plan: 1주일 미접속 시 일시정지)
  - 해결: Supabase 대시보드에서 프로젝트 활성화

---

### WINGS 시스템 업그레이드 후 작동 안 함

WINGS URL 또는 POST body 구조가 바뀐 경우:

1. `captured_request.json` 삭제
2. 스크래퍼 재시작
3. 최초 설정 절차 다시 진행 (새 요청 캡처)

---

### 로그 확인

```bash
# 최근 로그 100줄 보기 (PowerShell)
Get-Content scraper_v2.log -Tail 100
```

---

## 12. ⚠️ 주의사항

### 보안

- **`.env` 파일은 절대 외부 공유 금지** — WINGS 비밀번호 + Supabase Service Key 포함
- **`SUPABASE_SERVICE_KEY`는 Service Role Key** — 이 키는 모든 RLS를 우회하므로 서버 환경에서만 사용
- `captured_request.json`에는 세션 헤더가 포함돼 있어 외부 노출 시 위험

### 개인정보

- WINGS의 `INHS_GEST_NAME`(투숙객 이름) 필드는 **의도적으로 수집 제외**
- 투숙객 개인정보를 앱 DB에 저장하지 않도록 `FIELD_MAP`에서 제외 상태 유지

### 운영

- **PC 절전 모드 해제** 필요 — 절전 모드 진입 시 스크래퍼 중단됨
  - 제어판 → 전원 옵션 → 절전 모드: 사용 안 함
- **WINGS 세션 공유 문제** — 동일 계정으로 다른 PC에서도 로그인하면 세션 충돌 가능
  - 스크래퍼 전용 WINGS 계정 생성 권장
- **수집 간격(`SCRAPE_INTERVAL`)** 기본 5분(300초). 너무 짧게 설정하면 WINGS 서버 부하 가능

### 한계

- WINGS API가 공식 공개된 것이 아니므로 WINGS 업데이트 시 재설정 필요
- 브라우저 자동화 방식이라 WINGS 화면 구조 변경 시 로그인 코드 수정 필요
- 단일 PC 의존 구조 — PC 꺼지면 실시간 동기화 중단 (앱에는 마지막 데이터 유지)

---

*이 가이드는 `wings_scraper/` 폴더의 실제 코드를 기반으로 작성됐습니다.*  
*문의: 개발 담당자에게 `scraper_v2.log` 파일과 함께 연락*
