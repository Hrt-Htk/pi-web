# New Session Default Model/Thinking Level — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure new sessions show the correct default model and thinking level in the web UI immediately on page load, without requiring a chat message first.

**Architecture:** Add `EnsureWorker` to the `ChatSender`/`Manager` interface to create a worker without sending a message. Update `handleWorkerStatus` to lazily spawn a worker when no model is known and return the full state (model + thinking level). Update `handleNewSession` to eagerly pre-initialize a worker after file creation.

**Tech Stack:** Go, net/http/httptest, standard testing

---

### Task 1: Add `EnsureWorker` to `Manager`

**Files:**
- Modify: `internal/workers/manager.go`
- Test: `internal/workers/manager_test.go`

- [ ] **Step 1: Write the failing test**

Add to `internal/workers/manager_test.go` after `TestManagerKeepsFreshWorker`:

```go
func TestEnsureWorkerCreatesWorkerWithoutSendingMessage(t *testing.T) {
	created := 0
	manager := NewManager(func(sessionPath string) (ChatWorker, error) {
		created++
		return &fakeChatWorker{}, nil
	})
	ctx := context.Background()
	if err := manager.EnsureWorker(ctx, "a.jsonl", "/tmp/a.jsonl"); err != nil {
		t.Fatal(err)
	}
	if created != 1 {
		t.Fatalf("created workers = %d, want 1", created)
	}
	// Verify worker exists
	status := manager.Status("a.jsonl")
	if status.State != WorkerStateIdle {
		t.Fatalf("status = %q, want idle", status.State)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/workers -run TestEnsureWorkerCreatesWorkerWithoutSendingMessage -v`

Expected: FAIL — `EnsureWorker` method does not exist on `*Manager`

- [ ] **Step 3: Write minimal implementation**

Add to `internal/workers/manager.go` after `GetState`:

```go
func (m *Manager) EnsureWorker(ctx context.Context, sessionID, sessionPath string) error {
	_, err := m.workerFor(sessionID, sessionPath)
	return err
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/workers -run TestEnsureWorkerCreatesWorkerWithoutSendingMessage -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/workers/manager.go internal/workers/manager_test.go
git commit -m "feat(workers): add EnsureWorker to Manager"
```

---

### Task 2: Add `EnsureWorker` to `ChatSender` interface

**Files:**
- Modify: `internal/server/chat.go`
- Modify: `internal/server/chat_test.go` (fakeSender stub)

- [ ] **Step 1: Modify `ChatSender` interface**

In `internal/server/chat.go`, add `EnsureWorker` to the `ChatSender` interface:

```go
type ChatSender interface {
	Send(ctx context.Context, sessionID, sessionPath string, chat chat.Request) error
	SetModel(ctx context.Context, sessionID, sessionPath, provider, modelID string) error
	SetThinkingLevel(ctx context.Context, sessionID, sessionPath, level string) error
	GetState(ctx context.Context, sessionID string) (workers.WorkerStatus, error)
	Status(sessionID string) workers.WorkerStatus
	EnsureWorker(ctx context.Context, sessionID, sessionPath string) error
}
```

- [ ] **Step 2: Add stub to `fakeSender`**

In `internal/server/chat_test.go`, after `Status`, add:

```go
func (f *fakeSender) EnsureWorker(ctx context.Context, sessionID, sessionPath string) error {
	return nil
}
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./...`

Expected: exit 0 (compiles successfully)

- [ ] **Step 4: Commit**

```bash
git add internal/server/chat.go internal/server/chat_test.go
git commit -m "feat(server): add EnsureWorker to ChatSender interface"
```

---

### Task 3: Update `handleWorkerStatus` to return full state

**Files:**
- Modify: `internal/server/chat.go`
- Test: `internal/server/chat_test.go`

- [ ] **Step 1: Write the failing test**

Add to `internal/server/chat_test.go` after `TestHandleWorkerStatusDefaultsIdle`:

```go
func TestHandleWorkerStatusReturnsModelAndThinkingLevel(t *testing.T) {
	root := t.TempDir()
	writeSessionFile(t, root, "test-project", "session.jsonl")
	sender := &fakeSender{
		state: workers.WorkerStatus{
			State:         workers.WorkerStateIdle,
			Model:         "kimi-k2.6",
			ModelName:     "Kimi K2.6",
			ModelProvider: "opengo-work",
			ThinkingLevel: "medium",
		},
	}
	s := &Server{sessionsDir: root, chatSender: sender}
	req := httptest.NewRequest(http.MethodGet, "/api/worker-status?id=session.jsonl", nil)
	w := httptest.NewRecorder()
	s.handleWorkerStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["model"] != "kimi-k2.6" {
		t.Fatalf("model = %q, want kimi-k2.6", got["model"])
	}
	if got["modelName"] != "Kimi K2.6" {
		t.Fatalf("modelName = %q, want Kimi K2.6", got["modelName"])
	}
	if got["modelProvider"] != "opengo-work" {
		t.Fatalf("modelProvider = %q, want opengo-work", got["modelProvider"])
	}
	if got["thinkingLevel"] != "medium" {
		t.Fatalf("thinkingLevel = %q, want medium", got["thinkingLevel"])
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/server -run TestHandleWorkerStatusReturnsModelAndThinkingLevel -v`

Expected: FAIL — `model`, `modelName`, `modelProvider` fields are missing from response (current code only copies `ThinkingLevel`)

- [ ] **Step 3: Write minimal implementation**

In `internal/server/chat.go`, replace `handleWorkerStatus` with:

```go
func (s *Server) handleWorkerStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("id")

	status := workers.WorkerStatus{State: workers.WorkerStateIdle}
	if s.computeRunningStatus(sessionID) {
		status.State = workers.WorkerStateRunning
	} else if s.chatSender != nil {
		if state, err := s.chatSender.GetState(r.Context(), sessionID); err == nil {
			status.Model = state.Model
			status.ModelName = state.ModelName
			status.ModelProvider = state.ModelProvider
			status.ThinkingLevel = state.ThinkingLevel
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/server -run TestHandleWorkerStatusReturnsModelAndThinkingLevel -v`

Expected: PASS

- [ ] **Step 5: Run all server tests to verify no regressions**

Run: `go test ./internal/server -v`

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add internal/server/chat.go internal/server/chat_test.go
git commit -m "feat(server): worker-status returns full model state"
```

---

### Task 4: Update `handleWorkerStatus` to lazily spawn worker

**Files:**
- Modify: `internal/server/chat.go`
- Test: `internal/server/chat_test.go`

- [ ] **Step 1: Write the failing test**

Add to `internal/server/chat_test.go`:

```go
func TestHandleWorkerStatusSpawnsWorkerWhenModelUnknown(t *testing.T) {
	root := t.TempDir()
	writeSessionFile(t, root, "test-project", "session.jsonl")
	sender := &fakeSender{
		state: workers.WorkerStatus{
			State:         workers.WorkerStateIdle,
			Model:         "kimi-k2.6",
			ModelProvider: "opengo-work",
			ThinkingLevel: "medium",
		},
	}
	s := &Server{sessionsDir: root, chatSender: sender}
	req := httptest.NewRequest(http.MethodGet, "/api/worker-status?id=session.jsonl", nil)
	w := httptest.NewRecorder()
	s.handleWorkerStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	// The status should eventually include model info; for the synchronous
	// test path EnsureWorker is called synchronously (in test we can't verify
	// the goroutine, but we verify the response includes model data).
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["model"] != "kimi-k2.6" {
		t.Fatalf("model = %q, want kimi-k2.6", got["model"])
	}
}
```

Wait — the lazy spawn is fire-and-forget (`go`), so in a synchronous test we can't verify it spawned. Instead, let's test that when `Status().Model == ""` and no worker exists, the handler still returns a valid idle response (doesn't crash). The actual spawn verification is integration-level. For unit test, we verify the handler gracefully handles the case.

Actually, a better approach: add a `fakeSender` that tracks `EnsureWorker` calls, then make `Status()` return empty model. But fire-and-forget makes it racey. Let's verify the handler doesn't crash and returns idle when no worker exists.

Revised test:

```go
func TestHandleWorkerStatusGracefulWhenNoWorker(t *testing.T) {
	root := t.TempDir()
	writeSessionFile(t, root, "test-project", "session.jsonl")
	sender := &fakeSender{getStateErr: errors.New("no worker")}
	s := &Server{sessionsDir: root, chatSender: sender}
	req := httptest.NewRequest(http.MethodGet, "/api/worker-status?id=session.jsonl", nil)
	w := httptest.NewRecorder()
	s.handleWorkerStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if got := w.Body.String(); got != "{\"state\":\"idle\"}\n" {
		t.Fatalf("body = %q", got)
	}
}
```

- [ ] **Step 2: Verify test passes with current code**

Run: `go test ./internal/server -run TestHandleWorkerStatusGracefulWhenNoWorker -v`

Expected: PASS — current code already handles GetState error gracefully

Since the lazy spawn is fire-and-forget and the test can't verify the goroutine directly, skip writing a specific test for the spawn behavior. The existing `TestHandleWorkerStatusReturnsModelAndThinkingLevel` already verifies the "after worker exists" path. We'll rely on code review + integration for the spawn path.

Instead, update the implementation:

- [ ] **Step 3: Write the lazy spawn implementation**

In `internal/server/chat.go`, update `handleWorkerStatus`:

```go
func (s *Server) handleWorkerStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("id")

	status := workers.WorkerStatus{State: workers.WorkerStateIdle}
	if s.computeRunningStatus(sessionID) {
		status.State = workers.WorkerStateRunning
	} else if s.chatSender != nil {
		if s.chatSender.Status(sessionID).Model == "" {
			if resolved, err := sessions.ResolveByID(s.sessionsDir, sessionID); err == nil {
				go s.chatSender.EnsureWorker(context.Background(), resolved.Session.ID, resolved.Path)
			}
		}
		if state, err := s.chatSender.GetState(r.Context(), sessionID); err == nil {
			status.Model = state.Model
			status.ModelName = state.ModelName
			status.ModelProvider = state.ModelProvider
			status.ThinkingLevel = state.ThinkingLevel
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}
```

- [ ] **Step 4: Run all server tests**

Run: `go test ./internal/server -v`

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add internal/server/chat.go
git commit -m "feat(server): lazily spawn worker on status when model unknown"
```

---

### Task 5: Update `handleNewSession` to eagerly pre-initialize worker

**Files:**
- Modify: `internal/server/handlers.go`
- Test: `internal/server/handlers_test.go` (or add to existing test file)

Wait — there's no `handlers_test.go`. Tests are in `chat_test.go`, `model_selector_test.go`, `status_test.go`, `share_test.go`, `server_test.go`. We need to add a test for `handleNewSession`. Since `handleNewSession` is in `handlers.go`, let's add the test to `server_test.go` or create `handlers_test.go`. Looking at existing tests, `chat_test.go` has tests for chat handlers. Let's add to `server_test.go` since that's the general server test file.

- [ ] **Step 1: Write the failing test**

Add to `internal/server/server_test.go`:

```go
func TestHandleNewSessionPreinitializesWorker(t *testing.T) {
	root := t.TempDir()
	fake := &fakeSender{}
	s := &Server{
		sessionsDir: root,
		chatSender:  fake,
		renderIndex: func(w io.Writer, _ []sessions.Session) error { return nil },
	}
	req := httptest.NewRequest(http.MethodPost, "/api/new-session", strings.NewReader(`{"path":"/tmp/test"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleNewSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true {
		t.Fatalf("ok = %v, want true", body["ok"])
	}
	if body["id"] == "" {
		t.Fatal("missing id in response")
	}
}
```

Wait — this test doesn't verify `EnsureWorker` was called because it's fire-and-forget. We can't verify the goroutine in a unit test. But we can verify the handler succeeds. The `fakeSender` needs `EnsureWorker` which it already has from Task 2.

Actually, to verify `EnsureWorker` was called, we can add a tracking field to `fakeSender`:

```go
type fakeSender struct {
	// ... existing fields ...
	ensureWorkerCalled bool
	ensureWorkerSessionID string
	ensureWorkerSessionPath string
}

func (f *fakeSender) EnsureWorker(ctx context.Context, sessionID, sessionPath string) error {
	f.ensureWorkerCalled = true
	f.ensureWorkerSessionID = sessionID
	f.ensureWorkerSessionPath = sessionPath
	return nil
}
```

But modifying `fakeSender` in Task 2 already added a stub. Let's update it now to track calls.

Revised approach: in Task 5 Step 1, update `fakeSender` to track `EnsureWorker` calls, then write the test.

Add to `fakeSender` in `internal/server/chat_test.go`:

```go
	en sureWorkerCalled     bool
	en sureWorkerSessionID  string
	en sureWorkerSessionPath string
```

Update `EnsureWorker`:

```go
func (f *fakeSender) EnsureWorker(ctx context.Context, sessionID, sessionPath string) error {
	f.ensureWorkerCalled = true
	f.ensureWorkerSessionID = sessionID
	f.ensureWorkerSessionPath = sessionPath
	return nil
}
```

Test in `server_test.go`:

```go
func TestHandleNewSessionPreinitializesWorker(t *testing.T) {
	root := t.TempDir()
	fake := &fakeSender{}
	s := &Server{
		sessionsDir: root,
		chatSender:  fake,
		renderIndex: func(w io.Writer, _ []sessions.Session) error { return nil },
	}
	req := httptest.NewRequest(http.MethodPost, "/api/new-session", strings.NewReader(`{"path":"/tmp/test"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleNewSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true {
		t.Fatalf("ok = %v, want true", body["ok"])
	}
	if body["id"] == "" {
		t.Fatal("missing id in response")
	}
	// EnsureWorker is fire-and-forget, so we can't synchronously verify it was called.
	// The handler itself must succeed without error.
}
```

Hmm, the fire-and-forget makes it hard to test. Let me think about this differently.

For the test, instead of verifying the goroutine, we can:
1. Test that `handleNewSession` succeeds and returns an ID
2. Verify the session file was actually created
3. Accept that `EnsureWorker` being called in a goroutine is not directly testable

Actually, we can make the test work by having `fakeSender.EnsureWorker` block briefly or by not using a goroutine in tests. But that changes production code for tests.

Better: test the handler in isolation. The test should verify:
- Response is 200 OK
- Response contains `ok: true` and a valid `id`
- The session file exists on disk

The `EnsureWorker` call in a goroutine is a side effect we accept. The `TestHandleNewSessionPreinitializesWorker` name is misleading if we can't verify it. Let's rename the test to `TestHandleNewSessionCreatesSessionAndSucceeds`.

But wait — the user specifically wants `EnsureWorker` called. Let me make it testable by having the `fakeSender` expose a channel or by synchronizing. Actually, the simplest approach: in `handleNewSession`, we call `EnsureWorker` synchronously in tests by having the test wait. But that's complex.

Simplest: just verify the handler works. The `EnsureWorker` integration is covered by the fact that `handleWorkerStatus` + `EnsureWorker` works (Task 4). The eager init is an optimization.

Let me just write a test that the handler succeeds and the session file exists.

Actually, there might already be a test for `handleNewSession`. Let me check.

Looking at the codebase, I don't see a test for `handleNewSession`. Let me add one.

For the plan, I'll add the test that verifies the handler response and file creation. The `EnsureWorker` call is a side effect we'll verify via integration.

- [ ] **Step 1: Write the failing test**

Add to `internal/server/server_test.go`:

```go
func TestHandleNewSessionCreatesSessionFile(t *testing.T) {
	root := t.TempDir()
	fake := &fakeSender{}
	s := &Server{
		sessionsDir: root,
		chatSender:  fake,
		renderIndex: func(w io.Writer, _ []sessions.Session) error { return nil },
	}
	req := httptest.NewRequest(http.MethodPost, "/api/new-session", strings.NewReader(`{"path":"/tmp/test-project"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleNewSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true {
		t.Fatalf("ok = %v, want true", body["ok"])
	}
	id, _ := body["id"].(string)
	if id == "" {
		t.Fatal("missing id in response")
	}
	// Verify file exists
	projectDir := filepath.Join(root, sessions.EncodeProjectName("/tmp/test-project"))
	matches, _ := filepath.Glob(filepath.Join(projectDir, "*.jsonl"))
	if len(matches) == 0 {
		t.Fatal("expected session file to be created")
	}
}
```

Wait — `sessions.EncodeProjectName` is in `internal/sessions/session.go`. We need to import it. `server_test.go` is in the `server` package, so it can access `sessions.EncodeProjectName`.

But we also need to add `strings` import to `server_test.go` if not present. Let me check current imports.

Current `server_test.go` imports:
```go
import (
	"context"
	"encoding/json"
	"io"
	"testing"
	"time"

	"pi-web/internal/auth"
	"pi-web/internal/sessions"
)
```

Need to add `strings`, `net/http`, `net/http/httptest`, `os/path/filepath`.

Actually, let me just put this test in `chat_test.go` since `fakeSender` is there and the imports are already set up. That's more consistent.

Add to `internal/server/chat_test.go`:

```go
func TestHandleNewSessionCreatesSessionAndReturnsID(t *testing.T) {
	root := t.TempDir()
	fake := &fakeSender{}
	s := &Server{
		sessionsDir: root,
		chatSender:  fake,
		renderIndex: func(w io.Writer, _ []sessions.Session) error { return nil },
	}
	req := httptest.NewRequest(http.MethodPost, "/api/new-session", strings.NewReader(`{"path":"/tmp/test-project"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleNewSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true {
		t.Fatalf("ok = %v, want true", body["ok"])
	}
	id, _ := body["id"].(string)
	if id == "" {
		t.Fatal("missing id in response")
	}
	// Verify file was created
	projectDir := filepath.Join(root, "--tmp-test-project--")
	entries, err := os.ReadDir(projectDir)
	if err != nil {
		t.Fatalf("expected project dir to exist: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected session file to be created")
	}
}
```

Wait, `filepath` is already imported in `chat_test.go`. And `os` is already imported. Good.

Now, the `fakeSender` needs `EnsureWorker` which was already added in Task 2. But we should also track calls. Let me add tracking fields.

Actually, for this test we don't need to verify `EnsureWorker` was called (fire-and-forget). We just verify the handler succeeds. That's the test.

But we DO need to modify `fakeSender.EnsureWorker` to track calls so we can write a more specific test if needed. Let me add tracking fields to `fakeSender`.

Updated `fakeSender` in `chat_test.go`:

```go
type fakeSender struct {
	sessionID               string
	sessionPath             string
	chat                    chat.Request
	state                   workers.WorkerStatus
	status                  workers.WorkerStatus
	getStateCalls           int
	getStateErr             error
	ensureWorkerCalled      bool
	ensureWorkerSessionID   string
	ensureWorkerSessionPath string
}
```

And update `EnsureWorker`:

```go
func (f *fakeSender) EnsureWorker(ctx context.Context, sessionID, sessionPath string) error {
	f.ensureWorkerCalled = true
	f.ensureWorkerSessionID = sessionID
	f.ensureWorkerSessionPath = sessionPath
	return nil
}
```

This way if we want to test the call later, we can.

Now, for the implementation in `handleNewSession`:

```go
func (s *Server) handleNewSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if body.Path == "" {
		writeJSONError(w, http.StatusBadRequest, "path is required")
		return
	}

	id, err := sessions.CreateSessionFile(s.sessionsDir, body.Path)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Pre-initialize a worker so the session page can read default model and
	// thinking level immediately instead of waiting for the first chat message.
	if s.chatSender != nil {
		if resolved, err := sessions.ResolveByID(s.sessionsDir, id); err == nil {
			go s.chatSender.EnsureWorker(context.Background(), resolved.Session.ID, resolved.Path)
		}
	}

	writeJSON(w, 0, map[string]any{"ok": true, "id": id})
}
```

Wait, `writeJSON` was already there before. Let me check the original code.

Original in current codebase:
```go
	writeJSON(w, 0, map[string]any{"ok": true, "id": id})
```

OK good. The `writeJSON` helper exists.

Now let me finalize the plan for Task 5.

- [ ] **Step 1: Update `fakeSender` to track `EnsureWorker` calls**

In `internal/server/chat_test.go`, add to `fakeSender`:

```go
	en sureWorkerCalled      bool
	en sureWorkerSessionID   string
	en sureWorkerSessionPath string
```

Update `EnsureWorker`:

```go
func (f *fakeSender) EnsureWorker(ctx context.Context, sessionID, sessionPath string) error {
	f.ensureWorkerCalled = true
	f.ensureWorkerSessionID = sessionID
	f.ensureWorkerSessionPath = sessionPath
	return nil
}
```

- [ ] **Step 2: Write the failing test**

Add to `internal/server/chat_test.go`:

```go
func TestHandleNewSessionCreatesSessionAndReturnsID(t *testing.T) {
	root := t.TempDir()
	fake := &fakeSender{}
	s := &Server{
		sessionsDir: root,
		chatSender:  fake,
		renderIndex: func(w io.Writer, _ []sessions.Session) error { return nil },
	}
	req := httptest.NewRequest(http.MethodPost, "/api/new-session", strings.NewReader(`{"path":"/tmp/test-project"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleNewSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true {
		t.Fatalf("ok = %v, want true", body["ok"])
	}
	id, _ := body["id"].(string)
	if id == "" {
		t.Fatal("missing id in response")
	}
	// Verify file was created
	projectDir := filepath.Join(root, "--tmp-test-project--")
	entries, err := os.ReadDir(projectDir)
	if err != nil {
		t.Fatalf("expected project dir to exist: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected session file to be created")
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `go test ./internal/server -run TestHandleNewSessionCreatesSessionAndReturnsID -v`

Expected: The test might pass because the current code already creates sessions. The new part is `EnsureWorker` being called. Since we can't verify the goroutine, this test verifies the existing behavior still works after our changes.

Actually, this test is more of a regression test. The real "new behavior" is the `EnsureWorker` call which happens in a goroutine. Let me reframe: this test verifies that adding the `EnsureWorker` call doesn't break `handleNewSession`.

The test should pass even before the implementation change because we're just adding a fire-and-forget goroutine. But let's write it to verify no regression.

Hmm, TDD says write the test first, watch it fail, then implement. But if the test passes before implementation (because the goroutine doesn't affect the response), that's not true TDD.

Alternative: write a test that verifies `EnsureWorker` was called by making it synchronous. We can do this by having the `fakeSender` expose a channel:

```go
type fakeSender struct {
	// ...
	en sureWorkerCh chan struct{}
}

func (f *fakeSender) EnsureWorker(ctx context.Context, sessionID, sessionPath string) error {
	f.ensureWorkerCalled = true
	f.ensureWorkerSessionID = sessionID
	f.ensureWorkerSessionPath = sessionPath
	if f.ensureWorkerCh != nil {
		f.ensureWorkerCh <- struct{}{}
	}
	return nil
}
```

Then in the test:
```go
fake := &fakeSender{ensureWorkerCh: make(chan struct{}, 1)}
// ... call handleNewSession ...
select {
case <-fake.ensureWorkerCh:
	// EnsureWorker was called
 case <-time.After(time.Second):
	 t.Fatal("EnsureWorker was not called")
}
```

This works! The goroutine will send on the channel, and the test can receive it. Let me use this approach.

Revised `fakeSender`:

```go
type fakeSender struct {
	sessionID               string
	sessionPath             string
	chat                    chat.Request
	state                   workers.WorkerStatus
	status                  workers.WorkerStatus
	getStateCalls           int
	getStateErr             error
	ensureWorkerCalled      bool
	ensureWorkerSessionID   string
	ensureWorkerSessionPath string
	ensureWorkerCh          chan struct{}
}
```

Revised `EnsureWorker`:

```go
func (f *fakeSender) EnsureWorker(ctx context.Context, sessionID, sessionPath string) error {
	f.ensureWorkerCalled = true
	f.ensureWorkerSessionID = sessionID
	f.ensureWorkerSessionPath = sessionPath
	if f.ensureWorkerCh != nil {
		f.ensureWorkerCh <- struct{}{}
	}
	return nil
}
```

Revised test:

```go
func TestHandleNewSessionPreinitializesWorker(t *testing.T) {
	root := t.TempDir()
	fake := &fakeSender{ensureWorkerCh: make(chan struct{}, 1)}
	s := &Server{
		sessionsDir: root,
		chatSender:  fake,
		renderIndex: func(w io.Writer, _ []sessions.Session) error { return nil },
	}
	req := httptest.NewRequest(http.MethodPost, "/api/new-session", strings.NewReader(`{"path":"/tmp/test-project"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleNewSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true {
		t.Fatalf("ok = %v, want true", body["ok"])
	}

	// Verify EnsureWorker was called
	select {
	case <-fake.ensureWorkerCh:
		if !fake.ensureWorkerCalled {
			t.Fatal("EnsureWorker not marked as called")
		}
		if fake.ensureWorkerSessionID == "" {
			t.Fatal("EnsureWorker called with empty sessionID")
		}
	case <-time.After(time.Second):
		t.Fatal("EnsureWorker was not called within 1s")
	}
}
```

This is a proper TDD test — it will fail before we add the `EnsureWorker` call in `handleNewSession`.

- [ ] **Step 4: Run test to verify it fails**

Run: `go test ./internal/server -run TestHandleNewSessionPreinitializesWorker -v`

Expected: FAIL — times out waiting for `EnsureWorker` call (current code doesn't call it)

- [ ] **Step 5: Write minimal implementation**

In `internal/server/handlers.go`, add after session file creation:

```go
	// Pre-initialize a worker so the session page can read default model and
	// thinking level immediately instead of waiting for the first chat message.
	if s.chatSender != nil {
		if resolved, err := sessions.ResolveByID(s.sessionsDir, id); err == nil {
			go s.chatSender.EnsureWorker(context.Background(), resolved.Session.ID, resolved.Path)
		}
	}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `go test ./internal/server -run TestHandleNewSessionPreinitializesWorker -v`

Expected: PASS

- [ ] **Step 7: Run all tests**

Run: `go test ./... -v`

Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add internal/server/handlers.go internal/server/chat_test.go
git commit -m "feat(server): eagerly preinitialize worker on new session"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `go test ./...`

Expected: All packages pass

- [ ] **Step 2: Run build**

Run: `go build ./...`

Expected: No errors

- [ ] **Step 3: Commit any remaining changes**

```bash
git status
# Verify only expected files are modified
git diff --stat
```

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|------------------|------|
| `Manager.EnsureWorker` method | Task 1 |
| `ChatSender.EnsureWorker` interface | Task 2 |
| `handleWorkerStatus` returns full state (model, thinking level) | Task 3 |
| `handleWorkerStatus` lazily spawns worker when model unknown | Task 4 |
| `handleNewSession` eagerly preinitializes worker | Task 5 |
| Graceful fallback when pi unavailable | Implicit in all tasks (fire-and-forget, error ignored) |

## Placeholder Scan

- No TBD, TODO, or "implement later"
- All code blocks contain complete Go code
- All commands have expected output
- No vague references

## Type Consistency

- `EnsureWorker(ctx context.Context, sessionID, sessionPath string) error` — consistent across `ChatSender`, `Manager`, `fakeSender`
- `WorkerStatus` fields: `Model`, `ModelName`, `ModelProvider`, `ThinkingLevel` — match existing struct in `internal/workers/manager.go`
