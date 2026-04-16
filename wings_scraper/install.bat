@echo off
chcp 65001 >nul
echo ================================================
echo   WINGS 스크래퍼 설치 및 실행
echo ================================================
echo.

:: Python 설치 여부 확인
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/4] Python이 없습니다. 자동 설치를 시작합니다...
    echo.

    :: Python 3.11 설치 파일 다운로드
    curl -o python_installer.exe https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe
    if %errorlevel% neq 0 (
        echo [오류] Python 다운로드 실패. 인터넷 연결을 확인하세요.
        pause
        exit /b 1
    )

    :: 자동 설치 (PATH 등록 포함)
    python_installer.exe /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
    del python_installer.exe

    :: PATH 갱신
    call refreshenv >nul 2>&1
    set "PATH=%PATH%;C:\Python311;C:\Python311\Scripts"

    python --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo [오류] Python 설치 후에도 인식되지 않습니다.
        echo 터미널을 닫고 다시 열어서 install.bat을 실행해주세요.
        pause
        exit /b 1
    )
    echo [완료] Python 설치 성공
) else (
    echo [1/4] Python 확인 완료
    python --version
)
echo.

:: pip 업그레이드
echo [2/4] pip 업그레이드 중...
python -m pip install --upgrade pip --quiet
echo [완료] pip 업그레이드
echo.

:: 패키지 설치
echo [3/4] 필요 패키지 설치 중... (잠시 기다려주세요)
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [오류] 패키지 설치 실패. 인터넷 연결을 확인하세요.
    pause
    exit /b 1
)
echo [완료] 패키지 설치
echo.

:: Playwright 브라우저 설치
echo [4/4] 브라우저 설치 중... (수십 초 소요)
playwright install chromium
if %errorlevel% neq 0 (
    echo [오류] 브라우저 설치 실패.
    pause
    exit /b 1
)
echo [완료] 브라우저 설치
echo.

echo ================================================
echo   설치 완료! 스크래퍼를 시작합니다.
echo   (창을 닫으면 스크래퍼가 중지됩니다)
echo ================================================
echo.

:: 스크래퍼 실행
python scraper.py

pause
