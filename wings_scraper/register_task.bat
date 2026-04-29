@echo off
setlocal

:: 관리자 권한 확인
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 관리자 권한으로 다시 실행해주세요.
    echo 이 파일을 우클릭 ^> "관리자 권한으로 실행"
    pause
    exit /b 1
)

set TASK_NAME=WINGS_Scraper_v2
set VBS_PATH=%~dp0start_v2_hidden.vbs

:: 기존 작업 삭제 후 재등록
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: 로그온 시 자동 시작, 창 숨김으로 등록
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "wscript.exe \"%VBS_PATH%\"" ^
  /sc ONLOGON ^
  /rl HIGHEST ^
  /f >nul

if %errorLevel% equ 0 (
    echo.
    echo 등록 완료!
    echo  - PC 켜면 자동 시작됩니다
    echo  - 지금 바로 시작하려면 Y 입력
    echo.
    set /p RUN_NOW=지금 바로 실행할까요? (Y/N):
    if /i "!RUN_NOW!"=="Y" (
        schtasks /run /tn "%TASK_NAME%"
        echo 스크래퍼 시작됨 (백그라운드 실행중)
    )
) else (
    echo 등록 실패 — 오류가 발생했습니다.
)

echo.
pause
endlocal
