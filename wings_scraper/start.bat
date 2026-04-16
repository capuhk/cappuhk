@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=%SCRIPT_DIR%python\python.exe"
set "PLAYWRIGHT_BROWSERS_PATH=%SCRIPT_DIR%browsers"

if not exist "%PYTHON_EXE%" (
    echo ERROR: Portable Python not found.
    echo Please run setup_portable.bat on internet-connected PC first.
    pause & exit /b 1
)

echo ================================================
echo  WINGS Scraper - Starting...
echo  Close this window to stop the scraper
echo ================================================
echo.

"%PYTHON_EXE%" "%SCRIPT_DIR%scraper.py"

pause
endlocal
