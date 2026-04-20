import asyncio
import json
import logging
import sys
import os
import time
from datetime import datetime

# 스크립트 폴더를 모듈 검색 경로에 추가 (다른 위치에서 실행해도 config 임포트 가능)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright, Response
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
    터미널에서 Enter 누르면 수집 시작.
    """
    logger.info(f'WINGS 로그인 페이지 열기: {WINGS_LOGIN_URL}')
    await page.goto(WINGS_LOGIN_URL, wait_until='domcontentloaded', timeout=30000)

    print('\n============================================')
    print('  1. 브라우저에서 WINGS 로그인 완료')
    print('  2. Room Indicator 페이지로 이동')
    print('  3. 터미널에서 Enter 를 누르면 수집 시작')
    print('============================================')

    # 터미널 Enter 입력 대기 (비동기로 처리)
    await asyncio.get_event_loop().run_in_executor(None, input, '\n준비되면 Enter 키를 누르세요...')

    logger.info('수집 시작')


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
    Room Indicator 페이지의 첫 번째 새로고침 버튼 클릭 → 응답 캡처.
    """
    captured = []

    async def handle_response(response: Response):
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

    page.on('response', handle_response)

    # 아이콘 줄 첫 번째 버튼(새로고침) 클릭
    # WINGS Room Indicator 상단 툴바 첫 번째 버튼
    refresh_selectors = [
        'button.refresh',
        'button[title*="refresh"]',
        'button[title*="새로고침"]',
        'button[title*="Refresh"]',
        '.toolbar button:first-child',
        '.tool-bar button:first-child',
        '.btn-refresh',
        'span.x-btn-icon-el:first-child',
    ]

    clicked = False
    for selector in refresh_selectors:
        btn = page.locator(selector)
        if await btn.count() > 0:
            await btn.first.click()
            clicked = True
            logger.info(f'새로고침 버튼 클릭: {selector}')
            break

    if not clicked:
        logger.warning('새로고침 버튼 못 찾음 — F5 키 시도')
        await page.keyboard.press('F5')

    # 데이터 로드 대기 (최대 15초)
    for _ in range(30):
        if captured:
            break
        await asyncio.sleep(0.5)

    page.remove_listener('response', handle_response)

    if not captured:
        logger.warning('객실 데이터 캡처 실패')
        return []

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

        # 수동 로그인 + Room Indicator 이동 대기
        await wait_for_manual(page)

        # 첫 POST 요청 캡처 (이후 재실행에 사용)
        logger.info('POST 요청 캡처 중 — Room Indicator 페이지에서 데이터가 로드되길 기다립니다...')
        ok = await capture_request(page)
        if not ok:
            logger.error('POST 요청 캡처 실패 — 종료')
            return

        # 페이지 내 클릭 가능한 요소 목록 출력 (새로고침 버튼 찾기용)
        print('\n=== 페이지 요소 분석 ===')
        elements = await page.evaluate('''() => {
            const tags = ['button','a','span','div','img','input']
            const results = []
            for (const tag of tags) {
                for (const el of document.querySelectorAll(tag)) {
                    const onclick = el.getAttribute('onclick') || ''
                    const cls = el.className || ''
                    const id = el.id || ''
                    const title = el.title || ''
                    const text = (el.innerText || '').trim().slice(0, 20)
                    if (onclick || title.toLowerCase().includes('refresh') ||
                        cls.toLowerCase().includes('refresh') ||
                        cls.toLowerCase().includes('reload') ||
                        title.toLowerCase().includes('조회') ||
                        onclick.toLowerCase().includes('search') ||
                        onclick.toLowerCase().includes('refresh')) {
                        results.push(tag + ' | id=' + id + ' | class=' + cls + ' | title=' + title + ' | onclick=' + onclick.slice(0,50) + ' | text=' + text)
                    }
                }
            }
            return results
        }''')
        for el in elements:
            print(el)
        print('=== 분석 끝 ===\n')

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
