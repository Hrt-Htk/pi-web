# pi-web Extension Design

**Date:** 2026-05-07  
**Project:** pi-web  
**Branch:** main (in-place, no worktree)  

## Overview

A single TypeScript extension (`extensions/pi-web.ts`) that registers three slash commands for the pi terminal:

| Command | Purpose |
|---------|---------|
| `/web` | Open the current session in the local browser |
| `/mobile` | Show a terminal QR code for mobile access over Tailscale |
| `/refresh` | Sync mobile-written messages back into the terminal session |

The extension is installed locally inside the pi-web repo at `extensions/pi-web.ts`.

---

## 1. Port & Host Detection

### 1.1 Pidfile (Primary)

`pi-web` writes a tiny JSON state file at startup:

**Path:** `~/.pi/agent/pi-web-state.json`

```json
{
  "pid": 12345,
  "port": "31483",
  "host": "100.64.0.10",
  "tailscale": true,
  "startedAt": "2026-05-07T10:00:00Z"
}
```

- `tailscale`: `true` when the bound host is a Tailscale IP (detected by `isTailscaleIP`).
- Written immediately after `http.ListenAndServe` succeeds.
- Removed on clean shutdown via `defer os.Remove(...)`.

### 1.2 Process Fallback

If the pidfile is missing or the PID is dead:

- **macOS/Linux:** `pgrep -a pi-web` → parse `-p <port>` and `-host <host>` from args.
- **Windows:** `Get-Process pi-web` (or `tasklist`) — if unavailable, assume default port `31483` on `127.0.0.1`.
- If no `-p` flag found in args, assume default port `31483`.
- If no `-host` flag found, assume `127.0.0.1`.

### 1.3 Health Check

Before any URL is opened, `fetch http://<host>:<port>` with `AbortSignal.timeout(1000)` confirms the server responds.

---

## 2. `/web` — Open Local Browser

1. Get `sessionId` from `basename(ctx.sessionManager.getSessionFile())`.
2. Detect host/port via **pidfile → process fallback**.
3. Health-check the server.
4. If unreachable: `ctx.ui.notify("pi-web not running. Start it with: pi-web -o", "error")`.
5. Construct `http://<host>:<port>/session?id=<sessionId>`.
6. Open with platform-appropriate command:
   - macOS: `open <url>`
   - Windows: `cmd /c start <url>`
   - Linux: `xdg-open <url>`
7. Notify success or warn on failure.

**Edge case:** If the detected host is a Tailscale IP, `/web` still works for local browser access (the browser can reach it if on the same Tailscale network, or the user may prefer localhost). The URL uses the detected host.

---

## 3. `/mobile` — Mobile Access via Tailscale

1. Detect host/port via the same mechanism.
2. **Tailscale check:**
   - If `tailscale: false` in pidfile (or host is not a Tailscale IP), show:
     > "pi-web is not running on a Tailscale IP. Install Tailscale, then start with: `PI_WEB_TOKEN=... pi-web --host $(tailscale ip -4)`"
   - If Tailscale is active, proceed.
3. Construct `http://<tailscale-ip>:<port>/session?id=<sessionId>`.
4. Generate a terminal QR code using the `qrcode` npm package with `type: 'terminal'` — this prints a scannable ANSI QR code directly in the pi TUI.
5. Print the URL below the QR code for manual entry fallback.
6. If `qrcode` package is not installed, gracefully fall back to just showing the URL.

**QR generation:**

```typescript
import QRCode from "qrcode";
const qrString = await QRCode.toString(url, { type: "terminal", small: true });
// Display via sendMessage or console output
```

---

## 4. `/refresh` — Sync Mobile Messages

1. Read the current session file from `ctx.sessionManager.getSessionFile()` using `loadEntriesFromFile()` (available from pi's session-manager module).
2. Count entries in the file vs. `ctx.sessionManager.getEntries().length`.
3. **If file has more entries:**
   - `ctx.ui.notify("Mobile added N new messages. Reloading session...", "info")`
   - `await ctx.switchSession(sessionFile)` — reloads the file into the terminal view.
4. **If no new entries:**
   - `ctx.ui.notify("Session is up to date.", "info")`
5. **If session is in-memory (no file):**
   - `ctx.ui.notify("Cannot refresh an in-memory session.", "error")`

---

## 5. Error Handling

| Scenario | Behavior |
|----------|----------|
| pi-web not running | Error notification with startup hint (`pi-web -o`) |
| Session is in-memory | Error: "Cannot view/refresh an in-memory session" |
| Tailscale not active for `/mobile` | Error with Tailscale startup instructions |
| QR package missing | Show URL only, no QR |
| Browser open fails | Warning with manual URL |
| Process detection fails on Windows | Fallback to `127.0.0.1:31483` |

---

## 6. Dependencies

- **Runtime dependency:** `qrcode` (npm package, ~135KB, MIT license) for terminal QR generation.
- `qrcode` supports Node.js, has zero native dependencies, and works in the pi extension runtime.
- If unavailable, `/mobile` degrades gracefully to URL-only output.

---

## 7. Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `extensions/pi-web.ts` | **Create** | The extension itself |
| `main.go` | **Modify** | Add pidfile write on startup |
| `docs/superpowers/specs/2026-05-07-pi-web-extension-design.md` | **Create** | This spec |

---

## 8. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  pi terminal                                                │
│  ┌─────────────────┐                                        │
│  │ /web handler    │──► detectHostPort() ──► open browser   │
│  │ /mobile handler │──► detectHostPort() ──► checkTailscale │
│  │                 │                         ──► QR + URL   │
│  │ /refresh handler│──► readFile() ──► count entries ──►   │
│  │                 │              switchSession() if new    │
│  └─────────────────┘                                        │
│            ▲                                                │
│            │ reads                                          │
│   ~/.pi/agent/pi-web-state.json                             │
│            ▲                                                │
│            │ writes                                         │
│   pi-web (Go server)                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Self-Review

- **No TBD/TODO placeholders.** All sections are complete.
- **Internal consistency:** Port detection is described consistently across all three commands.
- **Scope:** Focused on a single extension file + one pidfile addition to main.go. No tangential work.
- **Ambiguity:** The pidfile path is fixed. The process fallback is documented per-platform. QR fallback is explicit.
