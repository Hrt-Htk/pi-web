# Issue #6 Debug Log — Messages Disappear on New Sessions

## Problem Statement

When creating a new session and sending a message, the conversation (user message + assistant reply) disappears after streaming completes. This happens for sessions created from the "sessions" page when providing an actual project path.

## Root Cause Analysis

### Confirmed Facts

1. **Session files DO contain messages** — verified by reading `.jsonl` files directly
2. **API returns all entries** — `curl` to `/api/session?id=...` returns 8 entries including 2 messages
3. **`pi` worker sends `done` events BEFORE flushing to disk** — real `pi` timing differs from stub
4. **File-watcher reload fires mid-stream or before disk flush** — ~1-2s gap between streaming completion and entries on disk

### Timeline (from E2E test, latest run)

```
t+0.00s  msgs=1 list=0 pHost=2 pending=Y preview=yes(0ch)    <- initial state
t+0.25s  msgs=1 list=0 pHost=2 pending=Y preview=yes(0ch)    <- streaming started, no content yet
...
t+5.50s  msgs=1 list=0 pHost=2 pending=Y preview=yes(0ch)    <- still waiting
t+5.75s  msgs=1 list=0 pHost=2 pending=Y preview=yes(24ch) "Hello! 👋 How can I help..."  <- content arrives
t+6.00s  msgs=1 list=0 pHost=0 pending=n preview=no           <- PREVIEW CLEARED, nothing in #messages
t+6.25s+ msgs=1 list=0 pHost=0 pending=n preview=no           <- EMPTY forever
```

**Key metrics:**
- `msgs=1` — `#messages.children.length` = 1 (just `#messages-list` div)
- `list=0` — `#messages-list.children.length` = 0 (NO `<SessionEntry>` rendered)
- `pHost=2` → `pHost=0` — preview host had 2 children (pending user + preview), then wiped to 0
- `preview=yes(24ch)` → `preview=no` — preview had content, then disappeared at t+6.00s

### The Core Problem

`#messages-list` has **0 children throughout the entire test**. The model's `activePath` is empty, so `<SessionContent>` renders nothing.

## What Was Tried

### 1. Shrink Guard in `reconcile()`

**File:** `web/src/session/data/session-data.svelte.js`

Added guards to prevent `reconcile()` from replacing the model with stale data:

```js
if (entries.length < this.entries.length) return;  // shrink guard
if (entries.length === this.entries.length && entries[entries.length - 1]?.id === this.entries[this.entries.length - 1]?.id) return;  // no-op guard
```

**Result:** Did not fix the issue. The model's `activePath` is empty from the start.

### 2. Preview Container Isolation

**File:** `web/src/components/session/SessionShell.svelte`

Created `#chat-preview-host` outside `#messages` to isolate preview from Svelte re-renders:

```html
<div id="messages">
  <SessionContent model={sessionModel} afterRender={contentRuntime.afterRender} live />
</div>
<div id="chat-preview-host"></div>
```

**Result:** Preview is correctly isolated, but preview is cleared at t+6.00s while `#messages-list` is empty, so messages still disappear.

### 3. Moved `clearChatPreview()` from Reload to `done` Event

**File:** `web/src/session/live/live-events.js`

Removed `clearChatPreview()` from `handleSessionReload()` and placed it in the `chat-preview done` event handler:

```js
// Old: clear on reload (fires too early, before disk flush)
// New: clear on done (fires when streaming completes)
```

**Result:** Preview is cleared at t+6.00s (when `done` fires), but `#messages-list` is still empty, so messages disappear.

### 4. Only Clear Preview When Canonical Entry Exists

**File:** `web/src/session/live/live-events.js`

Changed `handleSessionReload()` to only clear preview when a reload brings a canonical assistant entry with actual content:

```js
if (hasCanonicalAssistant(entries)) {
  clearChatPreview();
}
```

**Result:** Did not fix the issue. The underlying problem is that `#messages-list` has 0 entries.

### 5. Stub Worker Timing Fix

**File:** `e2e/lib/stub-pi/pi`

Modified stub to match real `pi` timing (events first, disk write after 300ms delay).

**Result:** Confirmed the real `pi` binary is used in tests (not stub), so this didn't affect results.

### 6. Server Restart with Latest Binary

Rebuilt Go binary with `-a` flag to force re-embed of latest frontend. Verified server serves `app-CeMqoBiC.js` (correct hash).

**Result:** Test runs with latest code, but issue persists.

## What Works

1. **Messages are written to disk** — verified via file inspection
2. **API returns all entries** — verified via curl
3. **Preview renders during streaming** — `preview=yes(24ch)` at t+5.75s
4. **No console errors** — test captures show no errors/warnings

## What Doesn't Work

1. **`#messages-list` renders 0 entries** — model's `activePath` is empty
2. **Preview disappears at t+6.00s** — cleared by `done` handler
3. **Messages never appear after preview clears** — nothing in `#messages-list` to show

## Current Hypothesis

The model's `activePath` is empty because `currentLeafId` is empty. The API doesn't return `leafId`, and the initial load path doesn't compute it from entries.

### Evidence

- API response: `leafId: ?` (not present)
- `sessionResponseMap()` in `internal/server/handlers.go` does NOT include `leafId`
- `sessionBootstrap()` may not either
- `SessionDataModel.fromPayload()` sets `leafId = payload?.leafId || ''`
- If `leafId` is empty, `currentLeafId` is empty
- `activePath = $derived(getPath(this.currentLeafId, this.byId))` — empty when `currentLeafId` is empty

### Why It Worked Before

The old code (before this branch) may have had a different flow:
- Pending user preview rendered inside `#messages` (counted as a child)
- `reconcile()` may have set `currentLeafId` correctly
- Or the initial bootstrap included `leafId`

## Files Modified on This Branch

| File | Change |
|------|--------|
| `web/src/session/live/live-events.js` | Moved `clearChatPreview` from reload to `done` handler |
| `web/src/session/live/live-events.test.js` | Updated tests |
| `web/src/session/live/live-connection.js` | Added `clearChatPreview` param |
| `web/src/components/session/LiveReload.svelte` | Passed `clearChatPreview` to setup |
| `web/src/components/session/SessionShell.svelte` | Added `#chat-preview-host` |
| `web/src/session/data/session-data.svelte.js` | Shrink/no-op guards in `reconcile()` |
| `web/src/session/data/session-data.svelte.test.js` | Updated tests |
| `e2e/tests/new-session-observe.spec.ts` | Added diagnostics |
| `e2e/lib/stub-pi/pi` | Timing fix |

## Next Steps

1. **Check why `activePath` is empty** — trace from initial page load through `fromPayload()` → `#hydrate()` → `currentLeafId` → `activePath`
2. **Check if `reconcile()` sets `currentLeafId`** — it has logic to find the last entry, but only if `entries.length > this.entries.length`
3. **Check if the initial load uses bootstrap or API fetch** — bootstrap might not include `leafId`
4. **Check if `buildTree` / `getPath` handle empty `currentLeafId`** — might need to default to the last message entry
5. **Compare with main branch** — check if `activePath` logic changed recently

## Test Commands

```bash
# Rebuild everything
export PATH="$PATH:/c/Users/HTK/go/bin"
cd H:/Software/pi-web
go build -a -ldflags="-s -w -X main.version=$(git describe --tags --always --dirty)" -o pi-web.exe ./cmd/pi-web

# Kill old server
cmd /c "wmic process where \"name='pi-web.exe'\" call terminate"

# Start new server
nohup ./pi-web.exe > /tmp/pi-web.log 2>&1 &

# Verify correct JS hash
curl -s http://127.0.0.1:31415/ | grep -o 'app-[A-Za-z0-9_-]*\.js'

# Run E2E test
cd e2e && /c/nvm4w/nodejs/npx.cmd playwright test tests/new-session-observe.spec.ts --project="Desktop Chrome" --reporter=line --config=playwright-real.config.ts

# Check API response
curl -s "http://127.0.0.1:31415/api/session?id=SESSION_ID.jsonl" | python -m json.tool

# Check session file
cat "$HOME/.pi/agent/sessions/--H--Software-pi-web--/SESSION_ID.jsonl"
```

## Branch Info

- **Branch:** `fix/messages-disappear-new-session`
- **Commit:** `c571746`
- **Issue:** https://github.com/Hrt-Htk/pi-web/issues/6
