import asyncio
import logging
import sys
import os
from datetime import datetime

# 스크립트 폴더를 모듈 검색 경로에 추가 (다른 위치에서 실행해도 config 임포트 가능)
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
        logging.FileHandler('scraper.log', encoding='utf-8'),
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


async def wait_for_manual(page):
    """
    로그인 + Room Indicator 이동을 수동으로 처리.
    터미널에서 Enter 누르면 POST 리스너 등록 후 새로고침 버튼 클릭 안내.
    """
    logger.info(f'WINGS 로그인 페이지 열기: {WINGS_LOGIN_URL}')
    await page.goto(WINGS_LOGIN_URL, wait_until='domcontentloaded', timeout=30000)

    print('\n============================================')
    print('  1. 브라우저에서 WINGS 로그인 완료')
    print('  2. Room Indicator 페이지로 이동')
    print('  3. 터미널에서 Enter')
    print('  4. 브라우저에서 새로고침 버튼 클릭')
    print('============================================')

    await asyncio.get_event_loop().run_in_executor(None, input, '\nRoom Indicator 이동 후 Enter 누르세요...')
    print('>> 이제 브라우저에서 새로고침 버튼을 클릭해주세요!')
    logger.info('POST 요청 대기 중 — 브라우저에서 새로고침 버튼 클릭 필요')


# 캡처된 POST 요청 정보 저장 (URL, headers, body)
_captured_request: dict | None = None


async def capture_request(page) -> bool:
    """
    첫 수동 로드 시 searchListRoomIndicator.do POST 요청을 캡처.
    이후 replay_request()로 재실행.
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

    try:
        await asyncio.wait_for(captured.wait(), timeout=30)
    except asyncio.TimeoutError:
        logger.warning('POST 요청 캡처 실패 (30초 대기)')
        return False
    finally:
        page.remove_listener('request', handle_request)

    return True


async def fetch_room_data(page) -> list[dict]:
    """
    캡처된 POST 요청을 Playwright APIRequestContext로 직접 재실행.
    브라우저 UI 클릭 없이 세션 쿠키를 자동 공유하여 반복 수집 가능.
    """
    global _captured_request
    if not _captured_request:
        logger.error('캡처된 요청 없음 — capture_request() 먼저 실행 필요')
        return []

    try:
        # Playwright APIRequestContext는 브라우저 세션(쿠키 포함)을 자동 공유
        response = await page.request.post(
            _captured_request['url'],
            data=_captured_request['body'],  # 원본 form-encoded POST body
            headers={
                'Content-Type': _captured_request['headers'].get(
                    'content-type', 'application/x-www-form-urlencoded; charset=UTF-8'
                ),
                'Referer':    _captured_request['headers'].get('referer', ''),
                'User-Agent': _captured_request['headers'].get('user-agent', ''),
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
    """
    1회 스크래핑 실행.
    성공 여부 반환.
    """
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


async def main():
    """
    메인 루프 — 로그인 후 SCRAPE_INTERVAL 간격으로 반복 스크래핑.
    세션 만료 또는 오류 시 재로그인.
    """
    logger.info('WINGS 스크래퍼 시작')

    async with async_playwright() as pw:
        # headless=False — 세션 유지에 유리하고 디버깅 편의
        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context()
        page    = await context.new_page()

        # 수동 로그인 + Room Indicator 이동 대기
        await wait_for_manual(page)

        # 첫 POST 요청 캡처 (이후 재실행에 사용)
        logger.info('POST 요청 캡처 중 — Room Indicator 페이지에서 데이터가 로드되길 기다립니다...')
        ok = await capture_request(page)
        if not ok:
            logger.error('POST 요청 캡처 실패 — 종료')
            return

        fail_count = 0  # 연속 실패 횟수

        while True:
            # 운영 시간대 체크 (SCRAPE_HOUR_START ~ SCRAPE_HOUR_END 범위 밖이면 대기)
            current_hour = datetime.now().hour
            if not (SCRAPE_HOUR_START <= current_hour < SCRAPE_HOUR_END):
                logger.info(f'운영 시간 외 ({current_hour}시) — {SCRAPE_HOUR_START}시~{SCRAPE_HOUR_END}시 운영. 60초 대기...')
                await asyncio.sleep(60)
                continue

            success = await scrape_once(page)

            if success:
                fail_count = 0
            else:
                fail_count += 1
                logger.warning(f'연속 실패 {fail_count}회')

                # 3회 연속 실패 시 수동 재로그인 요청
                if fail_count >= 3:
                    logger.info('수동 재로그인 필요')
                    try:
                        await wait_for_manual(page)
                        fail_count = 0
                    except Exception as e:
                        logger.error(f'재로그인 실패: {e}')

            logger.info(f'{SCRAPE_INTERVAL}초 대기 후 재시도...')
            await asyncio.sleep(SCRAPE_INTERVAL)


if __name__ == '__main__':
    asyncio.run(main())
