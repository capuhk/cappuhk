@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PYTHON_DIR=%SCRIPT_DIR%python"
set "BROWSERS_DIR=%SCRIPT_DIR%browsers"

echo ================================================
echo  WINGS Scraper - Portable Setup
echo  Run this on the INTERNET-connected PC first
echo ================================================
echo.

if exist "%PYTHON_DIR%\python.exe" goto install_packages

echo [1/4] Downloading portable Python...
curl -L -o "%SCRIPT_DIR%python_embed.zip" https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip
if %errorlevel% neq 0 ( echo ERROR: Download failed. & pause & exit /b 1 )

echo [2/4] Extracting...
mkdir "%PYTHON_DIR%"
tar -xf "%SCRIPT_DIR%python_embed.zip" -C "%PYTHON_DIR%"
del "%SCRIPT_DIR%python_embed.zip"

echo import site>> "%PYTHON_DIR%\python311._pth"

curl -L -o "%SCRIPT_DIR%get-pip.py" https://bootstrap.pypa.io/get-pip.py
"%PYTHON_DIR%\python.exe" "%SCRIPT_DIR%get-pip.py" --quiet
del "%SCRIPT_DIR%get-pip.py"
echo [Done] Python ready

:install_packages
echo.
echo [3/4] Installing packages...
"%PYTHON_DIR%\python.exe" -m pip install -r "%SCRIPT_DIR%requirements.txt" --quiet
if %errorlevel% neq 0 ( echo ERROR: pip install failed. & pause & exit /b 1 )
echo [Done] Packages installed

echo.
echo [4/4] Installing Chromium browser...
set "PLAYWRIGHT_BROWSERS_PATH=%BROWSERS_DIR%"
"%PYTHON_DIR%\python.exe" -m playwright install chromium
if %errorlevel% neq 0 ( echo ERROR: Browser install failed. & pause & exit /b 1 )
echo [Done] Browser installed

echo.
echo ================================================
echo  Setup complete!
echo  Copy the wings_scraper folder to internal PC
echo  then run start.bat
echo ================================================
pause
endlocal
