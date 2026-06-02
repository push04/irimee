@echo off
title VBHSR-SIM — Vande Bharat HSR Simulation Platform
color 1F
cls

echo.
echo  ============================================================
echo   VBHSR-SIM  ^|  Vande Bharat High Speed Rail Simulation
echo   IRIMEE Jamalpur  ^|  MAHSR Feasibility Platform
echo  ============================================================
echo.

:: ── Check Node.js ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    color 4F
    echo  [ERROR] Node.js not found.
    echo  Please install Node.js 18+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [OK]  Node.js %NODE_VER% found

:: ── Check npm ──────────────────────────────────────────────────────────────────
where npm >nul 2>&1
if errorlevel 1 (
    color 4F
    echo  [ERROR] npm not found.
    pause
    exit /b 1
)

:: ── Check .env ─────────────────────────────────────────────────────────────────
if not exist ".env.local" (
    echo.
    echo  [WARN] .env.local not found. Creating from template...
    copy ".env.example" ".env.local" >nul
    echo.
    echo  ============================================================
    echo   ACTION REQUIRED: Open .env.local and fill in:
    echo     NEXT_PUBLIC_SUPABASE_URL
    echo     NEXT_PUBLIC_SUPABASE_ANON_KEY
    echo     SUPABASE_SERVICE_ROLE_KEY
    echo     GROQ_API_KEY
    echo  ============================================================
    echo.
    echo  Press any key after filling .env.local to continue...
    pause >nul
)

:: ── Install dependencies ───────────────────────────────────────────────────────
if not exist "node_modules" (
    echo.
    echo  [....] Installing dependencies (first run only, ~60s)...
    call npm install --silent
    if errorlevel 1 (
        color 4F
        echo  [ERROR] npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo  [OK]  Dependencies installed
)

:: ── Launch dev server ─────────────────────────────────────────────────────────
echo.
echo  [....] Starting VBHSR-SIM development server...
echo.
echo  Dashboard will open at: http://localhost:3000
echo.
echo  Press Ctrl+C to stop the server.
echo.

:: Open browser after short delay (background task)
start /b cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"

:: Start Next.js dev server
call npm run dev

pause
