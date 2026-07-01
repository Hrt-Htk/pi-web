@echo off
setlocal
set PORT=31416
set SCRIPT_DIR=%~dp0
set PID_FILE=%SCRIPT_DIR%..\.tmp\test-server.pid
set EXE=%SCRIPT_DIR%..\pi-web.exe

if not exist "%EXE%" (
    echo ERROR: pi-web.exe not found. Run make build first.
    exit /b 1
)

mkdir "%SCRIPT_DIR%..\.tmp" 2>nul

REM Isolated test agent dir — mirrors real sessions on startup
set "PI_CODING_AGENT_DIR=%~dp0..\.tmp\test-agent"
if not exist "%PI_CODING_AGENT_DIR%\sessions" mkdir "%PI_CODING_AGENT_DIR%\sessions"
robocopy "%USERPROFILE%\.pi\agent\sessions" "%PI_CODING_AGENT_DIR%\sessions" /MIR /NFL /NDL /NJH /NJS /NC /NS /NP /R:1 /W:1 >nul

REM Check if already running
if exist "%PID_FILE%" (
    set /p OLD_PID=<"%PID_FILE%"
    tasklist /FI "PID eq %OLD_PID%" 2>nul | findstr "%OLD_PID%" >nul
    if not errorlevel 1 (
        echo WARNING: Test server already running (PID %OLD_PID%). Stop it first.
        exit /b 1
    )
)

REM Start with auth disabled
set PI_WEB_TOKEN=
set PI_CODING_AUTH_TOKEN=
start /b "" "%EXE%" -p %PORT% -host 127.0.0.1

REM Wait for port
set COUNT=0
:WAIT
timeout /t 1 /nobreak >nul
netstat -ano | findstr "127.0.0.1:%PORT%.*LISTENING" >nul
if not errorlevel 1 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:%PORT%.*LISTENING"') do (
        echo %%a > "%PID_FILE%"
        echo Test server running on http://127.0.0.1:%PORT% (PID %%a)
    )
    exit /b 0
)
set /a COUNT+=1
if %COUNT% LSS 20 goto WAIT

echo ERROR: Test server did not start within 20 seconds
exit /b 1
