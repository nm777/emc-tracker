@echo off
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo Node.js is not installed.
  echo Please install it from https://nodejs.org ^(download the LTS version^)
  echo Then run this script again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -v 2^>nul') do (
  set NODE_VER=%%v
)
set NODE_VER=%NODE_VER:v=%
if %NODE_VER% lss 18 (
  echo Node.js version is too old. Please update to version 18 or newer.
  echo Download it from https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo Starting EMC Tracker...
echo.

start "" http://localhost:3000

node server.js

echo.
echo Server stopped.
pause
