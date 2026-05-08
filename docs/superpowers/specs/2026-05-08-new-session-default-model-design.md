# New Session Default Model/Thinking Level — Design Doc

## Problem

When a user creates a new session via the web UI and navigates to the session page, the model selector shows "unknown" and the thinking level selector is empty. After sending one chat message and refreshing, the correct default model and thinking level appear.

**Root cause:** No `pi --mode rpc` worker process exists for a brand-new session until the first chat message is sent. The `/api/worker-status` endpoint returns empty `model`/`modelProvider`/`thinkingLevel` because `GetState()` finds no worker to query.

## Solution Overview

Use a **hybrid eager + lazy** approach to ensure a worker exists early enough for the first status poll to return the default model and thinking level:

1. **Eager:** Pre-initialize a worker when the session file is created (`handleNewSession`)
2. **Lazy:** Spawn a worker on demand during the first `/api/worker-status` poll if none exists yet
3. **Full state:** Return `Model`, `ModelName`, `ModelProvider`, and `ThinkingLevel` from `GetState()` in the status response

## How Defaults Work

`pi` itself knows the user's default model and thinking level from its internal config. The web server does **not** need to know what the defaults are — it only needs to ask an active worker via `GetState()`.

The `piRPCWorker` constructor already calls `GetState()` after spawn to cache defaults locally. Our job is to create the worker early enough.

## Architecture

### 1. Manager: `EnsureWorker(sessionID, sessionPath)`

- New public method on `Manager` that calls `workerFor()` to create/get a worker
- Does **not** send any chat message
- Fails silently if `pi` is unavailable (factory returns error)

### 2. `handleWorkerStatus` — Lazy Init + Full State

```
if computeRunningStatus(sessionID) {
    status.State = Running
} else if chatSender != nil {
    if chatSender.Status(sessionID).Model == "" {
        // No worker yet — spawn one in the background
        go chatSender.EnsureWorker(ctx, sessionID, resolved.Path)
    }
    if state, err := chatSender.GetState(ctx, sessionID); err == nil {
        status.Model = state.Model
        status.ModelName = state.ModelName
        status.ModelProvider = state.ModelProvider
        status.ThinkingLevel = state.ThinkingLevel
    }
}
```

### 3. `handleNewSession` — Eager Init

After creating the session file:

```
if chatSender != nil {
    if resolved, err := ResolveByID(sessionsDir, id); err == nil {
        go chatSender.EnsureWorker(ctx, resolved.Session.ID, resolved.Path)
    }
}
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `EnsureWorker` fails (pi missing) | Worker doesn't exist, `GetState` returns idle → frontend shows empty fields (same as today) |
| `GetState` fails | Falls through to idle response with empty fields |
| Fire-and-forget spawn | Never blocks HTTP response; user sees idle until worker is ready |

## Interface Changes

```go
// ChatSender — add EnsureWorker
type ChatSender interface {
    Send(...)
    SetModel(...)
    SetThinkingLevel(...)
    GetState(...) (WorkerStatus, error)
    Status(sessionID string) WorkerStatus
    EnsureWorker(ctx context.Context, sessionID, sessionPath string) error
}
```

## Testing Strategy

1. **Manager test** — `TestEnsureWorkerCreatesWorker`: call `EnsureWorker`, verify worker exists in map
2. **Server test** — `TestHandleWorkerStatusReturnsFullState`: fake sender with model/thinking state, verify JSON response includes all fields
3. **Server test** — `TestHandleWorkerStatusSpawnsWorkerWhenNoModel`: verify `EnsureWorker` called when `Status().Model == ""`
4. **Server test** — `TestHandleNewSessionPreinitializesWorker`: verify `EnsureWorker` called after session creation

## Files to Modify

- `internal/workers/manager.go` — add `EnsureWorker`
- `internal/server/chat.go` — update `ChatSender` interface and `handleWorkerStatus`
- `internal/server/handlers.go` — update `handleNewSession`
- `internal/server/chat_test.go` — add `EnsureWorker` to fakeSender + new tests
- `internal/workers/manager_test.go` — add `TestEnsureWorkerCreatesWorker`
