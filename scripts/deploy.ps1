#!/usr/bin/env pwsh
# Deploy pi-web to production.
# Must be run from the dev repo root (h:\software\pi-web).
# Stops prod → copies new binary → starts prod.
# Usage: pwsh -ExecutionPolicy Bypass -File scripts/deploy.ps1

$ErrorActionPreference = "Stop"
$prodDir = "h:\software\pi-web-prod"
$prodExe = "$prodDir\pi-web.exe"
$devExe = ".\pi-web.exe"
$prodPidFile = "$prodDir\.tmp\prod-server.pid"
$port = 31415

# 1. Verify binary exists
if (-not (Test-Path $devExe)) {
    Write-Error "pi-web.exe not found. Run 'make build' first."
    exit 1
}

# 2. Stop prod server
Write-Host "Stopping prod server..."
if (Test-Path $prodPidFile) {
    $oldPid = Get-Content $prodPidFile -ErrorAction SilentlyContinue
    if ($oldPid) {
        $oldProc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($oldProc) {
            Stop-Process -Id $oldPid -Force
            Write-Host "  Stopped prod server (PID $oldPid)"
        }
    }
    Remove-Item $prodPidFile -ErrorAction SilentlyContinue
} else {
    # Fallback: kill by name (safe since we're the only prod)
    $procs = Get-Process -Name pi-web -ErrorAction SilentlyContinue | Where-Object {
        $_.MainWindowTitle -eq '' -and $_.StartTime -lt (Get-Date).AddMinutes(-1)
    }
    if ($procs) {
        $procs | Stop-Process -Force
        Write-Host "  Stopped prod server (fallback)"
    } else {
        Write-Host "  No prod server running."
    }
}
sleep 2

# 3. Copy binary + scripts to prod
Write-Host "Copying binary to prod..."
Copy-Item $devExe $prodExe -Force
Write-Host "  Deployed to $prodExe"

Write-Host "Copying scripts to prod..."
New-Item -ItemType Directory -Force -Path "$prodDir\scripts" | Out-Null
Copy-Item "scripts\*" "$prodDir\scripts\" -Force -Recurse
Write-Host "  Deployed scripts to $prodDir\scripts"

# 4. Start prod server
Write-Host "Starting prod server..."
$proc = Start-Process -FilePath $prodExe `
    -ArgumentList "-p $port" `
    -NoNewWindow -PassThru

# Wait for port
$deadline = (Get-Date).AddSeconds(10)
do {
    Start-Sleep -Milliseconds 400
    $match = (netstat -ano | Select-String "127\.0\.0\.1:$port\s+0\.0\.0\.0:0\s+LISTENING")
    if ($match) {
        $parts = $match.ToString().TrimEnd().Split([char[]]' ', [System.StringSplitOptions]::RemoveEmptyEntries)
        $serverPid = $parts[-1]
        New-Item -ItemType Directory -Force -Path "$prodDir\.tmp" | Out-Null
        $serverPid | Set-Content $prodPidFile -Force
        Write-Host "  Prod server running on http://localhost:$port (PID $serverPid)"
        exit 0
    }
    if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
        Write-Error "Server process exited unexpectedly"
        exit 1
    }
} while ((Get-Date) -lt $deadline)

Write-Error "Prod server did not start within 10 seconds"
exit 1
