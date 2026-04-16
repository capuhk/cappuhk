@echo off
cd /d %~dp0
echo [%date% %time%] WINGS 스크래퍼 시작 >> scraper.log
python scraper.py
echo [%date% %time%] WINGS 스크래퍼 종료 >> scraper.log
