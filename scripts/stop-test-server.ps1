#!/usr/bin/env pwsh
# Stop the test pi-web server by PID recorded in .tmp/test-server.pid.
# Never kills the production server.
# Usage: pwsh -ExecutionPolicy Bypass -File scripts/stop-test-server.ps1

$ErrorActionPreference = "Stop"
$pidFile = ".\.tmp\test-server.pid"

if (-not (Test-Path $pidFile)) {
    Write-Warning "No test server PID file found. Is a test server running?"
    exit 1
}

$serverPid = Get-Content $pidFile -ErrorAction SilentlyContinue
if (-not $serverPid) {
    Write-Warning "PID file is empty."
    Remove-Item $pidFile -ErrorAction SilentlyContinue
    exit 1
}

$proc = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($proc) {
    Stop-Process -Id $serverPid -Force
    Write-Host "Test server stopped (PID $serverPid)"
} else {
    Write-Host "Test server (PID $serverPid) was already stopped."
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
