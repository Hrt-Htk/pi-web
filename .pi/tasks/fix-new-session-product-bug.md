# Task: fix the REAL product bug — creating a new session breaks chat

Repo: H:/Software/pi-web (Go backend + Svelte frontend). You have FULL tools (read, edit, write, bash, grep, find). You may build. **Do NOT start the server** (the user runs pi-web themselves — never run `./pi-web.exe`, `make dev`, etc.).

## The product bug (real manual usage, real `pi` binary — NOT a test issue)

When a user creates a NEW session and sends the first message:
- The user's optimistic message preview appears.
- The assistant reply NEVER materializes.
- After a reload, `#messages` becomes empty (the optimistic preview is cleared with no canonical entries behind it).

PRE-EXISTING sessions work fine. The goal: a working pi-web where creating a new session (from either entry point) yields a functioning chat.

Two creation flows:
1. From sessions index (`web/src/routes/SessionsPage.svelte` `createSession`) -> `POST /api/new-session { path }` -> navigate. This session has only a header entry (NO `model_change`).
2. From within a session (`web/src/components/session/SessionHeader.svelte` onNew) -> `POST /api/new-session { path, sourceSessionId }` -> navigate. This inherits a `model_change` from the source (header + model_change).

## IMPORTANT — do NOT touch the e2e test harness

The e2e stub (`e2e/lib/stub-pi/`, `e2e/lib/server.ts`) was a SEPARATE Windows test-harness bug that is already fixed. Do not modify anything under `e2e/`. This task is purely the product code under `internal/` and `web/`.

## Hypotheses to VERIFY against the code (do not assume — confirm with file:line evidence)

A. **No model on a fresh session.** Flow 1 writes no `model_change` entry, so when the worker `switch_session`s to it, the real `pi` falls back to a default model. If that default needs an API key the user doesn't have, `pi` returns "No API key found for the selected model" and writes nothing. Check `internal/server/new_session.go` (`initialSettingsFromSource`, `initializeNewSessionWorker`), `internal/server/handlers.go` `handleNewSession`, and `internal/sessions/session.go` `CreateSessionFileWithSettings`. Does pi-web ever set/seed a model for a source-less new session? Should it seed the user's current/default model so a fresh session is immediately usable?

B. **Worker init race.** `handleNewSession` pre-initializes the worker on a background goroutine (`go s.initializeNewSessionWorker(context.Background(), ...)`) and returns 200 immediately. The first `/api/chat` may arrive before the worker is ready. Inspect `internal/workers/manager.go` `EnsureWorker`/`workerFor` and `internal/server/chat.go`. Is there an actual failure path here, or is it serialized safely by the `creating` map?

C. **Windows: spawning `pi` from the native pi-web process hangs.** KNOWN ISSUE in this project: auto-titling was changed to POST the LLM endpoint directly because spawning `pi` as a child process from the native Windows pi-web binary HANGS. The rpc chat worker spawns `pi --mode rpc` via `exec.Command` in `internal/rpc/worker.go`. Investigate whether the same Windows child-process hang affects the rpc worker spawn — and crucially, whether it differs between a PRE-EXISTING session (worker spawned lazily on first chat, in a request goroutine) vs a NEW session (worker pre-spawned in a `go` goroutine from `handleNewSession`). Look at how stdin/stdout/stderr pipes are wired and closed (`internal/rpc/worker.go`), and how the auto-title direct-HTTP workaround avoids the hang (grep for the auto-title HTTP code) — the fix may need the same treatment or a different spawn strategy.

D. **SSE reload / reconcile drops the first write.** `web/src/session/live/live-events.js` has a comment that the file-watch `reload` event is dropped for a brand-new session's first write (watcher treats it as an initial observation), so canonical entries never reconcile until manual refresh; it relies on the chat-preview `done` signal instead. Verify this path actually fires for a brand-new session and that `LiveReload.svelte` reconcile doesn't clear the optimistic preview when the worker produced no/late entries. Check `handleSessionReload` and `reconcileEntries`.

## What to deliver

1. A CONFIRMED root cause (or ordered set of causes) with exact file:line evidence — distinguish what actually breaks manual usage from red herrings.
2. Implement the product fix in `internal/` and/or `web/`. Keep changes minimal and idiomatic; follow `AGENTS.md`/`CLAUDE.md` conventions (no needless abstractions, clear names, i18n via `t()` for any new user-facing strings, Lucide icons only, etc.).
3. Build to confirm it compiles. Per CLAUDE.md, `make build` may fail on the npm step in a reduced shell; if so build directly:
   `cd web && /c/nvm4w/nodejs/npm.cmd run build` then
   `go build -ldflags="-s -w -X main.version=$(git describe --tags --always --dirty)" -o pi-web.exe ./cmd/pi-web`
   (Always produce `pi-web.exe`.) Run `go test ./...` for any packages you touched.
4. Report: confirmed root cause, the exact files changed with a 1-line rationale each, build/test result, and anything you were unsure about. Do NOT start the server.
