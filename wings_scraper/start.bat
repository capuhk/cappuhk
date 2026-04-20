@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

set PYTHON_EXE=%~dp0python\python.exe
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers

if not exist "%PYTHON_EXE%" (
    echo ERROR: Portable Python not found.
    echo Please run setup_portable.bat first.
    pause
    exit /b 1
)

echo WINGS Scraper Starting...
echo Close this window to stop.
echo.

"%PYTHON_EXE%" scraper.py

pause
endlocal
