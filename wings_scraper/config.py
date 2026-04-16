import os
from dotenv import load_dotenv

# 같은 폴더의 .env 파일 로드
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# WINGS PMS 설정
WINGS_URL       = os.getenv('WINGS_URL', 'https://wings.kolon.com/pms/biz/fd01_2400_V50/searchListRoomIndicator.do')
WINGS_LOGIN_URL = os.getenv('WINGS_LOGIN_URL', 'https://wings.kolon.com/pms')
WINGS_COMPANY_ID = os.getenv('WINGS_COMPANY_ID', '')  # 3번째 로그인 항목 (회사코드)
WINGS_ID        = os.getenv('WINGS_ID', '')
WINGS_PW        = os.getenv('WINGS_PW', '')
PROPERTY_NO     = os.getenv('PROPERTY_NO', '11')
BSNS_CODE       = os.getenv('BSNS_CODE', '11')

# Supabase 설정
SUPABASE_URL         = os.getenv('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')  # Service Role Key (upsert 권한 필요)

# 스크래핑 간격 (초)
SCRAPE_INTERVAL = int(os.getenv('SCRAPE_INTERVAL', '300'))  # 기본 5분
