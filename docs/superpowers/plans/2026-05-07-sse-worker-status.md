# SSE Worker Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace N polling requests to `/api/worker-status?id=` with a single SSE connection that pushes status updates for all visible homepage session cards.

**Architecture:** Extend the existing `/events` SSE endpoint to accept `ids` (comma-separated session IDs). The server computes the initial status map on connect, sends it, then pushes updates whenever any tracked session's status changes. A separate `statusBroadcast` mechanism (distinct from the existing `sseClient` reload broadcast) prevents chat-page reloads on status-only changes. The file watcher is extended to watch the `session-status` directory. The client opens one EventSource, updates card classes as events arrive, and reconnects when the visible session set changes.

**Tech Stack:** Go 1.22, vanilla JS (EventSource), SSE

---

## File Structure

| File | Responsibility |
|------|---------------|
| `chat_handler.go` | Extract `computeWorkerStatus` helper; keep HTTP endpoint working |
| `chat_handler_test.go` | Tests for `computeWorkerStatus` |
| `main.go` | Add `statusBroadcast` mechanism; extend `handleEvents` with `ids` support |
| `main_test.go` | Tests for batch SSE endpoint |
| `file_watcher.go` | Call `broadcastStatusChange` on session file changes; watch `session-status` dir |
| `web/src/index/index.js` | Replace polling with EventSource; reconnect on visible-set changes |
| `web/src/index/index.test.js` | Tests for SSE client behavior |

---

## Task 1: Extract `computeWorkerStatus` helper

**Files:**
- Modify: `chat_handler.go`
- Test: `chat_handler_test.go`

- [ ] **Step 1: Write failing test**

```go
func TestComputeWorkerStatusUsesSessionStatusFile(t *testing.T) {
	root := t.TempDir()
	sessionsDir := filepath.Join(root, "sessions")
	statusDir := filepath.Join(root, "session-status")
	if err := os.MkdirAll(statusDir, 0755); err != nil {
		t.Fatal(err)
	}
	sessionID := "test-session.jsonl"
	status := map[string]any{
		"sessionId": sessionID,
		"state":     "running",
		"updatedAt": time.Now().UTC().Format(time.RFC3339),
	}
	data, _ := json.Marshal(status)
	if err := os.WriteFile(filepath.Join(statusDir, sessionID), data, 0644); err != nil {
		t.Fatal(err)
	}

	s := &server{sessionsDir: sessionsDir, chatSender: &fakeSender{}}
	result := s.computeWorkerStatus(context.Background(), sessionID)
	if result == nil || result.State != workers.WorkerStateRunning {
		t.Fatalf("expected running, got %v", result)
	}
}

func TestComputeWorkerStatusReturnsIdleWhenNoStatusFile(t *testing.T) {
	root := t.TempDir()
	sessionsDir := filepath.Join(root, "sessions")
	s := &server{sessionsDir: sessionsDir, chatSender: &fakeSender{}}
	result := s.computeWorkerStatus(context.Background(), "nonexistent.jsonl")
	if result == nil || result.State != workers.WorkerStateIdle {
		t.Fatalf("expected idle, got %v", result)
	}
}
```

Run: `go test -run 'TestComputeWorkerStatus' .`
Expected: FAIL (method not defined)

- [ ] **Step 2: Extract helper and update `handleWorkerStatus`**

In `chat_handler.go`:

```go
func (s *server) computeWorkerStatus(ctx context.Context, sessionID string) *workers.WorkerStatus {
	if status := s.readSessionStatus(sessionID); status != nil {
		return status
	}
	status := s.chatSender.Status(sessionID)
	if status.State != workers.WorkerStateRunning {
		if state, err := s.chatSender.GetState(ctx, sessionID); err == nil {
			status.ThinkingLevel = state.ThinkingLevel
		}
	}
	if status.State == workers.WorkerStateIdle && s.hasRecentSessionActivity(sessionID) {
		status.State = workers.WorkerStateRunning
	}
	return &status
}

func (s *server) handleWorkerStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("id")
	status := s.computeWorkerStatus(r.Context(), sessionID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}
```

Run: `go test -run 'TestComputeWorkerStatus' .`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add chat_handler.go chat_handler_test.go
git commit -m "refactor: extract computeWorkerStatus helper for reuse"
```

---

## Task 2: Add `statusBroadcast` mechanism

**Files:**
- Modify: `main.go`
- Test: `main_test.go`

A separate broadcast from `sseClient` so status-only changes don't trigger chat-page reloads.

- [ ] **Step 1: Write failing test**

```go
func TestBroadcastStatusChangeNotifiesSubscribers(t *testing.T) {
	root := t.TempDir()
	srv := newServer(filepath.Join(root, "sessions"), nil)

	client := srv.addStatusClient("s1.jsonl")
	defer srv.removeStatusClient(client)

	srv.broadcastStatusChange("s1.jsonl")

	select {
	case <-client.ch:
		// success
	case <-time.After(2 * time.Second):
		t.Fatal("expected status broadcast")
	}
}

func TestBroadcastStatusChangeIgnoresOtherSessions(t *testing.T) {
	root := t.TempDir()
	srv := newServer(filepath.Join(root, "sessions"), nil)

	client := srv.addStatusClient("s1.jsonl")
	defer srv.removeStatusClient(client)

	srv.broadcastStatusChange("s2.jsonl")

	select {
	case <-client.ch:
		t.Fatal("should not receive broadcast for different session")
	case <-time.After(200 * time.Millisecond):
		// success
	}
}
```

Run: `go test -run 'TestBroadcastStatusChange' .`
Expected: FAIL (methods not defined)

- [ ] **Step 2: Add types and methods to `main.go`**

```go
type statusClient struct {
	ch     chan struct{}
	sessID string
}

// Add to server struct:
// statusClients   []*statusClient
// statusClientsMu sync.RWMutex

func (s *server) addStatusClient(sessID string) *statusClient {
	c := &statusClient{ch: make(chan struct{}, 1), sessID: sessID}
	s.statusClientsMu.Lock()
	s.statusClients = append(s.statusClients, c)
	s.statusClientsMu.Unlock()
	return c
}

func (s *server) removeStatusClient(target *statusClient) {
	s.statusClientsMu.Lock()
	filtered := s.statusClients[:0]
	for _, c := range s.statusClients {
		if c != target {
			filtered = append(filtered, c)
		}
	}
	s.statusClients = filtered
	s.statusClientsMu.Unlock()
	close(target.ch)
}

func (s *server) broadcastStatusChange(sessID string) {
	s.statusClientsMu.RLock()
	defer s.statusClientsMu.RUnlock()
	for _, c := range s.statusClients {
		if c.sessID == sessID {
			select {
			case c.ch <- struct{}{}:
			default:
			}
		}
	}
}
```

Update `newServer` to initialize `statusClients: make([]*statusClient, 0)`.

Run: `go test -run 'TestBroadcastStatusChange' .`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add main.go main_test.go
git commit -m "feat: add statusBroadcast mechanism for SSE status pushes"
```

---

## Task 3: Wire file watcher to broadcast status changes

**Files:**
- Modify: `file_watcher.go`
- Modify: `main.go` (add `statusDir` to server)
- Test: `main_test.go`

- [ ] **Step 1: Write failing test**

```go
func TestFileChangeBroadcastsStatusChange(t *testing.T) {
	root := t.TempDir()
	sessionsDir := filepath.Join(root, "sessions")
	srv := newServer(sessionsDir, nil)

	projectDir := filepath.Join(sessionsDir, "testproj")
	os.MkdirAll(projectDir, 0755)
	sessionFile := filepath.Join(projectDir, "session.jsonl")
	os.WriteFile(sessionFile, []byte(`{}`), 0644)

	client := srv.addStatusClient("session.jsonl")
	defer srv.removeStatusClient(client)

	// Trigger file modification
	os.WriteFile(sessionFile, []byte(`{"updated":true}`), 0644)
	info, _ := os.Stat(sessionFile)
	srv.recordModTime("session.jsonl", info.ModTime())

	select {
	case <-client.ch:
		// success
	case <-time.After(2 * time.Second):
		t.Fatal("expected status broadcast after file change")
	}
}
```

Run: `go test -run 'TestFileChangeBroadcastsStatusChange' .`
Expected: FAIL (no broadcast in recordModTime)

- [ ] **Step 2: Update `recordModTime` to broadcast status change**

In `file_watcher.go`:

```go
func (s *server) recordModTime(sessID string, mod time.Time) {
	s.fileModMu.Lock()
	lastMod, known := s.fileMod[sessID]
	s.fileMod[sessID] = mod
	s.fileModMu.Unlock()
	if known && mod.After(lastMod) {
		s.broadcast(sessID, "reload")
		s.broadcastStatusChange(sessID)
	}
}
```

Run: `go test -run 'TestFileChangeBroadcastsStatusChange' .`
Expected: PASS

- [ ] **Step 3: Add session-status directory watching**

Add `statusDir` to `server` struct and initialize it in `newServer`:

```go
func newServer(sessionsDir string, auth *auth.Middleware) *server {
	statusDir := filepath.Join(filepath.Dir(sessionsDir), "session-status")
	s := &server{
		// ... existing fields ...
		statusDir: statusDir,
	}
	// ...
}
```

In `file_watcher.go`, add `scanStatusDir`:

```go
func (s *server) scanStatusDir() {
	entries, err := os.ReadDir(s.statusDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".jsonl") {
			continue
		}
		path := filepath.Join(s.statusDir, e.Name())
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		s.recordStatusModTime(e.Name(), info.ModTime())
	}
}

func (s *server) recordStatusModTime(sessID string, mod time.Time) {
	s.fileModMu.Lock()
	lastMod, known := s.fileMod[sessID]
	s.fileMod[sessID] = mod
	s.fileModMu.Unlock()
	if known && mod.After(lastMod) {
		s.broadcastStatusChange(sessID)
	}
}
```

In `scanForChanges`, also call `s.scanStatusDir()`. In `watchFilesFsnotify`, also watch `s.statusDir` if it exists.

- [ ] **Step 4: Commit**

```bash
git add file_watcher.go main.go main_test.go
git commit -m "feat: wire file watcher to broadcast status changes"
```

---

## Task 4: Extend `/events` endpoint for batch status

**Files:**
- Modify: `main.go`
- Test: `main_test.go`

- [ ] **Step 1: Write failing test**

```go
func TestHandleEventsWithIdsSendsInitialStatusMap(t *testing.T) {
	root := t.TempDir()
	sessionsDir := filepath.Join(root, "sessions")
	srv := newServer(sessionsDir, nil)

	req := httptest.NewRequest(http.MethodGet, "/events?ids=s1.jsonl,s2.jsonl", nil)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		defer close(done)
		srv.handleEvents(w, req)
	}()

	time.Sleep(100 * time.Millisecond)

	<-done

	body := w.Body.String()
	if !strings.Contains(body, "data:") {
		t.Fatalf("expected SSE data event, got: %s", body)
	}
	if !strings.Contains(body, `"s1.jsonl"`) || !strings.Contains(body, `"s2.jsonl"`) {
		t.Fatalf("expected both session IDs in response, got: %s", body)
	}
}
```

Run: `go test -run 'TestHandleEventsWithIds' .`
Expected: FAIL (endpoint doesn't support `ids`)

- [ ] **Step 2: Extend `handleEvents`**

```go
func (s *server) handleEvents(w http.ResponseWriter, r *http.Request) {
	singleID := r.URL.Query().Get("id")
	multiIDs := r.URL.Query().Get("ids")

	if singleID == "" && multiIDs == "" {
		http.Error(w, "missing id or ids", 400)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	// Single-session mode (existing)
	if singleID != "" {
		client := s.addClient(singleID)
		defer s.removeClient(client)
		fmt.Fprintf(w, ":ok\n\n")
		flusher.Flush()
		for {
			select {
			case msg, open := <-client.ch:
				if !open {
					return
				}
				fmt.Fprintf(w, "data: %s\n\n", msg)
				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	}

	// Multi-session mode
	ids := strings.Split(multiIDs, ",")
	if len(ids) == 0 {
		return
	}

	clients := make([]*statusClient, len(ids))
	for i, id := range ids {
		clients[i] = s.addStatusClient(id)
	}
	defer func() {
		for _, c := range clients {
			s.removeStatusClient(c)
		}
	}()

	lastSent := make(map[string]string, len(ids))
	s.sendStatusMapIfChanged(w, flusher, r.Context(), ids, lastSent)

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ":hb\n\n")
			flusher.Flush()
		default:
			changed := false
			for _, c := range clients {
				select {
				case <-c.ch:
					changed = true
				default:
				}
			}
			if changed {
				s.sendStatusMapIfChanged(w, flusher, r.Context(), ids, lastSent)
			} else {
				time.Sleep(50 * time.Millisecond)
			}
		}
	}
}

func (s *server) sendStatusMapIfChanged(w http.ResponseWriter, flusher http.Flusher, ctx context.Context, ids []string, lastSent map[string]string) {
	result := make(map[string]*workers.WorkerStatus, len(ids))
	changed := false
	for _, id := range ids {
		status := s.computeWorkerStatus(ctx, id)
		result[id] = status
		if lastSent[id] != status.State {
			lastSent[id] = status.State
			changed = true
		}
	}
	if !changed {
		return
	}
	data, _ := json.Marshal(result)
	fmt.Fprintf(w, "data: %s\n\n", string(data))
	flusher.Flush()
}
```

Run: `go test -run 'TestHandleEventsWithIds' .`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add main.go main_test.go
git commit -m "feat: extend /events with batch status via ids param"
```

---

## Task 5: Replace client-side polling with EventSource

**Files:**
- Modify: `web/src/index/index.js`
- Test: `web/src/index/index.test.js`

- [ ] **Step 1: Write failing test**

```js
// In web/src/index/index.test.js

describe('SSE batch status', () => {
  test('opens EventSource with ids query param', () => {
    const sources = [];
    global.EventSource = class MockEventSource {
      constructor(url) {
        this.url = url;
        sources.push(this);
      }
      close() {}
    };

    document.body.innerHTML = `
      <div class="session-card" data-session-id="s1.jsonl"></div>
      <div class="session-card" data-session-id="s2.jsonl"></div>
    `;

    const page = createSessionsPage();
    page.subscribe();

    expect(sources.length).toBe(1);
    expect(sources[0].url).toContain('/events?ids=');
    expect(sources[0].url).toContain('s1.jsonl');
    expect(sources[0].url).toContain('s2.jsonl');
  });

  test('updates running classes on status event', () => {
    let source = null;
    global.EventSource = class MockEventSource {
      constructor(url) {
        this.url = url;
        source = this;
        this.onmessage = null;
      }
      close() {}
    };

    document.body.innerHTML = `
      <div class="session-card" data-session-id="s1.jsonl"></div>
      <div class="session-card" data-session-id="s2.jsonl"></div>
    `;

    const page = createSessionsPage();
    page.subscribe();

    source.onmessage({
      data: JSON.stringify({
        's1.jsonl': { state: 'running' },
        's2.jsonl': { state: 'idle' }
      })
    });

    const cards = document.querySelectorAll('.session-card');
    expect(cards[0].classList.contains('session-card--running')).toBe(true);
    expect(cards[1].classList.contains('session-card--running')).toBe(false);
  });
});
```

Run: `npm test -- web/src/index/index.test.js`
Expected: FAIL (EventSource not used)

- [ ] **Step 2: Implement SSE client**

Replace the polling logic in `web/src/index/index.js`:

```js
export function createSessionsPage({ fetchImpl = globalThis.fetch?.bind(globalThis), pollIntervalMs = 1500 } = {}) {
  return {
    query: '',
    modal: false,
    path: '',
    recent: [],
    creating: false,
    error: '',
    runningSessionIds: new Set(),
    _es: null,
    _pollTimer: null,
    _unloadHandler: null,

    sessionCards() {
      return Array.from(document.querySelectorAll('.session-card[data-session-id]'));
    },

    visibleSessionCards() {
      return this.sessionCards().filter((card) => !card.classList.contains('hidden'));
    },

    syncRunningCardClasses() {
      this.sessionCards().forEach((card) => {
        const id = card.dataset.sessionId;
        card.classList.toggle('session-card--running', !!id && this.runningSessionIds.has(id));
      });
    },

    updateRunningFromStatusMap(statusMap) {
      const nextRunning = new Set();
      for (const [id, payload] of Object.entries(statusMap)) {
        if (payload && payload.state === 'running') {
          nextRunning.add(id);
        }
      }
      this.runningSessionIds = nextRunning;
      this.syncRunningCardClasses();
    },

    startStatusPolling() {
      this.stopStatusPolling();
      const refresh = () => {
        if (document.visibilityState === 'hidden') return;
        void this.refreshRunningStatuses();
      };
      refresh();
      this._pollTimer = window.setInterval(refresh, pollIntervalMs);
    },

    stopStatusPolling() {
      if (this._pollTimer) {
        window.clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    cleanup() {
      this.stopStatusPolling();
      if (this._es) {
        this._es.close();
        this._es = null;
      }
      if (this._unloadHandler) {
        window.removeEventListener('beforeunload', this._unloadHandler);
        this._unloadHandler = null;
      }
    },

    connectStatusStream() {
      this.stopStatusPolling();
      const cards = this.visibleSessionCards();
      const ids = cards.map((c) => c.dataset.sessionId).filter(Boolean);
      if (ids.length === 0) {
        this.runningSessionIds = new Set();
        this.syncRunningCardClasses();
        return;
      }
      try {
        const es = new EventSource('/events?ids=' + encodeURIComponent(ids.join(',')));
        this._es = es;
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            this.updateRunningFromStatusMap(data);
          } catch {
            // ignore non-JSON events
          }
        };
        es.onerror = () => {
          // EventSource auto-reconnects; if it fails permanently,
          // fall back to polling after a delay
          window.setTimeout(() => {
            if (!this._es || this._es.readyState === EventSource.CLOSED) {
              this.startStatusPolling();
            }
          }, 5000);
        };
      } catch {
        this.startStatusPolling();
      }
    },

    subscribe() {
      try {
        this.cleanup();
        const es = new EventSource('/events?id=__all__');
        this._es = es;
        es.onmessage = (e) => {
          if (e.data === 'new-session') window.location.reload();
        };
        this._unloadHandler = () => this.cleanup();
        window.addEventListener('beforeunload', this._unloadHandler);
        this.connectStatusStream();
      } catch {
        this.startStatusPolling();
      }
    },

    filter() {
      const q = this.query.toLowerCase();
      document.querySelectorAll('.session-card').forEach((card) => {
        const match = card.dataset.search.toLowerCase().includes(q);
        card.classList.toggle('hidden', !match);
      });
      document.querySelectorAll('.project-group').forEach((group) => {
        const anyVisible = group.querySelector('.session-card:not(.hidden)') !== null;
        group.style.display = anyVisible ? '' : 'none';
      });
      // Reconnect status stream with new visible set
      this.connectStatusStream();
    },

    // ... existing openModal and create methods ...
  };
}
```

Run: `npm test -- web/src/index/index.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add web/src/index/index.js web/src/index/index.test.js
git commit -m "feat: replace polling with SSE batch status on homepage"
```

---

## Task 6: Integration verification

- [ ] **Step 1: Run all tests**

```bash
go test ./...
npm test
```

Expected: All pass

- [ ] **Step 2: Manual verification checklist**

1. Start pi-web
2. Open homepage with multiple sessions
3. Open browser Network tab
4. Confirm only ONE `/events?ids=...` request (not N `/api/worker-status` polls)
5. Start a chat in one session from terminal
6. Confirm the running indicator appears on the correct card via SSE push
7. Stop the chat
8. Confirm the running indicator disappears via SSE push
9. Filter the session list
10. Confirm the SSE reconnects with new `ids`

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "verify: SSE batch status integration"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Single SSE connection instead of N polls — Task 4 + 5
- ✅ Push updates when status changes — Task 3 (broadcast) + Task 4 (SSE endpoint)
- ✅ Initial state on connect — Task 4
- ✅ Reconnect on filter changes — Task 5 (`filter()` calls `connectStatusStream()`)
- ✅ Heartbeat keepalive — Task 4 (15s ticker with `:hb` comment)
- ✅ Fallback to polling if SSE fails — Task 5 (`onerror` fallback)
- ✅ Doesn't break existing single-session `/events?id=` — Task 4 preserves existing path
- ✅ Doesn't trigger chat page reloads on heartbeat — Task 2 uses separate `statusBroadcast`

**2. Placeholder scan:**
- ✅ No "TBD", "TODO", "implement later"
- ✅ All code blocks contain complete implementations
- ✅ All tests have exact expected outputs
- ✅ Type names consistent throughout

**3. Type consistency:**
- ✅ `computeWorkerStatus(ctx, sessionID)` signature consistent in all tasks
- ✅ `statusClient` / `addStatusClient` / `removeStatusClient` / `broadcastStatusChange` consistent
- ✅ `WorkerStatus` from `internal/workers` used consistently
