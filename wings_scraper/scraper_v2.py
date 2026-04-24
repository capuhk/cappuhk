import asyncio
import logging
import sys
import os
import json
from datetime import datetime

# 스크립트 폴더를 모듈 검색 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# POST 캡처 정보 저장 파일 — 최초 1회 수동 캡처 후 자동으로 재사용
CAPTURED_REQUEST_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'captured_request.json')

from playwright.async_api import async_playwright
from config import (
    WINGS_LOGIN_URL, WINGS_URL,
    WINGS_COMPANY_ID, WINGS_ID, WINGS_PW,
    PROPERTY_NO, BSNS_CODE,
    SCRAPE_INTERVAL, SCRAPE_HOUR_START, SCRAPE_HOUR_END,
)
from supabase_client import upsert_rooms

# 로그 설정 — 콘솔 + 파일 동시 출력
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('scraper_v2.log', encoding='utf-8'),
    ]
)
logger = logging.getLogger(__name__)

# WINGS JSON 필드 → Supabase 컬럼 매핑
FIELD_MAP = {
    'ROOM_NO':              'room_no',
    'FLOOR_CODE':           'floor_code',
    'ROOM_TYPE_CODE':       'room_type_code',
    'ROOM_STS_TEXT':        'room_sts_text',
    'ROOM_STATUS':          'room_status',
    'INROOM_STATUS_CODE':   'inroom_status',
    # 'INHS_GEST_NAME' 수집 제외 — 투숙객 이름은 개인정보
    'ARRV_DATE':            'arrv_date',
    'DEPT_DATE':            'dept_date',
    'ARRV_PLAN_TIME':       'arrv_plan_time',
    'DEPT_PLAN_TIME':       'dept_plan_time',
    'NIGHTS':               'nights',
    'BALANCE_AMT':          'balance_amt',
    'LSOS_CODE':            'lsos_code',
    'ROOM_SALES_STS_TEXT':  'room_sales_sts_text',
    'CLEAN_STS_TEXT':       'clean_sts_text',       # 청소 상태 (NG=청소중, OR=청소전 등)
}


def parse_date(value: str) -> str | None:
    """WINGS 날짜 형식(20260413) → ISO 형식(2026-04-13) 변환"""
    if not value or len(value) != 8:
        return None
    try:
        return f'{value[:4]}-{value[4:6]}-{value[6:8]}'
    except Exception:
        return None


def map_room(raw: dict) -> dict:
    """WINGS JSON row → Supabase rooms row 변환"""
    row = {}
    for wings_key, db_col in FIELD_MAP.items():
        val = raw.get(wings_key)

        # 날짜 컬럼 변환
        if db_col in ('arrv_date', 'dept_date'):
            val = parse_date(val)

        # 잔액 컬럼 — 숫자 변환 (빈 문자열 처리)
        elif db_col == 'balance_amt':
            try:
                val = int(val) if val else None
            except (ValueError, TypeError):
                val = None

        # 빈 문자열 → None 통일
        elif val == '':
            val = None

        row[db_col] = val

    return row


async def login(page) -> bool:
    """
    WINGS 자동 로그인.
    JS로 값을 직접 주입 + 이벤트 강제 발생 (ExtJS 오래된 폼 대응).
    성공 여부 반환.
    """
    logger.info(f'WINGS 로그인 시도: {WINGS_LOGIN_URL}')
    await page.goto(WINGS_LOGIN_URL, wait_until='domcontentloaded', timeout=30000)
    await asyncio.sleep(1)

    # JS로 필드 값 주입 + 이벤트 강제 발생
    await page.evaluate(f'''() => {{
        function setVal(id, value) {{
            const el = document.getElementById(id);
            if (!el) return;
            el.value = value;
            el.dispatchEvent(new Event('focus',  {{bubbles: true}}));
            el.dispatchEvent(new Event('input',  {{bubbles: true}}));
            el.dispatchEvent(new Event('change', {{bubbles: true}}));
            el.dispatchEvent(new Event('blur',   {{bubbles: true}}));
        }}
        setVal('company',  '{WINGS_COMPANY_ID}');
        setVal('username', '{WINGS_ID}');
        setVal('userpw',   '{WINGS_PW}');
    }}''')
    await asyncio.sleep(0.5)

    # 로그인 버튼 클릭
    await page.click('#btn_login')
    logger.info('로그인 버튼 클릭')

    # 로그인 완료 대기 — URL에서 login이 사라질 때까지
    try:
        await page.wait_for_url(lambda url: 'login' not in url, timeout=15000)
        logger.info('로그인 성공')
        return True
    except Exception:
        logger.warning('로그인 실패 — URL 미변경')
        return False


async def capture_and_save(page) -> bool:
    """
    최초 1회 수동 설정.
    사용자가 브라우저에서 Room Indicator 페이지로 이동 후 Enter →
    새로고침 클릭 → POST 자동 캡처 → captured_request.json 저장.
    이후 scraper_v2 는 파일을 읽어 완전 자동으로 동작.
    """
    print('\n============================================')
    print('  [최초 1회 설정] Room Indicator 페이지로 이동해주세요')
    print('  별표 메뉴 또는 메인 메뉴에서 Room Indicator 클릭')
    print('  이동 완료 후 터미널에서 Enter를 누르세요')
    print('============================================')

    await asyncio.get_event_loop().run_in_executor(
        None, input, '\nRoom Indicator 이동 완료 후 Enter...'
    )

    print('\n>> 브라우저에서 새로고침(F5) 또는 새로고침 버튼을 클릭해주세요!')
    logger.info('POST 캡처 대기 중 — 브라우저 새로고침 필요')

    captured_event = asyncio.Event()
    result: dict = {}

    async def handle_request(request):
        if 'searchListRoomIndicator.do' in request.url and request.method == 'POST':
            result['url']     = request.url
            result['headers'] = dict(request.headers)
            result['body']    = request.post_data
            logger.info(f'POST 캡처 완료: {request.url}')
            captured_event.set()

    page.on('request', handle_request)
    try:
        await asyncio.wait_for(captured_event.wait(), timeout=60)
    except asyncio.TimeoutError:
        logger.warning('POST 캡처 실패 (60초 대기)')
        return False
    finally:
        page.remove_listener('request', handle_request)

    # captured_request.json 저장 → 이후 자동 replay 에 사용
    try:
        with open(CAPTURED_REQUEST_FILE, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        logger.info(f'captured_request.json 저장 완료 → 이후 완전 자동 실행')
    except Exception as e:
        logger.error(f'파일 저장 실패: {e}')
        return False

    return True


def load_captured_request() -> dict | None:
    """captured_request.json 로드. 파일 없거나 오류 시 None 반환."""
    if not os.path.exists(CAPTURED_REQUEST_FILE):
        return None
    try:
        with open(CAPTURED_REQUEST_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        logger.info(f'캡처 파일 로드: {data.get("url")}')
        return data
    except Exception as e:
        logger.warning(f'캡처 파일 로드 실패: {e}')
        return None


async def fetch_room_data(page) -> list[dict]:
    """
    captured_request.json 의 URL·body 로 POST 재실행.
    브라우저 세션 쿠키 자동 공유 — 로그인된 세션에서 직접 API 호출.
    """
    captured = load_captured_request()
    if not captured:
        logger.error('캡처 파일 없음 — setup() 에서 수동 캡처 필요')
        return []

    try:
        response = await page.request.post(
            captured['url'],
            data=captured['body'],
            headers={
                'Content-Type': captured['headers'].get(
                    'content-type', 'application/x-www-form-urlencoded; charset=UTF-8'
                ),
                'Referer':          captured['headers'].get('referer', ''),
                'User-Agent':       captured['headers'].get('user-agent', ''),
                'X-Requested-With': 'XMLHttpRequest',
            },
        )

        if not response.ok:
            logger.warning(f'POST 응답 오류: {response.status}')
            return []

        try:
            data = await response.json()
        except Exception as e:
            # JSON 파싱 실패 시 응답 앞부분 출력 (세션 만료 진단)
            text = await response.text()
            logger.error(f'JSON 파싱 실패 (세션 만료 의심): {e} | 응답 앞 200자: {text[:200]}')
            return []

        rows = data.get('rows') or data.get('list') or data.get('data') or []
        if not rows:
            logger.warning(f'응답에 데이터 없음 — 키 목록: {list(data.keys())}')
            return []

        logger.info(f'객실 데이터 수신: {len(rows)}개')
        return [map_room(r) for r in rows]

    except Exception as e:
        logger.error(f'fetch_room_data 실패: {e}')
        return []


async def scrape_once(page) -> bool:
    """1회 스크래핑 실행. 성공 여부 반환."""
    try:
        rooms = await fetch_room_data(page)
        if not rooms:
            return False

        count = upsert_rooms(rooms)
        logger.info(f'[{datetime.now().strftime("%H:%M:%S")}] upsert 완료: {count}개 객실')
        return True

    except Exception as e:
        logger.error(f'스크래핑 실패: {e}')
        return False


async def setup(page) -> bool:
    """
    초기 설정 — 자동 로그인 후:
    - captured_request.json 있으면: 완전 자동 (파일 로드만)
    - 없으면: 수동 1회 안내 → POST 캡처 → 파일 저장
    """
    # 자동 로그인
    ok = await login(page)
    if not ok:
        logger.error('로그인 실패')
        return False

    # 캡처 파일 없으면 최초 1회 수동 설정
    if not os.path.exists(CAPTURED_REQUEST_FILE):
        logger.info('captured_request.json 없음 — 최초 수동 설정 시작')
        ok = await capture_and_save(page)
        if not ok:
            logger.error('수동 캡처 실패')
            return False
        logger.info('수동 설정 완료 — 이후 완전 자동 실행')
    else:
        logger.info('captured_request.json 확인 — 완전 자동 모드')

    return True


async def main():
    """
    메인 루프.
    최초 1회: 자동 로그인 → 수동 Room Indicator 이동 → POST 캡처·저장
    이후: 자동 로그인 → POST replay 반복 수집
    세션 만료(3회 연속 실패) 시 캡처 파일 삭제 후 재설정.
    """
    logger.info('WINGS 스크래퍼 v2 시작')

    async with async_playwright() as pw:
        # captured_request.json 있으면 headless=True (완전 백그라운드)
        # 없으면 headless=False (수동 설정 시 브라우저 조작 필요)
        has_capture = os.path.exists(CAPTURED_REQUEST_FILE)
        browser = await pw.chromium.launch(headless=has_capture)
        context = await browser.new_context()
        page    = await context.new_page()

        ok = await setup(page)
        if not ok:
            logger.error('초기 설정 실패 — 종료')
            await browser.close()
            return

        logger.info('초기 설정 완료 — 반복 수집 시작')
        fail_count        = 0
        was_outside_hours = False  # 운영 시간 외 대기 여부 추적

        while True:
            # 운영 시간대 체크
            current_hour = datetime.now().hour
            in_hours     = SCRAPE_HOUR_START <= current_hour < SCRAPE_HOUR_END

            if not in_hours:
                if not was_outside_hours:
                    logger.info(f'운영 시간 종료 ({current_hour}시) — {SCRAPE_HOUR_START}~{SCRAPE_HOUR_END}시까지 대기')
                was_outside_hours = True
                await asyncio.sleep(60)
                continue

            # 운영 시간 재진입 시 세션 만료 가정 → 강제 재로그인
            if was_outside_hours:
                was_outside_hours = False
                logger.info('운영 시간 재진입 — 세션 갱신을 위해 재로그인')
                ok = await login(page)
                if not ok:
                    logger.error('재로그인 실패 — 60초 후 재시도')
                    await asyncio.sleep(60)
                    continue
                fail_count = 0
                logger.info('재로그인 성공 — 수집 재개')

            success = await scrape_once(page)

            if success:
                fail_count = 0
            else:
                fail_count += 1
                logger.warning(f'연속 실패 {fail_count}회')

                # 3회 연속 실패 → 세션 만료 의심 → 재로그인
                if fail_count >= 3:
                    logger.info('세션 만료 의심 — 재로그인 시도')
                    ok = await login(page)
                    if ok:
                        fail_count = 0
                        logger.info('재로그인 성공')
                    else:
                        logger.error('재로그인 실패 — 60초 후 재시도')
                        await asyncio.sleep(60)
                        continue

            logger.info(f'{SCRAPE_INTERVAL}초 대기 후 재시도...')
            await asyncio.sleep(SCRAPE_INTERVAL)


if __name__ == '__main__':
    asyncio.run(main())
