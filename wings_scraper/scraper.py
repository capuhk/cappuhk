import asyncio
import json
import logging
import time
from datetime import datetime
from playwright.async_api import async_playwright, Response
from config import (
    WINGS_LOGIN_URL, WINGS_URL,
    WINGS_COMPANY_ID, WINGS_ID, WINGS_PW,
    PROPERTY_NO, BSNS_CODE,
    SCRAPE_INTERVAL,
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
    'INHS_GEST_NAME':       'inhs_gest_name',
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


async def login(page):
    """WINGS PMS 로그인 — 회사코드 + ID + PW 3단계"""
    logger.info(f'WINGS 로그인 시도: {WINGS_LOGIN_URL}')
    await page.goto(WINGS_LOGIN_URL, wait_until='networkidle', timeout=30000)

    # 로그인 폼 입력 (실제 selector는 WINGS 페이지 구조에 따라 조정 필요)
    # 회사코드 입력
    if WINGS_COMPANY_ID:
        company_input = page.locator('input[name="companyId"], input[id*="company"], input[placeholder*="회사"]').first
        if await company_input.count() > 0:
            await company_input.fill(WINGS_COMPANY_ID)

    # ID 입력
    await page.locator('input[name="userId"], input[type="text"][id*="id"], input[placeholder*="아이디"]').first.fill(WINGS_ID)

    # PW 입력
    await page.locator('input[name="userPw"], input[type="password"]').first.fill(WINGS_PW)

    # 로그인 버튼 클릭
    await page.locator('button[type="submit"], input[type="submit"], button:has-text("로그인")').first.click()

    # 로그인 완료 대기
    await page.wait_for_load_state('networkidle', timeout=15000)
    logger.info('WINGS 로그인 완료')


async def fetch_room_data(page) -> list[dict]:
    """
    Room Indicator 페이지에서 네트워크 인터셉트로 JSON 캡처.
    캡처된 데이터를 Supabase 형식으로 변환하여 반환.
    """
    captured = []

    async def handle_response(response: Response):
        # searchListRoomIndicator.do 응답만 처리
        if 'searchListRoomIndicator.do' not in response.url:
            return
        try:
            data = await response.json()
            rows = data.get('rows') or data.get('list') or data.get('data') or []
            if rows:
                logger.info(f'객실 데이터 캡처: {len(rows)}개')
                captured.extend(rows)
        except Exception as e:
            logger.warning(f'응답 파싱 실패: {e}')

    # 응답 리스너 등록
    page.on('response', handle_response)

    # Room Indicator 페이지로 이동 (이미 로그인된 상태)
    logger.info(f'Room Indicator 페이지 이동: {WINGS_URL}')
    await page.goto(WINGS_URL, wait_until='networkidle', timeout=30000)

    # 데이터 로드 대기 (최대 10초)
    for _ in range(20):
        if captured:
            break
        await asyncio.sleep(0.5)

    # 리스너 제거
    page.remove_listener('response', handle_response)

    if not captured:
        logger.warning('객실 데이터 캡처 실패 — 응답 없음')
        return []

    # WINGS 형식 → Supabase 형식 변환
    return [map_room(r) for r in captured]


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

        # 최초 로그인
        await login(page)

        fail_count = 0  # 연속 실패 횟수

        while True:
            success = await scrape_once(page)

            if success:
                fail_count = 0
            else:
                fail_count += 1
                logger.warning(f'연속 실패 {fail_count}회')

                # 3회 연속 실패 시 재로그인 시도
                if fail_count >= 3:
                    logger.info('재로그인 시도')
                    try:
                        await login(page)
                        fail_count = 0
                    except Exception as e:
                        logger.error(f'재로그인 실패: {e}')

            logger.info(f'{SCRAPE_INTERVAL}초 대기 후 재시도...')
            await asyncio.sleep(SCRAPE_INTERVAL)


if __name__ == '__main__':
    asyncio.run(main())
