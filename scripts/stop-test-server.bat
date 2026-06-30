@echo off
setlocal
set PID_FILE=h:\software\pi-web\.tmp\test-server.pid

if not exist "%PID_FILE%" (
    echo WARNING: No test server PID file found.
    exit /b 1
)

set /p SERVER_PID=<"%PID_FILE%"
taskkill /PID %SERVER_PID% /F >nul 2>&1
if not errorlevel 1 (
    echo Test server stopped (PID %SERVER_PID%)
) else (
    echo Test server (PID %SERVER_PID%) was already stopped.
)
del "%PID_FILE%" 2>nul
