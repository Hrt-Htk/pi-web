## Reproduction

1. Open an existing session with an active worker (agent generating a response)
2. Click the + (New Session) button in the session header
3. The new session loads — send a message or wait for the agent to respond

## Observed

- **Agent responses do not render**, or appear briefly during streaming then disappear
- **Context ring flashes** — briefly shows a percentage/value from the old session then resets
- Going back to the sessions index and re-entering the new session fixes both issues — responses render correctly and the ring is stable

## Expected

Navigating from one session to another via the + button should produce a clean session page with properly rendered agent responses and a stable context ring.

## Root cause

`runChatComposer()` (`web/src/components/session/chat/chat-composer-runtime.js` line ~195) calls `setupWorkerStatusPolling()` which returns `{ refresh, dispose }`. The `dispose` function is **never stored or called**. `ChatComposer.svelte`'s `onMount` returns no cleanup function.

This leaks two things from the old session after navigation:

### 1. `setInterval` (1500ms) — causes responses to disappear

The stale interval keeps polling `/api/worker-status` for the **old** session ID. When the old session's worker transitions from `running` to `idle`, it dispatches `pi-worker-done` on the global `window` ([worker-status.js:45](web/src/components/session/chat/worker-status.js)). The **new** session's `<LiveReload>` component has a listener for this global event ([LiveReload.svelte:177](web/src/components/session/LiveReload.svelte)). It calls:

```js
finishChatPreview();  // removes streaming preview DOM
triggerReload();      // fetches /api/session for new session (may be empty)
```

Result: the new session's streaming preview is cleared, and if the reload fetches before the worker has written entries, nothing renders.

### 2. Stale `updateContextUsage` closure — causes context ring flash

`setupWorkerStatusPolling()` captures `updateContextUsage` in a closure created by `createContextUsageController({ entries })` where `entries` is the **old** session's `model.entries`. Every poll tick calls this stale function which does `document.getElementById('pi-chat-context-usage')` — resolving to the **new** session's context ring DOM element — and writes old session token data into it.

Additionally the stale `window.addEventListener('pi-session-reload', onSessionReload)` ([worker-status.js:63](web/src/components/session/chat/worker-status.js)) fires on every new-session reload, repeating the flash.

## Files involved

- `web/src/components/session/chat/chat-composer-runtime.js` — `runChatComposer()` discards `dispose` return value from `setupWorkerStatusPolling()`
- `web/src/components/session/ChatComposer.svelte` — `onMount` returns no cleanup
- `web/src/components/session/chat/worker-status.js` — `setupWorkerStatusPolling()` returns `{ refresh, dispose }`
- `web/src/components/session/LiveReload.svelte` — listens for global `pi-worker-done` event

## Fix direction

1. Store and return `dispose` from `setupWorkerStatusPolling()` inside `runChatComposer()`
2. Have `runChatComposer()` return a cleanup function
3. Have `ChatComposer.svelte`'s `onMount` return that cleanup

---

- [x] I understand the maintainer triages requests and will invite a PR only if this moves forward.
