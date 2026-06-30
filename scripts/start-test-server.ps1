#!/usr/bin/env pwsh
# Start a test pi-web server on port 31416 (auth disabled, localhost only).
# Records PID to .tmp/test-server.pid for safe shutdown.
# Usage: pwsh -ExecutionPolicy Bypass -File scripts/start-test-server.ps1

$ErrorActionPreference = "Stop"
$port = 31416
$pidFile = "h:\software\pi-web\.tmp\test-server.pid"
$exePath = "h:\software\pi-web\pi-web.exe"

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
New-Item -ItemType Directory -Force -Path "h:\software\pi-web\.tmp" | Out-Null

# Build env: copy current env, clear PI_WEB_TOKEN
$envCopy = @{}
Get-ChildItem env: | ForEach-Object { $envCopy[$_.Name] = $_.Value }
# Remove any auth tokens
$envCopy.Remove("PI_WEB_TOKEN")
$envCopy.Remove("PI_CODING_AUTH_TOKEN")
# Explicitly set empty
$envCopy["PI_WEB_TOKEN"] = ""

$proc = Start-Process -FilePath $exePath `
    -ArgumentList "-p $port -host 127.0.0.1" `
    -NoNewWindow -PassThru `
    -Environment $envCopy

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
