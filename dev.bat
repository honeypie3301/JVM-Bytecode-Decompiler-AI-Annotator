@echo off
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [JadAI] Node.js is not installed or not in PATH.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [JadAI] Installing missing dependencies...
    call npm install
)

if exist "dist\" rmdir /s /q "dist"
if "%JADAI_PORT%"=="" set "JADAI_PORT=4730"
set "PORT=%JADAI_PORT%"
echo [JadAI] Starting Vite dev server at http://localhost:%JADAI_PORT%...
call npm run dev
if errorlevel 1 pause
