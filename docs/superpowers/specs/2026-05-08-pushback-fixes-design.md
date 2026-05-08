# Pushback Fixes — Design

Date: 2026-05-08
Scope: Six issues raised in a code review of `pi-web`. Three PRs, in order.

## Goals

1. Make HTTP lifecycle correct and resource-safe (timeouts, graceful shutdown, working `stopCh`).
2. Stop holding full session conversation history in memory just to render the index page.
3. Fix a misleading path-traversal check in `CreateSessionFile`.
4. Stop silently dropping per-session reload events when a client's SSE buffer fills.
5. Rename `writePidfile` to reflect what it writes, and prevent two instances from clobbering the state file.
6. Unify success-path JSON encoding behind a `writeJSON` helper.

Non-goals: feature changes, frontend changes beyond what items 2 and 4 require, Windows support for the flock helper.

---

## PR 1 — Lifecycle (items 1, 3, 5)

### Item 1: HTTP timeouts + graceful shutdown

**`main.go`:**

- Replace `http.ListenAndServe(addr, mux)` with an explicit `http.Server`:
  ```go
  httpServer := &http.Server{
      Addr:              addr,
      Handler:           mux,
      ReadHeaderTimeout: 10 * time.Second,
      IdleTimeout:       120 * time.Second,
      // WriteTimeout intentionally 0 — SSE streams are long-lived
  }
  ```
- Wire signal handling:
  ```go
  ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
  defer stop()

  go func() {
      <-ctx.Done()
      shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
      defer cancel()
      _ = httpServer.Shutdown(shutdownCtx)
      srv.Shutdown()
  }()

  if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
      fmt.Fprintf(os.Stderr, "server error: %v\n", err)
      os.Exit(1)
  }
  ```

**`internal/server/server.go`:**

- Add `Server.Shutdown()` (idempotent via `sync.Once`) that closes `s.stopCh`.
- The status sweeper already observes `stopCh`. Update:
  - `watchFilesPolling` ticker loop — `select` on `stopCh` to exit.
  - `watchFilesFsnotify` goroutine — add `case <-s.stopCh: return` to the event-loop select. Its existing `defer debouncers.stop()` then unblocks the debouncer's `run` loop, so no separate change to the debouncer is needed.
  - `handleEvents` SSE loop — already exits on `r.Context().Done()`, which fires when `httpServer.Shutdown` closes the connection. No change needed.

**Tests:** add a server-level test that constructs `Server`, calls `Shutdown`, and asserts the sweeper goroutine exits within a timeout (use a small TTL via `runStatusSweeper(stopCh, 10*time.Millisecond)` pattern already used in `status_sweeper_test.go`).

### Item 3: `CreateSessionFile` traversal check

**`internal/sessions/session.go:184`:**

- Drop `if strings.Contains(path, "..") { … }`.
- After `path = filepath.Clean(path)`, require absolute: `if !filepath.IsAbs(path) { return "", errors.New("path must be absolute") }`.
- After computing `projectDir := filepath.Join(sessionsDir, EncodeProjectName(path))`, verify containment:
  ```go
  rel, err := filepath.Rel(sessionsDir, projectDir)
  if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
      return "", errors.New("invalid path")
  }
  ```

**Tests in `internal/sessions/session_test.go`:**

- `/foo/..bar/project` — must succeed (legitimate filename containing `..`).
- Relative path like `foo/bar` — must fail with "path must be absolute".
- Path that, after `EncodeProjectName`, escapes `sessionsDir` (constructed input that produces `..` in the encoded name) — must fail.

### Item 5: state file rename + flock

**`main.go`:**

- Rename `writePidfile` → `writeStateFile`. File path stays `~/.pi/agent/pi-web-state.json` for compatibility with pi extensions that read it.
- Acquire exclusive non-blocking `syscall.Flock` on the file FD before writing. On `EWOULDBLOCK`:
  ```
  another pi-web instance appears to be running (state file at <path> is locked).
  exit it first, or remove the file if stale.
  ```
- Hold the lock for the lifetime of the process. The FD is held in a package-level var; `defer syscall.Close(fd)` in `main` releases the lock and the file remains for readers (but can be re-locked by the next instance).
- Put the flock helper in `state_file_unix.go` with a `//go:build !windows` tag. Add a `state_file_windows.go` stub that returns success without locking — the tool isn't supported there but we don't want to break compile.

**Tests:** `state_file_test.go` — write twice in sequence (succeeds), then test that two open file descriptors flocked simultaneously return `EWOULDBLOCK` on the second.

---

## PR 2 — Summary split (item 2)

### New types

`internal/sessions/session.go`:

```go
type SessionSummary struct {
    ID, Filename, Project, LastActivity string
    Name                                string  // precomputed at parse time, ≤80 chars
    MessageCount, TokenTotal            int
    CostTotal                           float64
    ChatAvailable                       bool
    ChatDisabledReason                  string
}

type Session struct {
    SessionSummary
    Header  map[string]any
    Entries []map[string]any
}
```

`SessionSummary` carries everything the index page needs. `Session` embeds it for the full-fidelity path.

### Parse functions

- New `ParseSummary(path, dirName, fileName string) (SessionSummary, error)`:
  - Streams the file with `bufio.Scanner` (max line size raised to handle long messages — start with 4 MB, document why).
  - Per line: unmarshal into `map[string]any`, accumulate counters, capture `Header["name"]` if it appears as `Name`. If `Name` is still empty after the header, capture the first user-message text (truncated to 80 chars + `…`) as `Name`, mirroring current `sessionName` behavior.
  - Drops each line after extracting fields. No `Entries` retained.
- Existing `ParseFile` keeps the full parse and returns `Session`. Internally it can call a shared helper that produces both — but keep the public surface as two functions to make the cost difference obvious at the call site.

### Cache

`internal/sessions/cache.go`:

- `cacheEntry.session` field becomes `summary SessionSummary`.
- `Cache.LoadAll` returns `[]SessionSummary`.
- Eviction logic unchanged.

### Server wiring

- `Server.Deps.RenderIndex` becomes `func(io.Writer, []SessionSummary) error`.
- `Server.loadSessions` returns `[]SessionSummary`.
- `handleIndex` unchanged in shape.

### Template

`index_template.go`:

- Delete `sessionName` template func and its `Header`/`Entries` walk.
- Replace `{{ sessionName . }}` calls in `templates/index.html` with `{{ .Name }}`.
- `funcMap` loses `sessionName`.

### Tests

- `session_test.go`: add `TestParseSummary` covering header-name preference, user-message fallback, 80-char truncation, counters, `LastActivity` from header vs. mtime fallback.
- `cache_test.go`: update return-type assertions.
- `handlers.go`/`handlers_test.go`: update index path tests.
- `index_template`: regression test that `Name` renders.

### Migration note

`Session.Header` and `Session.Entries` remain available wherever `ResolveByID` is called (`/session`, `/api/session`, `/api/chat`). Those paths are untouched.

---

## PR 3 — SSE helpers (items 4 and 6)

### Item 4: coalesce reload events

`internal/server/server.go`:

```go
type sseClient struct {
    ch     chan string
    sessID string
    mu     sync.Mutex
    queued map[string]bool   // event-key → currently-pending in ch
}
```

- `addClient` initializes `queued: make(map[string]bool)` and bumps buffer from 4 to 16.
- New `eventKey(msg string) string`:
  - `"reload"` → `"reload"`
  - `"new-session"` → `"new-session"`
  - everything starting with `"event: status-snapshot"` or `"event: status-delta"` → `""` (always-deliver, drop-on-full)
  - default → `""` (preserves current semantics for any future event)
- `broadcast` becomes (per-client):
  ```go
  key := eventKey(msg)
  c.mu.Lock()
  if key != "" && c.queued[key] {
      c.mu.Unlock()
      continue
  }
  select {
  case c.ch <- msg:
      if key != "" {
          c.queued[key] = true
      }
  default:
      // dropped — only happens for keyless events; snapshot recovers
  }
  c.mu.Unlock()
  ```
- The reader in `handleEvents` clears the queued bit after pulling:
  ```go
  case msg, open := <-client.ch:
      if !open { return }
      key := eventKey(msg)
      if key != "" {
          client.mu.Lock()
          delete(client.queued, key)
          client.mu.Unlock()
      }
      // … existing write logic
  ```

### Item 6: `writeJSON` helper

`internal/server/server.go`:

```go
// writeJSON writes payload as JSON. Encode errors are intentionally
// discarded — by then headers are sent and the client is the right
// party to detect transport failure.
func writeJSON(w http.ResponseWriter, status int, payload any) {
    w.Header().Set("Content-Type", "application/json")
    if status != 0 {
        w.WriteHeader(status)
    }
    _ = json.NewEncoder(w).Encode(payload)
}
```

Replace every `w.Header().Set("Content-Type", "application/json"); json.NewEncoder(w).Encode(...)` pair in `handlers.go`, `chat.go`, `share.go`, `events.go` with `writeJSON(w, 0, payload)` (status 0 means "don't call WriteHeader, leave the default 200").

### Tests

- `sse_test.go`: assert that two rapid reloads to the same session, with a slow reader, deliver one (or two but not duplicate-bursted). Assert that a status-delta arriving while a reload is queued still delivers (different key).
- Existing handler tests assert response bodies unchanged.

---

## Risks & Rollback

- PR 1 is the riskiest because graceful shutdown changes process lifecycle. Mitigation: the SIGINT path is additive — if `httpServer.Shutdown` hangs, the 5s timeout falls through and the program exits anyway. `Server.Shutdown` is best-effort.
- PR 2 has the largest blast radius (cache shape, template, every test that constructs `Session`). Mitigation: `Session` embeds `SessionSummary`, so any code path holding a `Session` keeps working unchanged.
- PR 3 changes per-client SSE memory shape (now holds a small map). Buffer grew 4 → 16, so peak memory per client is ~16 strings. Negligible.

Each PR is independently revertable; later PRs do not depend on earlier ones being merged (PR 2 and PR 3 don't touch lifecycle; PR 3 doesn't touch sessions).

---

## Out of scope

- Refactoring `ParseFile` for full streaming on the chat path (only the index path matters for memory).
- Changing the SSE wire format.
- Frontend reload-debouncing (the server-side coalesce removes the duplicate-burst pressure).
- Windows support for flock.
