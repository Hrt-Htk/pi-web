# Investigation handoff — new-session messages disappear

**Status:** root cause not yet reproduced in an automated test; strong leading hypothesis. Resume per "Next steps" below.
**Branch:** `fix/windows-test-failures` · **Env:** Windows, user runs `pi-web.exe` manually with the **real `pi`** + real API keys.

---

## 1. The actual symptom (from the user — authoritative)

On **every** new session, in **both** creation flows:
- The user sends a message; the agent streams a reply (tokens visible).
- **As soon as streaming finishes, the messages disappear** — *both the assistant reply AND the user's own posted message.*
- They do **not** come back on their own. The user must **navigate to the sessions overview and re-enter the session** for the messages to appear (a full page reload re-reads the file from disk).
- "I don't even see the messages that I post in a new session before I exit it and enter it again."

> Pre-existing sessions do NOT show this. Only freshly-created ones.

This is a **client-side display / reconcile bug**, NOT a model/API-key problem (see §3, dead ends).

---

## 2. Test stack reality (important context)

The Playwright e2e suite drives a **real browser against the real pi-web binary + SPA** (real UI, Go backend, SSE, reconcile). The **only** faked piece is the agent: a **stub `pi`** (`e2e/lib/stub-pi/pi`) stands in for the real `pi --mode rpc` because CI has no API keys.

**The user's strong intuition (likely correct): the stub is masking the bug.** The stub's write/stream/flush ordering self-heals in a way the real `pi` does not. To faithfully reproduce, we probably need to drive pi-web with the **real `pi`** (local-only, needs keys), not the stub — see Next Steps.

---

## 3. What this session established (and dead ends)

1. **e2e stub was completely broken on Windows** (3 separate bugs) — now FIXED and KEPT (these are real fixes, prerequisite to any chat test running on Windows):
   - `e2e/lib/server.ts`: PATH built with Unix `:` instead of `path.delimiter` (`;` on Windows) → stub dir not on PATH. Fixed.
   - `e2e/lib/stub-pi/`: no Windows-resolvable entry; `exec.LookPath("pi")` needs a PATHEXT extension. Added `pi.cmd` wrapper (`node "%~dp0pi" %*`).
   - `e2e/lib/stub-pi/pi`: was extensionless **TypeScript** (`(): number`) that `node` can't run on any platform. Stripped the lone type annotation → plain JS.
2. **"No API key found for the selected model" was an e2e-keyless ARTIFACT**, not the user's bug. A speculative product fix (seed a default model into new sessions) was built then **REVERTED** — it addressed the wrong thing.
3. **pi-web new-session plumbing works with the stub:** the assistant reply DOES materialize for both flows (`e2e/tests/new-session-reply.spec.ts` passes). So worker-init / SSE / basic reconcile are not broken in the harness.
4. **Deferred-write race reproduction self-heals:** the stub was given a `[[defer-write]]` mode that emits `done` BEFORE writing the canonical entry (mimicking real pi's ordering). The persistence test (`e2e/tests/reply-persistence.spec.ts`) STILL PASSES — after the `done`-reload clears the preview, the **file-watch recovery reload fires ~1.5s later when the entry lands, and the reply comes back on its own.** So deferred-write timing alone is NOT the missing ingredient in the harness.

---

## 4. Key code mechanism (the suspects)

- **`web/src/session/live/live-events.js`**
  - `wireSessionEvents`: on `chat-preview` payload with `done: true` → `onReload(event)` (line ~123).
  - Comment (lines 118-122): *the file-watch `reload` event is dropped for a brand-new session's first write* (watcher treats it as an initial observation), so it relies on the `done` signal to pull entries.
  - `handleSessionReload`: fetches `/api/session`, calls `onReloaded({...data, entries})` (which reconciles the model), then **`clearChatPreview()` (line 73)** — unconditionally clears the optimistic preview.
- **`web/src/components/session/LiveReload.svelte`**: `triggerReload` → `handleSessionReload` with `onReloaded: (data) => reconcileEntries(data.entries)`; then `clearChatPreview()`.
- **`web/src/session/data/session-data.svelte.js` `reconcile(entries)`**: `this.entries.splice(0, len, ...entries)` — **REPLACES** the entire model with the server's entries.
- **`web/src/session/live/chat-preview.js` `clearChatPreviewState(state, {keepAssistant})`**: removes `#chat-pending-user` and the assistant preview stream element.
- **`internal/server/watcher.go:167-179`**: on a `.jsonl` `Create` event, pre-marks the file known (zero modtime) so the *subsequent* `Write` broadcasts a `reload`. This is the "recovery reload" for new sessions — **if it fails to fire for real `pi`'s write pattern on Windows, nothing recovers the cleared messages** until a manual full reload.

---

## 5. Leading hypothesis (refined by "my own message also disappears")

On the `done`-triggered reload, `/api/session` is fetched **before the new turn (user + assistant) is flushed/visible on disk**. `reconcile()` then **replaces** the model's entries with that stale response (which lacks the in-flight turn), AND `clearChatPreview()` removes the optimistic user + assistant previews. Net result: **both the user message and the reply vanish.** The recovery `reload` (watcher.go) that should re-reconcile once the entry lands **does not effectively fire for new sessions in the real Windows + real-`pi` environment**, so it stays empty until the user navigates away and back (a fresh `/api/session` read that now includes the turn).

Why the stub doesn't reproduce it: in the harness the recovery file-watch reload DOES fire after the stub's `appendFileSync`, so it self-heals. Real `pi` (separate process, streaming, its own flush timing) + Windows fsnotify likely loses that recovery reload.

---

## 6. NEXT STEPS — resume here (per user's chosen approach)

The user wants **observability, not point assertions**: watch the page state evolve over time so we literally see "appears → streams → disappears (and stays gone)".

1. **Build a time-series logging diagnostic** (new spec, e.g. `e2e/tests/new-session-observe.spec.ts`):
   - Two tests: **(a) create from the sessions overview**, **(b) create from inside an existing session**.
   - After navigation, **poll every ~250ms** and log a timeline of: `#messages` innerText (or child message count), presence of `#chat-pending-user` / `#chat-preview-stream`, `#pi-chat-status` class, `#pi-chat-send` disabled state. Log from page-load, through send, and for **~20s after** so we capture the post-`done` disappearance and whether/when anything returns.
   - Also capture the pi-web **server stdout/stderr** during the run (the harness already pipes it with a `[pi-web]` prefix).
2. **Reconsider the stub (the user's key point):** the most faithful reproduction is to drive pi-web with the **REAL `pi`** so the timing matches the user's environment. Options:
   - Add a way to run the diagnostic **without** the stub on PATH (so pi-web spawns the real `pi`). This needs API keys and is local-only (not CI). To do this, drop/skip the `PATH: ${STUB_PI_DIR}${delimiter}...` prepend in `e2e/lib/server.ts` for that run, or add an env switch.
   - If staying on the stub: make it **stream token-by-token** and crucially **never produce a write that the watcher turns into a recovery reload** (e.g., write via a path/rename pattern fsnotify misses, or simply never write the canonical entry until much later), to force the "stays gone" state.
3. **Confirm the disappearance source** from the timeline: does `#messages` go empty exactly on the `done` event? Does a second `reload`/`chat-preview` arrive afterward? Does `/api/session` (check Network/log) return the new turn at that moment or not?
4. **Then fix** — likely in `live-events.js` / `LiveReload.svelte`:
   - Don't `reconcile()`-replace the model with a response that lacks the just-sent turn (merge/append instead of wholesale replace, or skip reconcile when the new turn isn't present yet).
   - Don't `clearChatPreview()` until the canonical turn is actually confirmed in the reconciled entries (use the existing `keepAssistant` / a "keepUser" path; retry the fetch).
   - And/or make the new-session **recovery reload reliable** (`internal/server/watcher.go`) so the canonical turn re-reconciles without manual navigation.

---

## 7. Working-tree state at handoff

**Keep (real fixes / new diagnostics):**
- `e2e/lib/server.ts` — `path.delimiter` PATH fix.
- `e2e/lib/stub-pi/pi` — plain-JS conversion + `[[defer-write]]` mode.
- `e2e/lib/stub-pi/pi.cmd` — new Windows wrapper.
- `e2e/lib/stub-pi/stub-delay.config` — reset to `30` (was a stale `5000`).
- `e2e/tests/session-creation.spec.ts` — user's original diagnostic (asserts optimistic preview only; does NOT assert reply persistence — that's why it never caught the bug).
- `e2e/tests/new-session-reply.spec.ts` — asserts the reply appears (passes; insufficient because `toContainText` passes on the flash).
- `e2e/tests/reply-persistence.spec.ts` — deferred-write persistence test (currently PASSES = self-heals in harness).

**Reverted (wrong fix):** `internal/server/handlers.go`, `internal/server/new_session.go` restored to HEAD; `internal/server/new_session_test.go` deleted.

**Not from this session / unrelated:** `internal/ui/export_html_test.go` (pre-existing modification).

**Scratch (can delete):** `.pi/tasks/*.md` (subagent briefs), `pi-web`, `pi-web.exe`, `pi-web.exe~` binaries.

---

## 8. How to run a diagnostic spec

```bash
cd e2e && ./node_modules/.bin/playwright test tests/<spec>.spec.ts --project="Desktop Chrome" --reporter=line
```
- `global-setup.ts` spawns `pi-web` on a random port with the stub on PATH and pipes its logs with a `[pi-web]` prefix.
- The trailing **`EPERM ... \\?\...\e2e\.tmp\agent`** teardown error on Windows is cosmetic (file lock during cleanup), not a test failure.
- To rebuild the binary the harness uses (extensionless `pi-web` at repo root): `export PATH="$PATH:/c/Users/HTK/go/bin" && go build -o pi-web ./cmd/pi-web` (frontend embed already present from prior `web` build).
