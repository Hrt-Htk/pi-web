# Pushback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land six code-review pushback fixes across three independently mergeable PRs: HTTP lifecycle, session summary split, SSE helpers.

**Architecture:** Three phases, each phase = one PR. Phase 1 (lifecycle): explicit `http.Server` with timeouts, graceful shutdown via `Server.Shutdown()` + `sync.WaitGroup`, traversal-check fix, state-file flock. Phase 2 (summary split): new `SessionSummary` returned from `Cache.LoadAll`, full `Session` retained behind `ResolveByID`; `share` package refactored to use the resolver. Phase 3 (SSE helpers): `writeJSON` helper, per-client coalescing of `reload`/`new-session` keys.

**Tech Stack:** Go 1.25+, `fsnotify`, embedded HTML templates, Alpine.js (frontend untouched except for index template field rename).

**Spec:** `docs/superpowers/specs/2026-05-08-pushback-fixes-design.md`

---

## Phase 1 — Lifecycle (PR 1)

### Task 1.1: Server.Shutdown with WaitGroup

**Files:**
- Modify: `internal/server/server.go`
- Modify: `internal/server/watcher.go`
- Modify: `internal/server/status_sweeper.go`
- Test: `internal/server/server_test.go` (new file)

- [ ] **Step 1: Write the failing test**

Create `internal/server/server_test.go`:

```go
package server

import (
	"context"
	"encoding/json"
	"io"
	"testing"
	"time"

	"pi-web/internal/auth"
	"pi-web/internal/sessions"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	dir := t.TempDir()
	return New(Deps{
		SessionsDir:   dir,
		Auth:          auth.New(""),
		Cache:         sessions.NewCache(),
		RenderIndex:   func(w io.Writer, _ []sessions.Session) error { return nil },
		RenderSession: func(s sessions.Session, _ bool) string { return "" },
		Models:        func(ctx context.Context) (json.RawMessage, error) { return nil, nil },
	})
}

func TestShutdownStopsBackgroundGoroutines(t *testing.T) {
	s := newTestServer(t)
	done := make(chan struct{})
	go func() {
		s.Shutdown()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Shutdown did not return within 2s — background goroutines did not exit")
	}
}

func TestShutdownIsIdempotent(t *testing.T) {
	s := newTestServer(t)
	s.Shutdown()
	s.Shutdown() // must not panic
}
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `go test ./internal/server/ -run TestShutdown -v`
Expected: FAIL — `Shutdown` undefined.

- [ ] **Step 3: Add WaitGroup + Shutdown to Server**

In `internal/server/server.go`, modify the `Server` struct and `New`:

```go
import (
	// ... existing imports ...
	"sync"
)

type Server struct {
	sessionsDir   string
	clients       []*sseClient
	clientsMu     sync.RWMutex
	fileMod       map[string]time.Time
	fileModMu     sync.RWMutex
	chatSender    ChatSender
	cache         *sessions.Cache
	auth          *auth.Middleware
	shareRunner   shareCmdRunner
	now           func() time.Time
	renderIndex   func(w io.Writer, sessions []sessions.Session) error
	renderSession func(s sessions.Session, showButtons bool) string
	models        func(ctx context.Context) (json.RawMessage, error)
	lastKnown     map[string]struct{}
	lastKnownMu   sync.Mutex
	stopCh        chan struct{}
	stopOnce      sync.Once
	wg            sync.WaitGroup
}
```

Replace the goroutine launches at the end of `New`:

```go
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.watchFiles()
	}()
	if err := s.startSessionStatusWatcher(); err != nil {
		fmt.Fprintf(os.Stderr, "session-status watcher unavailable: %v\n", err)
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.runStatusSweeper(s.stopCh, time.Second)
	}()
	return s
}

// Shutdown stops background goroutines and waits for them to exit.
// Idempotent and safe to call from any goroutine.
func (s *Server) Shutdown() {
	s.stopOnce.Do(func() {
		close(s.stopCh)
	})
	s.wg.Wait()
}
```

- [ ] **Step 4: Make watcher loops observe stopCh**

In `internal/server/watcher.go`, replace `watchFilesPolling`:

```go
func (s *Server) watchFilesPolling() {
	ticker := time.NewTicker(1500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.scanForChanges()
		case <-s.stopCh:
			return
		}
	}
}
```

Replace the inner select in `watchFilesFsnotify`'s goroutine:

```go
	go func() {
		defer w.Close()
		defer debouncers.stop()
		for {
			select {
			case ev, ok := <-w.Events:
				if !ok {
					return
				}
				s.handleFsEvent(w, ev, debouncers)
			case err, ok := <-w.Errors:
				if !ok {
					return
				}
				fmt.Fprintf(os.Stderr, "fsnotify error: %v\n", err)
			case <-s.stopCh:
				return
			}
		}
	}()
```

The fsnotify path runs in its own goroutine spawned from inside `watchFiles`, which is the goroutine the WaitGroup is tracking. To keep `s.wg` accurate, change the launch in `watchFilesFsnotify` to use a child WaitGroup the parent waits on:

```go
func (s *Server) watchFilesFsnotify() error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	if err := w.Add(s.sessionsDir); err != nil {
		_ = w.Close()
		return err
	}

	if entries, err := os.ReadDir(s.sessionsDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				_ = w.Add(filepath.Join(s.sessionsDir, e.Name()))
			}
		}
	}

	s.scanForChanges()

	debouncers := newDebouncer(50 * time.Millisecond)
	doneCh := make(chan struct{})
	go func() {
		debouncers.run(s)
		close(doneCh)
	}()

	defer w.Close()
	defer func() {
		debouncers.stop()
		<-doneCh
	}()

	for {
		select {
		case ev, ok := <-w.Events:
			if !ok {
				return nil
			}
			s.handleFsEvent(w, ev, debouncers)
		case err, ok := <-w.Errors:
			if !ok {
				return nil
			}
			fmt.Fprintf(os.Stderr, "fsnotify error: %v\n", err)
		case <-s.stopCh:
			return nil
		}
	}
}
```

And update `watchFiles`:

```go
func (s *Server) watchFiles() {
	if err := s.watchFilesFsnotify(); err != nil {
		fmt.Fprintf(os.Stderr, "fsnotify unavailable, falling back to polling: %v\n", err)
		s.watchFilesPolling()
	}
}
```

(`watchFilesFsnotify` now blocks until `stopCh` closes, so `watchFiles` returns naturally and the WaitGroup decrement in `New`'s goroutine fires.)

- [ ] **Step 5: Run the tests (expect pass)**

Run: `go test ./internal/server/ -run TestShutdown -v`
Expected: PASS for both subtests.

- [ ] **Step 6: Run full server tests**

Run: `go test ./internal/server/ -v`
Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add internal/server/server.go internal/server/watcher.go internal/server/server_test.go
git commit -m "feat(server): graceful Shutdown with WaitGroup, watcher loops observe stopCh"
```

---

### Task 1.2: HTTP timeouts + signal handling in main

**Files:**
- Modify: `main.go`

- [ ] **Step 1: Replace ListenAndServe block**

In `main.go`, replace the trailing block (currently `if err := http.ListenAndServe(addr, mux); err != nil { ... }`) with:

```go
import (
	// ... existing ...
	"context"
	"os/signal"
	"syscall"
)

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		// WriteTimeout intentionally 0 — SSE streams are long-lived.
	}

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

- [ ] **Step 2: Build and smoke-test**

Run: `go build ./...`
Expected: clean build.

Run: `go test ./...`
Expected: all tests pass.

- [ ] **Step 3: Manual smoke test**

```bash
go run . -p 31499 &
sleep 1
curl -sf http://127.0.0.1:31499/ > /dev/null && echo "GET ok"
kill -INT %1
wait
```

Expected: "GET ok" prints; process exits within 5 seconds without "server error".

- [ ] **Step 4: Commit**

```bash
git add main.go
git commit -m "feat(main): explicit http.Server with timeouts + SIGINT/SIGTERM graceful shutdown"
```

---

### Task 1.3: CreateSessionFile traversal fix

**Files:**
- Modify: `internal/sessions/session.go:184-209`
- Modify: `internal/sessions/session_test.go`

- [ ] **Step 1: Write the failing tests**

Append to `internal/sessions/session_test.go`:

```go
func TestCreateSessionFileAcceptsLegitimateDoubleDotInName(t *testing.T) {
	tmp := t.TempDir()
	dir := filepath.Join(tmp, "..hidden-project")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	id, err := CreateSessionFile(tmp, dir)
	if err != nil {
		t.Fatalf("expected legitimate ..hidden path to be accepted, got %v", err)
	}
	if id == "" {
		t.Fatal("expected non-empty session id")
	}
}

func TestCreateSessionFileRejectsRelativePath(t *testing.T) {
	tmp := t.TempDir()
	if _, err := CreateSessionFile(tmp, "relative/foo"); err == nil {
		t.Fatal("expected error for relative path, got nil")
	}
}
```

- [ ] **Step 2: Run the tests (expect failure)**

Run: `go test ./internal/sessions/ -run TestCreateSessionFile -v`
Expected: `TestCreateSessionFileAcceptsLegitimateDoubleDotInName` fails with "invalid path" (current code rejects on substring `..`).

- [ ] **Step 3: Apply the fix**

In `internal/sessions/session.go`, replace the body of `CreateSessionFile` (from `path = filepath.Clean(path)` through the `if strings.Contains(path, "..")` block) with:

```go
	path = filepath.Clean(path)
	if !filepath.IsAbs(path) {
		return "", errors.New("path must be absolute")
	}
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := os.MkdirAll(path, 0755); err != nil {
			return "", err
		}
	}

	projectDir := filepath.Join(sessionsDir, EncodeProjectName(path))
	rel, err := filepath.Rel(sessionsDir, projectDir)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid path")
	}
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return "", err
	}
```

- [ ] **Step 4: Run the tests (expect pass)**

Run: `go test ./internal/sessions/ -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add internal/sessions/session.go internal/sessions/session_test.go
git commit -m "fix(sessions): replace weak substring check with filepath.Rel containment"
```

---

### Task 1.4: State file rename + flock

**Files:**
- Modify: `main.go`
- Create: `state_file_unix.go`
- Create: `state_file_windows.go`
- Create: `state_file_test.go`

- [ ] **Step 1: Write the failing test**

Create `state_file_test.go`:

```go
//go:build !windows

package main

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestStateFileFlockBlocksSecondAcquire(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "state.json")

	f1, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		t.Fatal(err)
	}
	defer f1.Close()
	if err := syscall.Flock(int(f1.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatalf("first flock should succeed: %v", err)
	}

	f2, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		t.Fatal(err)
	}
	defer f2.Close()
	err = syscall.Flock(int(f2.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err != syscall.EWOULDBLOCK {
		t.Fatalf("second flock should return EWOULDBLOCK, got %v", err)
	}
}
```

- [ ] **Step 2: Run it (expect pass — sanity check that flock works on this platform)**

Run: `go test -run TestStateFileFlock -v`
Expected: PASS (this validates the platform; the real implementation comes next).

- [ ] **Step 3: Create the unix flock helper**

Create `state_file_unix.go`:

```go
//go:build !windows

package main

import (
	"fmt"
	"os"
	"syscall"
)

// lockStateFile takes an exclusive non-blocking flock on f. The caller must
// keep f open for the lock to remain held; closing f releases the lock.
func lockStateFile(f *os.File) error {
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		if err == syscall.EWOULDBLOCK {
			return fmt.Errorf("another pi-web instance appears to be running (state file at %s is locked); exit it first, or remove the file if stale", f.Name())
		}
		return err
	}
	return nil
}
```

Create `state_file_windows.go`:

```go
//go:build windows

package main

import "os"

// lockStateFile is a no-op on Windows (unsupported platform).
func lockStateFile(_ *os.File) error { return nil }
```

- [ ] **Step 4: Rewrite writePidfile → writeStateFile in main.go**

In `main.go`, replace `writePidfile` with:

```go
// stateFile is held open for the lifetime of the process so the flock stays
// in effect. Closing it releases the lock.
var stateFile *os.File

func writeStateFile(host, port string, usedTailscale bool) (string, error) {
	home := os.Getenv("HOME")
	if home == "" {
		return "", fmt.Errorf("HOME not set")
	}
	agentDir := filepath.Join(home, ".pi", "agent")
	if err := os.MkdirAll(agentDir, 0755); err != nil {
		return "", err
	}
	path := filepath.Join(agentDir, "pi-web-state.json")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return "", err
	}
	if err := lockStateFile(f); err != nil {
		_ = f.Close()
		return "", err
	}
	data, err := json.Marshal(map[string]any{
		"pid":       os.Getpid(),
		"port":      port,
		"host":      host,
		"tailscale": usedTailscale,
		"startedAt": time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		_ = f.Close()
		return "", err
	}
	if err := f.Truncate(0); err != nil {
		_ = f.Close()
		return "", err
	}
	if _, err := f.WriteAt(data, 0); err != nil {
		_ = f.Close()
		return "", err
	}
	stateFile = f
	return path, nil
}
```

Update the call site in `main()`:

```go
	stateFilePath, err := writeStateFile(bindHost, *port, usedTailscale)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
	defer func() {
		if stateFile != nil {
			_ = stateFile.Close()
		}
		_ = os.Remove(stateFilePath)
	}()
```

(Previously this was a `WARNING` for failure — we now exit because a locked file means the user is starting a duplicate instance, which is the whole point of the lock.)

- [ ] **Step 5: Build and test**

Run: `go test ./...`
Expected: all tests pass.

- [ ] **Step 6: Manual two-instance smoke test**

```bash
go run . -p 31497 &
PID1=$!
sleep 1
go run . -p 31498  # second instance — should fail with "another pi-web instance..."
RC=$?
kill -INT $PID1
wait
[ $RC -ne 0 ] && echo "OK: second instance correctly refused"
```

Expected: second instance prints the locked-state-file message and exits non-zero; first exits cleanly on SIGINT.

- [ ] **Step 7: Commit**

```bash
git add main.go state_file_unix.go state_file_windows.go state_file_test.go
git commit -m "feat(main): rename writePidfile -> writeStateFile with exclusive flock"
```

---

### Task 1.5: Phase 1 PR

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --title "Lifecycle: timeouts, graceful shutdown, traversal fix, state-file flock" --body "$(cat <<'EOF'
## Summary
- Explicit `http.Server` with `ReadHeaderTimeout` and `IdleTimeout`; SIGINT/SIGTERM handled via `signal.NotifyContext`.
- `Server.Shutdown()` (idempotent, `WaitGroup`-based) actually stops the sweeper and watcher loops via `stopCh`.
- `CreateSessionFile` swaps the broken `..` substring check for `filepath.IsAbs` + `filepath.Rel` containment; legitimate paths like `/foo/..bar` are now accepted.
- `writePidfile` renamed to `writeStateFile`; the file is now flocked exclusively, so a second instance refuses to start instead of silently clobbering the state.

## Test plan
- [ ] `go test ./...` passes
- [ ] `kill -INT` on a running server exits within ~5s
- [ ] Second instance against the same `~/.pi/agent` refuses to start with a clear message
EOF
)"
```

---

## Phase 2 — Summary split (PR 2)

### Task 2.1: SessionSummary type + ParseSummary

**Files:**
- Modify: `internal/sessions/session.go`
- Modify: `internal/sessions/session_test.go`

- [ ] **Step 1: Write the failing tests**

Append to `internal/sessions/session_test.go`:

```go
func TestParseSummaryUsesHeaderName(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "s.jsonl")
	content := `{"type":"session","name":"My Project","timestamp":"2026-05-08T10:00:00Z"}` + "\n" +
		`{"type":"message","timestamp":"2026-05-08T10:00:01Z","message":{"role":"user","content":"hello"}}` + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := ParseSummary(path, "--proj--", "s.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	if s.Name != "My Project" {
		t.Errorf("Name = %q, want %q", s.Name, "My Project")
	}
	if s.MessageCount != 1 {
		t.Errorf("MessageCount = %d, want 1", s.MessageCount)
	}
}

func TestParseSummaryFallsBackToFirstUserMessage(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "s.jsonl")
	content := `{"type":"session","timestamp":"2026-05-08T10:00:00Z"}` + "\n" +
		`{"type":"message","timestamp":"2026-05-08T10:00:01Z","message":{"role":"user","content":"first user line"}}` + "\n" +
		`{"type":"message","timestamp":"2026-05-08T10:00:02Z","message":{"role":"user","content":"second user line"}}` + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := ParseSummary(path, "--proj--", "s.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	if s.Name != "first user line" {
		t.Errorf("Name = %q, want %q", s.Name, "first user line")
	}
}

func TestParseSummaryTruncatesNameAt80(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "s.jsonl")
	long := strings.Repeat("x", 120)
	content := `{"type":"session","timestamp":"2026-05-08T10:00:00Z"}` + "\n" +
		`{"type":"message","timestamp":"2026-05-08T10:00:01Z","message":{"role":"user","content":"` + long + `"}}` + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := ParseSummary(path, "--proj--", "s.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	want := strings.Repeat("x", 80) + "…"
	if s.Name != want {
		t.Errorf("Name = %q, want %q", s.Name, want)
	}
}

func TestParseSummaryFallsBackToFilename(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "fallback.jsonl")
	content := `{"type":"session","timestamp":"2026-05-08T10:00:00Z"}` + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := ParseSummary(path, "--proj--", "fallback.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	if s.Name != "fallback.jsonl" {
		t.Errorf("Name = %q, want %q", s.Name, "fallback.jsonl")
	}
}

func TestParseSummaryAccumulatesUsage(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "s.jsonl")
	content := `{"type":"session","timestamp":"2026-05-08T10:00:00Z"}` + "\n" +
		`{"type":"message","timestamp":"2026-05-08T10:00:01Z","message":{"role":"assistant","content":"x","usage":{"totalTokens":100,"cost":{"total":0.01}}}}` + "\n" +
		`{"type":"message","timestamp":"2026-05-08T10:00:02Z","message":{"role":"assistant","content":"y","usage":{"totalTokens":50,"cost":{"total":0.005}}}}` + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := ParseSummary(path, "--proj--", "s.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	if s.TokenTotal != 150 {
		t.Errorf("TokenTotal = %d, want 150", s.TokenTotal)
	}
	if s.CostTotal < 0.0149 || s.CostTotal > 0.0151 {
		t.Errorf("CostTotal = %v, want ~0.015", s.CostTotal)
	}
	if s.MessageCount != 2 {
		t.Errorf("MessageCount = %d, want 2", s.MessageCount)
	}
}
```

(If `strings` is not yet imported in `session_test.go`, add it.)

- [ ] **Step 2: Run the tests (expect failure)**

Run: `go test ./internal/sessions/ -run TestParseSummary -v`
Expected: FAIL — `ParseSummary` undefined.

- [ ] **Step 3: Add SessionSummary type and ParseSummary**

In `internal/sessions/session.go`, replace the `Session` struct definition with:

```go
type SessionSummary struct {
	ID                 string
	Filename           string
	Project            string
	LastActivity       string
	Name               string
	MessageCount       int
	TokenTotal         int
	CostTotal          float64
	ChatAvailable      bool
	ChatDisabledReason string
}

type Session struct {
	SessionSummary
	Header  map[string]any
	Entries []map[string]any
}
```

Add `ParseSummary` after `ParseFile`:

```go
// ParseSummary streams path line-by-line, accumulating only the fields the
// index page needs. Lines are discarded after parsing — unlike ParseFile,
// the full conversation is not retained in memory.
func ParseSummary(path, dirName, fileName string) (SessionSummary, error) {
	f, err := os.Open(path)
	if err != nil {
		return SessionSummary{}, err
	}
	defer f.Close()

	s := SessionSummary{
		ID:            fileName,
		Filename:      fileName,
		Project:       cleanProjectName(dirName),
		ChatAvailable: true,
	}

	var headerName, firstUserText, headerCwd string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var raw map[string]any
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		if raw["type"] == "session" {
			if n, _ := raw["name"].(string); n != "" {
				headerName = n
			}
			if cwd, _ := raw["cwd"].(string); cwd != "" {
				headerCwd = cwd
			}
			continue
		}
		if ts, ok := raw["timestamp"].(string); ok {
			s.LastActivity = ts
		}
		if raw["type"] == "message" {
			msg, ok := raw["message"].(map[string]any)
			if !ok {
				continue
			}
			s.MessageCount++
			if usage, ok := msg["usage"].(map[string]any); ok {
				if t, ok := usage["totalTokens"].(float64); ok {
					s.TokenTotal += int(t)
				}
				if cost, ok := usage["cost"].(map[string]any); ok {
					if total, ok := cost["total"].(float64); ok {
						s.CostTotal += total
					}
				}
			}
			if firstUserText == "" {
				if role, _ := msg["role"].(string); role == "user" {
					firstUserText = extractMessageText(msg["content"])
				}
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return SessionSummary{}, err
	}

	if s.LastActivity == "" {
		if info, err := os.Stat(path); err == nil {
			s.LastActivity = info.ModTime().Format(time.RFC3339)
		}
	}

	switch {
	case headerName != "":
		s.Name = headerName
	case firstUserText != "":
		s.Name = truncate(firstUserText, 80)
	default:
		s.Name = fileName
	}

	if headerCwd != "" {
		if _, err := os.Stat(headerCwd); err != nil {
			s.ChatAvailable = false
			s.ChatDisabledReason = "This session can be viewed, but chat is disabled because its working directory no longer exists."
		}
	}

	return s, nil
}

func extractMessageText(content any) string {
	switch v := content.(type) {
	case string:
		return v
	case []any:
		var buf strings.Builder
		for _, item := range v {
			if block, ok := item.(map[string]any); ok {
				if t, _ := block["type"].(string); t == "text" {
					if txt, _ := block["text"].(string); txt != "" {
						buf.WriteString(txt)
					}
				}
			}
		}
		return buf.String()
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
```

Add to imports: `"bufio"`.

Update `ParseFile` to also populate `SessionSummary` fields by delegating to a small inner helper, or simpler — leave `ParseFile` as-is and after building `sess`, copy its scalar fields into the embedded `SessionSummary` and compute `Name` the same way `ParseSummary` does. To stay DRY, refactor `ParseFile` to call `ParseSummary` first and then re-parse for `Entries`/`Header`:

```go
func ParseFile(path, dirName, fileName string) (Session, error) {
	summary, err := ParseSummary(path, dirName, fileName)
	if err != nil {
		return Session{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Session{}, err
	}
	sess := Session{SessionSummary: summary}
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var raw map[string]any
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		sess.Entries = append(sess.Entries, raw)
		if raw["type"] == "session" {
			sess.Header = raw
		}
	}
	return sess, nil
}
```

- [ ] **Step 4: Run the tests (expect pass)**

Run: `go test ./internal/sessions/ -v`
Expected: all pass — including the existing `ParseFile` tests, since `Session` still embeds `SessionSummary`.

- [ ] **Step 5: Commit**

```bash
git add internal/sessions/session.go internal/sessions/session_test.go
git commit -m "feat(sessions): add SessionSummary type and streaming ParseSummary"
```

---

### Task 2.2: Cache returns SessionSummary

**Files:**
- Modify: `internal/sessions/cache.go`
- Modify: `internal/sessions/cache_test.go`

- [ ] **Step 1: Update Cache shape**

In `internal/sessions/cache.go`, replace `cacheEntry` and `LoadAll`:

```go
type cacheEntry struct {
	modTime time.Time
	dirName string
	summary SessionSummary
}

type Cache struct {
	mu      sync.Mutex
	entries map[string]cacheEntry

	parses int
	hits   int
}

func NewCache() *Cache {
	return &Cache{entries: make(map[string]cacheEntry)}
}

func (c *Cache) LoadAll(dir string) ([]SessionSummary, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	seen := make(map[string]struct{})
	var summaries []SessionSummary
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		subDir := filepath.Join(dir, e.Name())
		subs, err := os.ReadDir(subDir)
		if err != nil {
			continue
		}
		for _, f := range subs {
			if f.IsDir() || !strings.HasSuffix(f.Name(), ".jsonl") {
				continue
			}
			path := filepath.Join(subDir, f.Name())
			seen[path] = struct{}{}
			info, err := f.Info()
			if err != nil {
				continue
			}
			if cached, ok := c.entries[path]; ok && cached.modTime.Equal(info.ModTime()) && cached.dirName == e.Name() {
				c.hits++
				summaries = append(summaries, cached.summary)
				continue
			}
			summary, err := ParseSummary(path, e.Name(), f.Name())
			if err != nil {
				continue
			}
			c.parses++
			c.entries[path] = cacheEntry{modTime: info.ModTime(), dirName: e.Name(), summary: summary}
			summaries = append(summaries, summary)
		}
	}

	for p := range c.entries {
		if _, ok := seen[p]; !ok {
			delete(c.entries, p)
		}
	}

	SortSummariesByActivity(summaries)
	return summaries, nil
}
```

Add a `SortSummariesByActivity` next to `SortByActivity` in `session.go`:

```go
func SortSummariesByActivity(s []SessionSummary) {
	sort.Slice(s, func(i, j int) bool {
		ti, _ := time.Parse(time.RFC3339, s[i].LastActivity)
		tj, _ := time.Parse(time.RFC3339, s[j].LastActivity)
		return ti.After(tj)
	})
}
```

- [ ] **Step 2: Update cache_test.go**

In `internal/sessions/cache_test.go`, change every place that asserts on `cached.session` to `cached.summary`, and any return-type assertions from `[]Session` to `[]SessionSummary`. Field accesses on returned items remain valid because the names are unchanged (Project, LastActivity, MessageCount, etc.).

- [ ] **Step 3: Run the tests**

Run: `go test ./internal/sessions/ -v`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add internal/sessions/cache.go internal/sessions/cache_test.go internal/sessions/session.go
git commit -m "refactor(sessions): cache stores SessionSummary; LoadAll returns summaries"
```

---

### Task 2.3: Server wiring + share resolver refactor

**Files:**
- Modify: `internal/server/server.go`
- Modify: `internal/server/handlers.go`
- Modify: `internal/server/share.go`
- Modify: `internal/share/share.go`
- Modify: `internal/share/share_test.go`
- Modify: `main.go`
- Modify: `internal/server/server_test.go` (the helper from 1.1)

- [ ] **Step 1: Update Server.Deps and loadSessions**

In `internal/server/server.go`:

```go
type Deps struct {
	SessionsDir   string
	Auth          *auth.Middleware
	ChatSender    ChatSender
	Cache         *sessions.Cache
	RenderIndex   func(w io.Writer, summaries []sessions.SessionSummary) error
	RenderSession func(s sessions.Session, showButtons bool) string
	Models        func(ctx context.Context) (json.RawMessage, error)
	Now           func() time.Time
}
```

Update the `Server` field type and the `New` assignment to match. Replace `loadSessions`:

```go
func (s *Server) loadSummaries() ([]sessions.SessionSummary, error) {
	return s.cache.LoadAll(s.sessionsDir)
}
```

Update `handleIndex` in `handlers.go`:

```go
func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	summaries, err := s.loadSummaries()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.renderIndex(w, summaries); err != nil {
		fmt.Fprintf(os.Stderr, "template error: %v\n", err)
	}
}
```

- [ ] **Step 2: Refactor share to use a resolver**

In `internal/share/share.go`, change `Dependencies`:

```go
type Dependencies struct {
	Runner   Runner
	Resolve  func(id string) (sessions.Session, error)
	Render   func(sessions.Session, bool) string
}
```

Replace the `loaded, err := deps.Sessions()` block (around lines 93–109) with:

```go
	resolved, err := deps.Resolve(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "session not found")
		return
	}
	html := deps.Render(resolved, false)
	if html == "" {
		writeJSONError(w, http.StatusNotFound, "session not found")
		return
	}
```

Update `internal/server/share.go`:

```go
func (s *Server) handleShare(w http.ResponseWriter, r *http.Request) {
	var runner share.Runner
	if s.shareRunner != nil {
		runner = shareRunnerAdapter{runner: s.shareRunner}
	}
	share.Handle(w, r, share.Dependencies{
		Runner: runner,
		Resolve: func(id string) (sessions.Session, error) {
			resolved, err := sessions.ResolveByID(s.sessionsDir, id)
			if err != nil {
				return sessions.Session{}, err
			}
			return resolved.Session, nil
		},
		Render: s.renderSession,
	})
}
```

- [ ] **Step 3: Update share_test.go**

Search for `Sessions:` in `internal/share/share_test.go` and replace each construction with the resolver shape. Pattern:

```go
// Before:
deps := share.Dependencies{
	Runner:   fakeRunner,
	Sessions: func() ([]sessions.Session, error) { return testSessions, nil },
	Render:   func(s sessions.Session, _ bool) string { return "<html>" + s.ID + "</html>" },
}

// After:
deps := share.Dependencies{
	Runner: fakeRunner,
	Resolve: func(id string) (sessions.Session, error) {
		for _, s := range testSessions {
			if s.ID == id {
				return s, nil
			}
		}
		return sessions.Session{}, sessions.ErrSessionNotFound
	},
	Render: func(s sessions.Session, _ bool) string { return "<html>" + s.ID + "</html>" },
}
```

Apply this transform to every test in the file.

- [ ] **Step 4: Update main.go RenderIndex wiring**

In `main.go`:

```go
		RenderIndex:   func(w io.Writer, ss []sessions.SessionSummary) error { return indexTmpl.Execute(w, ss) },
```

- [ ] **Step 5: Update test helper from Task 1.1**

In `internal/server/server_test.go`, change the `RenderIndex` field in `newTestServer` to:

```go
		RenderIndex:   func(w io.Writer, _ []sessions.SessionSummary) error { return nil },
```

- [ ] **Step 6: Run all tests**

Run: `go test ./...`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add internal/server/ internal/share/ main.go
git commit -m "refactor(server,share): index path uses SessionSummary; share resolves by id"
```

---

### Task 2.4: Template uses .Name

**Files:**
- Modify: `index_template.go`
- Modify: `templates/index.html`

- [ ] **Step 1: Find current sessionName uses**

Run: `grep -n sessionName /Users/setkyar/pi-web/templates/index.html /Users/setkyar/pi-web/index_template.go`
Note every line that uses `sessionName .` — these all become `.Name`.

- [ ] **Step 2: Update template**

In `templates/index.html`, replace every `{{ sessionName . }}` with `{{ .Name }}`. Verify with:

```bash
grep -n sessionName templates/index.html || echo "no remaining uses"
```

- [ ] **Step 3: Drop sessionName from index_template.go**

In `index_template.go`, delete the `sessionName` function (lines 40–74) and remove `"sessionName": sessionName,` from `funcMap`. The remaining `funcMap` should be:

```go
var funcMap = template.FuncMap{
	"fmtTime":     fmtTime,
	"fmtTokens":   fmtTokens,
	"fmtCost":     fmtCost,
	"indexScript": func() string { return indexScriptPath },
}
```

Remove unused imports if any (`fmt` may still be needed for `fmtTokens`/`fmtCost` — keep it).

- [ ] **Step 4: Build**

Run: `go build ./...`
Expected: clean build. If `index_template.go`'s import block now has unused imports, remove them.

- [ ] **Step 5: Run tests**

Run: `go test ./...`
Expected: all pass.

- [ ] **Step 6: Manual smoke**

```bash
go run . -p 31496 &
sleep 1
curl -s http://127.0.0.1:31496/ | grep -o 'session-card-name[^>]*>[^<]*' | head -3
kill -INT %1
wait
```

Expected: at least one session card name renders (or empty list if no sessions exist locally — either is fine).

- [ ] **Step 7: Commit**

```bash
git add index_template.go templates/index.html
git commit -m "feat(template): index uses precomputed .Name; drop sessionName template func"
```

---

### Task 2.5: Phase 2 PR

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --title "Sessions: split summary from full Session for the index path" --body "$(cat <<'EOF'
## Summary
- New `sessions.SessionSummary` carries only what the index page needs (counters, precomputed `Name`).
- `Cache.LoadAll` returns `[]SessionSummary`; `ParseSummary` streams the file with `bufio.Scanner` and discards each line.
- `Session` embeds `SessionSummary`, so the chat/render path keeps working.
- `share.Dependencies` swaps `Sessions []` for `Resolve func(id)` so it doesn't need the full session list.
- Index template uses `{{ .Name }}` directly; the `sessionName` template func is gone.

## Test plan
- [ ] `go test ./...` passes
- [ ] Index page renders with names matching previous behaviour (header `name` > first user message ≤80 chars > filename)
- [ ] Sharing a session still works
EOF
)"
```

---

## Phase 3 — SSE helpers (PR 3)

### Task 3.1: writeJSON helper + replace call sites

**Files:**
- Modify: `internal/server/server.go`
- Modify: `internal/server/handlers.go`
- Modify: `internal/server/chat.go`

- [ ] **Step 1: Add writeJSON helper**

In `internal/server/server.go`, append next to `writeJSONError`:

```go
// writeJSON writes payload as JSON. Pass status=0 to leave the default 200.
// Encode errors are intentionally discarded — by then headers are sent and
// the client is the right party to detect transport failure.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	if status != 0 {
		w.WriteHeader(status)
	}
	_ = json.NewEncoder(w).Encode(payload)
}
```

- [ ] **Step 2: Replace pairs in handlers.go**

For each of the four sites in `internal/server/handlers.go` (lines 58–62, 88–89, 97–98, 127–128), replace:

```go
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(payload)
```

with:

```go
writeJSON(w, 0, payload)
```

Concrete replacements:

- `handleApiSession` (around line 58): `writeJSON(w, 0, map[string]any{"header": resolved.Session.Header, "entries": resolved.Session.Entries})`
- `handleNewSession` (around line 88): `writeJSON(w, 0, map[string]any{"ok": true, "id": id})`
- `handleRecentLocations` (around line 97): `writeJSON(w, 0, map[string]any{"locations": locations})`
- `handleAvailableModels` (around line 127): `writeJSON(w, 0, map[string]any{"models": payload.Models})`

- [ ] **Step 3: Replace pairs in chat.go**

In `internal/server/chat.go`:

- `handleChat` (around line 67): `writeJSON(w, 0, map[string]any{"ok": true, "status": "accepted"})`
- `handleWorkerStatus` (around line 118): `writeJSON(w, 0, status)`
- `handleSetModel` (around line 175): `writeJSON(w, 0, map[string]any{"ok": true})`
- `handleSetThinkingLevel` (around line 216): `writeJSON(w, 0, map[string]any{"ok": true, "thinkingLevel": status.ThinkingLevel})`

- [ ] **Step 4: Run tests**

Run: `go test ./internal/server/ -v`
Expected: all pass — payloads unchanged.

- [ ] **Step 5: Commit**

```bash
git add internal/server/server.go internal/server/handlers.go internal/server/chat.go
git commit -m "refactor(server): unify success-path JSON encoding behind writeJSON"
```

---

### Task 3.2: SSE event coalescing

**Files:**
- Modify: `internal/server/server.go`
- Modify: `internal/server/events.go`
- Modify: `internal/server/sse_test.go` (or new test file)
- Test: `internal/server/sse_coalesce_test.go` (new)

- [ ] **Step 1: Write the failing test**

Create `internal/server/sse_coalesce_test.go`:

```go
package server

import (
	"testing"
	"time"
)

func drainOnce(c *sseClient, timeout time.Duration) (string, bool) {
	select {
	case msg := <-c.ch:
		key := eventKey(msg)
		if key != "" {
			c.mu.Lock()
			delete(c.queued, key)
			c.mu.Unlock()
		}
		return msg, true
	case <-time.After(timeout):
		return "", false
	}
}

func TestBroadcastCoalescesReloads(t *testing.T) {
	s := newTestServer(t)
	defer s.Shutdown()
	c := s.addClient("sess-1")

	// Three rapid reloads; reader is paused.
	s.broadcast("sess-1", "reload")
	s.broadcast("sess-1", "reload")
	s.broadcast("sess-1", "reload")

	got1, ok := drainOnce(c, 100*time.Millisecond)
	if !ok || got1 != "reload" {
		t.Fatalf("expected 1st reload, got %q ok=%v", got1, ok)
	}
	// Now that the reader cleared the queued bit, a fresh reload may queue again.
	s.broadcast("sess-1", "reload")
	got2, ok := drainOnce(c, 100*time.Millisecond)
	if !ok || got2 != "reload" {
		t.Fatalf("expected 2nd reload after drain, got %q ok=%v", got2, ok)
	}
	// Channel should be empty.
	if _, ok := drainOnce(c, 50*time.Millisecond); ok {
		t.Fatal("expected channel empty, got extra event")
	}
}

func TestBroadcastDeliversReloadAndStatusIndependently(t *testing.T) {
	s := newTestServer(t)
	defer s.Shutdown()
	c := s.addClient("sess-2")

	s.broadcast("sess-2", "reload")
	s.broadcast("sess-2", "event: status-delta\ndata: {\"id\":\"sess-2\",\"running\":true}")

	got1, ok := drainOnce(c, 100*time.Millisecond)
	if !ok {
		t.Fatal("expected first event")
	}
	got2, ok := drainOnce(c, 100*time.Millisecond)
	if !ok {
		t.Fatal("expected second event")
	}
	if got1 == got2 {
		t.Fatalf("expected distinct events, got %q twice", got1)
	}
}
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `go test ./internal/server/ -run TestBroadcastCoalesces -v`
Expected: FAIL — `eventKey` undefined and `c.queued`/`c.mu` fields don't exist.

- [ ] **Step 3: Update sseClient and broadcast**

In `internal/server/server.go`, replace `sseClient`, `addClient`, and `broadcast`:

```go
type sseClient struct {
	ch     chan string
	sessID string
	mu     sync.Mutex
	queued map[string]bool
}

func (s *Server) addClient(sessID string) *sseClient {
	c := &sseClient{
		ch:     make(chan string, 16),
		sessID: sessID,
		queued: make(map[string]bool),
	}
	s.clientsMu.Lock()
	s.clients = append(s.clients, c)
	s.clientsMu.Unlock()
	return c
}

// eventKey returns a coalescing key for msg. Events with the same non-empty
// key are deduplicated while pending in a client's channel; an empty key
// means "always deliver, drop on full" (status events self-heal via
// reconnect snapshot).
func eventKey(msg string) string {
	switch msg {
	case "reload":
		return "reload"
	case "new-session":
		return "new-session"
	}
	return ""
}

func (s *Server) broadcast(sessID, msg string) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	key := eventKey(msg)
	for _, c := range s.clients {
		if c.sessID != sessID {
			continue
		}
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
			// drop — only reachable when key is empty (status events)
		}
		c.mu.Unlock()
	}
}
```

- [ ] **Step 4: Update reader to clear queued bit**

In `internal/server/events.go`, replace the receive case in `handleEvents`:

```go
		case msg, open := <-client.ch:
			if !open {
				return
			}
			if key := eventKey(msg); key != "" {
				client.mu.Lock()
				delete(client.queued, key)
				client.mu.Unlock()
			}
			if strings.HasPrefix(msg, "event: ") {
				fmt.Fprint(w, msg+"\n\n")
			} else {
				fmt.Fprintf(w, "data: %s\n\n", msg)
			}
			flusher.Flush()
```

- [ ] **Step 5: Run the tests**

Run: `go test ./internal/server/ -v`
Expected: all pass, including the two new coalesce tests and the existing `sse_test.go`.

- [ ] **Step 6: Commit**

```bash
git add internal/server/server.go internal/server/events.go internal/server/sse_coalesce_test.go
git commit -m "feat(server): coalesce reload/new-session SSE events per client"
```

---

### Task 3.3: Phase 3 PR

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --title "SSE: coalesce reload events; writeJSON helper" --body "$(cat <<'EOF'
## Summary
- `writeJSON(w, status, payload)` replaces the `Content-Type` + `Encode` pair across handlers; success-path JSON encoding is now uniform.
- Per-client SSE `queued` map dedupes pending `reload` and `new-session` events so a slow reader can no longer miss a reload to a burst of writes.
- Status events stay drop-on-full; the snapshot on reconnect recovers state.
- Channel buffer bumped from 4 to 16.

## Test plan
- [ ] `go test ./internal/server/...` passes
- [ ] New coalesce tests assert (a) three rapid reloads collapse to one delivery, (b) reload + status-delta both deliver
EOF
)"
```

---

## Self-review

**Spec coverage:**
- Item 1 (timeouts + shutdown): Tasks 1.1, 1.2 ✓
- Item 2 (summary split): Tasks 2.1–2.4 ✓ (+ share resolver refactor noted in spec gap)
- Item 3 (traversal check): Task 1.3 ✓
- Item 4 (SSE coalesce): Task 3.2 ✓
- Item 5 (state file flock): Task 1.4 ✓
- Item 6 (writeJSON): Task 3.1 ✓

**Type consistency:** `SessionSummary` field names match the spec; `eventKey`, `queued`, `mu` consistent across server.go and events.go; `Resolve` field on `share.Dependencies` consistent across share.go and server/share.go.

**Placeholder scan:** none.
