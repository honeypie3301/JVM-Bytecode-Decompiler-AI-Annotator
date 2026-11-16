@echo off
cd /d "%~dp0"

if not exist "node_modules\" (
    echo [JadAI] Installing missing dependencies...
    call npm install
)

call npm run build
if errorlevel 1 (
    echo [JadAI] Build failed. Checking dependencies...
    call npm install
    call npm run build
    if errorlevel 1 (
        pause
        exit /b 1
    )
)

set "NODE_ENV=production"
if "%JADAI_PORT%"=="" set "JADAI_PORT=4730"
set "PORT=%JADAI_PORT%"

where pm2 >nul 2>&1
if %errorlevel% equ 0 (
    call pm2 restart jadai --update-env >nul 2>&1 || call pm2 start dist/server.cjs --name jadai --node-args="--expose-gc --max-old-space-size=512" >nul 2>&1
    echo [JadAI] Server restarted via PM2 at http://localhost:%JADAI_PORT%
    for /f "tokens=*" %%a in ('git log -1 --oneline 2^>nul') do echo Latest Commit: %%a
    goto end
)

:fallback
echo [JadAI] Starting server at http://localhost:%JADAI_PORT%...
if exist "dist\server.cjs" (
    node --expose-gc --max-old-space-size=512 dist/server.cjs
) else (
    call npx tsx server.ts
)

:end
