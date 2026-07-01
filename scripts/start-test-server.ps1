#!/usr/bin/env pwsh
# Start a test pi-web server on port 31416, launched exactly like prod (plain
# Start-Process, full inherited environment) but with the -dev flag: auth disabled,
# loopback bind, no Tailscale Serve. Serves the real agent dir, same as prod.
# Records PID to .tmp/test-server.pid for safe shutdown.
# Usage: pwsh -ExecutionPolicy Bypass -File scripts/start-test-server.ps1

param()

$ErrorActionPreference = "Stop"
$port = 31416
$repoRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repoRoot '.tmp\test-server.pid'
$exePath = Join-Path $repoRoot 'pi-web.exe'

# Check if already running
if (Test-Path $pidFile) {
    $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($oldPid) {
        $oldProc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($oldProc) {
            Write-Warning "Test server already running (PID $oldPid). Stop it first."
            exit 1
        }
    }
}

if (-not (Test-Path $exePath)) {
    Write-Error "pi-web.exe not found. Run 'make build' first."
    exit 1
}

# Ensure .tmp exists
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot '.tmp') | Out-Null

$proc = Start-Process -FilePath $exePath `
    -ArgumentList "-p $port -dev" `
    -NoNewWindow -PassThru

# Wait for port
$deadline = (Get-Date).AddSeconds(10)
do {
    Start-Sleep -Milliseconds 400
    $match = (netstat -ano | Select-String "127\.0\.0\.1:$port\s+0\.0\.0\.0:0\s+LISTENING")
    if ($match) {
        $parts = $match.ToString().TrimEnd().Split([char[]]' ', [System.StringSplitOptions]::RemoveEmptyEntries)
        $serverPid = $parts[-1]
        $serverPid | Set-Content $pidFile -Force
        Write-Host "Test server running on http://127.0.0.1:$port (PID $serverPid)"
        exit 0
    }
    if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
        Write-Error "Server process exited unexpectedly"
        exit 1
    }
} while ((Get-Date) -lt $deadline)

Write-Error "Test server did not start within 10 seconds"
exit 1
