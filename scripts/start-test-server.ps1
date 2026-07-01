#!/usr/bin/env pwsh
# Start a test pi-web server on port 31416 (auth disabled, localhost only).
# Records PID to .tmp/test-server.pid for safe shutdown.
# Uses an isolated throwaway agent dir (.tmp/test-agent) mirrored from real sessions.
# Usage: pwsh -ExecutionPolicy Bypass -File scripts/start-test-server.ps1 [-NoRefresh]

param([switch]$NoRefresh)

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

# Isolated test agent dir — mirrors real sessions on startup
$testAgentDir    = Join-Path $repoRoot '.tmp\test-agent'
$testSessionsDir = Join-Path $testAgentDir 'sessions'
New-Item -ItemType Directory -Force -Path $testSessionsDir | Out-Null

# Mirror real sessions into the isolated dir (unless -NoRefresh)
$realSessions = Join-Path $HOME '.pi\agent\sessions'
if ($NoRefresh) {
    Write-Host "Skipping session refresh (-NoRefresh); reusing existing test copy."
} elseif (Test-Path $realSessions) {
    Write-Host "Mirroring real sessions into test sandbox (first run ~300 MB, then incremental)..."
    robocopy $realSessions $testSessionsDir /MIR /NFL /NDL /NJH /NJS /NC /NS /NP /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) {
        Write-Warning "robocopy reported a failure (exit $LASTEXITCODE); continuing with existing copy."
    }
    $global:LASTEXITCODE = 0
} else {
    Write-Warning "Real sessions dir not found ($realSessions); starting with empty test sessions."
}

# Build env: copy current env, clear PI_WEB_TOKEN
$envCopy = @{}
Get-ChildItem env: | ForEach-Object { $envCopy[$_.Name] = $_.Value }
# Remove any auth tokens
$envCopy.Remove("PI_WEB_TOKEN")
$envCopy.Remove("PI_CODING_AUTH_TOKEN")
# Explicitly set empty
$envCopy["PI_WEB_TOKEN"] = ""
# Point at isolated agent dir
$envCopy["PI_CODING_AGENT_DIR"] = $testAgentDir

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
        Write-Host "  Data dir (isolated mirror): $testAgentDir"
        exit 0
    }
    if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
        Write-Error "Server process exited unexpectedly"
        exit 1
    }
} while ((Get-Date) -lt $deadline)

Write-Error "Test server did not start within 10 seconds"
exit 1
