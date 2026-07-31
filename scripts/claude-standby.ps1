<#
.SYNOPSIS
  Boot a fresh Claude Code worker in orchestrator mode, pre-loaded with a
  "standby" prompt — ready for remote-control and waiting for directives.
.DESCRIPTION
  Reuses the claude-hook-bridge engine (Ensure-ClaudeSession / Submit-Fire).
  Each call creates a NEW worker (target name includes a timestamp to avoid
  collisions). Registers the session with the Claude app via /remote-control.
.PARAMETER Cwd
  Working directory for the Claude session. Defaults to the caller's cwd.
.PARAMETER Dev
  Dev mode flag. When set, only logs what *would* be done — does NOT boot Claude.
.EXAMPLE
  .\scripts\claude-standby.ps1 -Cwd "C:\Users\HTK\projects\my-repo"
  .\scripts\claude-standby.ps1 -Dev  # dry run
#>
[CmdletBinding()]
param(
    [string]$Cwd = (Get-Location).Path,
    [switch]$Dev
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [System.Text.Encoding]::UTF8

# Reuse the bridge engine.
$bridge = 'C:\Users\HTK\.pi\agent\skills\claude-hook-bridge'
. (Join-Path $bridge 'claude-tui.ps1')

$psmux = Resolve-Psmux $null

# Unique target per invocation so multiple standby sessions don't collide.
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = "claude-standby-$ts"

if ($Dev) {
    [Console]::Error.WriteLine("[claude-standby] DEV MODE — would boot session '$target' in '$Cwd'")
    [Console]::Error.WriteLine("[claude-standby] DEV MODE — would submit: /orchestrator standby, I am going to give you directives")
    [pscustomobject]@{
        target  = $target
        cwd     = $Cwd
        dev     = $true
        message = "dry run — no session created"
    } | ConvertTo-Json -Compress
    exit 0
}

# Boot the worker session.
$uuid = Ensure-ClaudeSession -Target $target -PsmuxPath $psmux -Cwd $Cwd

# Submit the standby prompt in orchestrator mode.
$prompt = "/orchestrator standby, I am going to give you directives"
Submit-Fire -Target $target -PsmuxPath $psmux -Text $prompt

[Console]::Error.WriteLine("[claude-standby] session '$target' (uuid=$uuid) is ready — attach with: psmux attach -t $target")

[pscustomobject]@{
    target  = $target
    uuid    = $uuid
    cwd     = $Cwd
    attach  = "psmux attach -t $target"
} | ConvertTo-Json -Compress
