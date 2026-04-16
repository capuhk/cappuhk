from supabase import create_client
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
import logging

logger = logging.getLogger(__name__)

# Service Role Key로 클라이언트 생성 (RLS 우회하여 upsert 가능)
_client = None

def get_client():
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


def upsert_rooms(rooms: list[dict]) -> int:
    """
    객실 데이터를 rooms 테이블에 upsert.
    room_no 기준으로 중복 처리 (있으면 업데이트, 없으면 삽입).
    성공한 row 수 반환.
    """
    if not rooms:
        logger.warning('upsert 대상 객실 데이터 없음')
        return 0

    try:
        client = get_client()
        result = client.table('rooms').upsert(
            rooms,
            on_conflict='room_no'  # room_no 기준 upsert
        ).execute()

        count = len(result.data) if result.data else 0
        logger.info(f'rooms upsert 완료: {count}개')
        return count

    except Exception as e:
        logger.error(f'rooms upsert 실패: {e}')
        raise
