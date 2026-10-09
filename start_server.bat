@echo off
chcp 65001 > nul
title 눈싸움 게임 로컬 서버
cd /d "%~dp0"

echo ========================================================
echo     ❄️ 1:1 눈싸움 액션 게임 - 로컬 테스트 서버 ❄️
echo ========================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js 환경 감지됨.
    echo [OK] 브라우저(http://localhost:3000)를 엽니다...
    echo [i] 서버를 종료하려면 이 창을 닫거나 Ctrl + C 를 누르세요.
    echo --------------------------------------------------------
    timeout /t 1 >nul
    start "" "http://localhost:3000"
    node server.js
    goto end
)

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [!] Node.js 대신 Python 서버로 실행합니다...
    timeout /t 1 >nul
    start "" "http://localhost:3000"
    python -m http.server 3000
    goto end
)

echo [오류] Node.js 또는 Python이 설치되어 있지 않습니다.
echo Node.js를 설치해주세요: https://nodejs.org/
pause

:end
