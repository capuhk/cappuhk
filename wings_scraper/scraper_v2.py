import asyncio
import logging
import sys
import os
from datetime import datetime

# 스크립트 폴더를 모듈 검색 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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


async def go_to_room_indicator(page) -> bool:
    """
    Room Indicator 메뉴 이동.
    1단계: 좌측 상단 별표(즐겨찾기) 버튼 클릭 → 최근 메뉴 패널 오픈
    2단계: 패널에서 'Room Indicator' 링크 클릭
    """
    logger.info('Room Indicator 메뉴 클릭 시도')
    try:
        await asyncio.sleep(2)

        # 1단계: 별표(★/☆) 버튼 또는 즐겨찾기 관련 요소 클릭 → 메뉴 패널 열기
        star_clicked = await page.evaluate('''() => {
            const candidates = [...document.querySelectorAll('a, button, span, div, li')]
            for (const el of candidates) {
                const text = el.textContent.trim()
                const cls  = (el.className || '').toString().toLowerCase()
                if (text === '★' || text === '☆' ||
                    cls.includes('star') || cls.includes('shortcut') ||
                    cls.includes('favorite') || cls.includes('fav')) {
                    el.click()
                    return true
                }
            }
            return false
        }''')

        if star_clicked:
            logger.info('별표 버튼 클릭 — 메뉴 패널 오픈 대기')
            await asyncio.sleep(1.5)
        else:
            logger.info('별표 버튼 미발견 — Room Indicator 직접 탐색')

        # 2단계: 'Room Indicator' 텍스트 링크 클릭
        # textContent 사용 — hidden 요소도 포함해 탐색
        clicked = await page.evaluate('''() => {
            const links = [...document.querySelectorAll('a')]
            for (const el of links) {
                if ((el.textContent || '').trim() === 'Room Indicator') {
                    el.click()
                    return true
                }
            }
            return false
        }''')

        # Playwright locator fallback
        if not clicked:
            try:
                await page.get_by_text('Room Indicator', exact=True).first.click(timeout=5000)
                clicked = True
                logger.info('Room Indicator 클릭 완료 (locator fallback)')
            except Exception:
                pass

        if not clicked:
            logger.warning('Room Indicator 메뉴를 찾지 못함')
            return False

        await asyncio.sleep(3)
        logger.info('Room Indicator 이동 완료')
        return True

    except Exception as e:
        logger.warning(f'Room Indicator 이동 실패: {e}')
        return False


# 캡처된 POST 요청 정보 저장 (URL, headers, body)
_captured_request: dict | None = None


async def capture_first_post(page) -> bool:
    """
    Room Indicator 페이지에서 첫 POST 요청 자동 캡처.
    페이지 로드 시 자동으로 발생하는 POST를 기다림.
    30초 내 캡처 실패 시 False 반환.
    """
    global _captured_request
    captured = asyncio.Event()

    async def handle_request(request):
        if 'searchListRoomIndicator.do' in request.url and request.method == 'POST':
            global _captured_request
            _captured_request = {
                'url':     request.url,
                'headers': request.headers,
                'body':    request.post_data,
            }
            logger.info(f'POST 요청 캡처 완료: {request.url}')
            captured.set()

    page.on('request', handle_request)

    # 페이지 로드 시 자동 POST가 발생하지 않으면 페이지 새로고침으로 유도
    await asyncio.sleep(2)
    if not captured.is_set():
        logger.info('자동 POST 미발생 — 페이지 reload 시도')
        try:
            await page.reload(wait_until='domcontentloaded', timeout=15000)
        except Exception:
            pass

    try:
        await asyncio.wait_for(captured.wait(), timeout=30)
    except asyncio.TimeoutError:
        logger.warning('POST 캡처 실패 (30초 대기)')
        page.remove_listener('request', handle_request)
        return False

    page.remove_listener('request', handle_request)
    return True


async def fetch_room_data(page) -> list[dict]:
    """
    캡처된 POST 요청을 Playwright APIRequestContext로 직접 재실행.
    브라우저 세션 쿠키를 자동 공유하여 UI 조작 없이 반복 수집.
    """
    global _captured_request
    if not _captured_request:
        logger.error('캡처된 요청 없음')
        return []

    try:
        response = await page.request.post(
            _captured_request['url'],
            data=_captured_request['body'],
            headers={
                'Content-Type': _captured_request['headers'].get(
                    'content-type', 'application/x-www-form-urlencoded; charset=UTF-8'
                ),
                'Referer':          _captured_request['headers'].get('referer', ''),
                'User-Agent':       _captured_request['headers'].get('user-agent', ''),
                'X-Requested-With': 'XMLHttpRequest',
            },
        )

        if not response.ok:
            logger.warning(f'POST 응답 오류: {response.status}')
            return []

        data = await response.json()
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
    초기 설정 — 로그인 → Room Indicator 이동 → POST 캡처.
    실패 시 False 반환.
    """
    # 1. 자동 로그인
    ok = await login(page)
    if not ok:
        logger.error('로그인 실패 — 종료')
        return False

    # 2. Room Indicator 자동 이동
    ok = await go_to_room_indicator(page)
    if not ok:
        logger.error('Room Indicator 이동 실패 — 종료')
        return False

    # 3. 첫 POST 캡처
    logger.info('POST 요청 캡처 대기 중...')
    ok = await capture_first_post(page)
    if not ok:
        logger.error('POST 캡처 실패 — 종료')
        return False

    return True


async def main():
    """
    메인 루프 — 완전 자동화 버전.
    로그인 → Room Indicator → POST 캡처 → 반복 수집.
    세션 만료(3회 연속 실패) 시 자동 재로그인.
    """
    logger.info('WINGS 스크래퍼 v2 시작')

    async with async_playwright() as pw:
        # headless=False — 브라우저 표시 (동작 확인용)
        # 검증 완료 후 headless=True 로 변경하면 완전 백그라운드 실행
        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context()
        page    = await context.new_page()

        ok = await setup(page)
        if not ok:
            logger.error('초기 설정 실패 — 종료')
            await browser.close()
            return

        logger.info('초기 설정 완료 — 반복 수집 시작')
        fail_count       = 0
        was_outside_hours = False  # 운영 시간 외 대기 여부 추적

        while True:
            global _captured_request

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
                _captured_request = None
                ok = await setup(page)
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

                # 3회 연속 실패 시 자동 재로그인
                if fail_count >= 3:
                    logger.info('세션 만료 의심 — 자동 재로그인 시도')
                    _captured_request = None
                    ok = await setup(page)
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
