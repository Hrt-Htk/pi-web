# Bug: New session responses disappear / context ring flashes

## Root cause
`runChatComposer()` (chat-composer-runtime.js) calls `setupWorkerStatusPolling()` which starts a `setInterval` that polls `/api/worker-status` every 1500ms. When the polled worker transitions from running→idle, it dispatches `pi-worker-done` on the global `window`.

The problem: `runChatComposer()` returns nothing. ChatComposer.svelte's onMount doesn't return a cleanup function. So when the user navigates from session A to session B:

1. Session A's ChatComposer unmounts — but the setInterval keeps running (capturing session A's ID)
2. Session B's LiveReload mounts — registers its own listener for `pi-worker-done` on `window`
3. When session A's worker finishes, the stale interval fires, detects running→idle, dispatches `pi-worker-done`
4. Session B's LiveReload catches this global event, calls `finishChatPreview()` + `triggerReload()`
5. `finishChatPreview()` removes the streaming preview DOM element for session B
6. `triggerReload()` fetches `/api/session` for session B — which may still be empty or have fewer entries
7. Result: responses disappear, context ring flashes

Going back to sessions view and re-entering works because that triggers a full page remount with clean state.

## Fix
1. Make `setupWorkerStatusPolling().dispose()` also clear the setInterval (it currently only removes the event listener)
2. Make `runChatComposer()` collect all dispose functions and return a single dispose
3. Have ChatComposer.svelte's onMount return the dispose from `runChatComposer()`
