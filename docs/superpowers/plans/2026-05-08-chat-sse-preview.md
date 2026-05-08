# Chat SSE Preview Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add best-effort chat preview streaming over the existing per-session SSE connection while keeping JSONL reloads as canonical state.

**Architecture:** The RPC worker converts `message_update` text events into full-content preview events. The worker manager injects a session-scoped callback, and the server broadcasts safe named SSE JSON events to the same session topic. The browser renders a temporary assistant preview block and removes it when the existing `/api/session` reload reconciliation runs.

**Tech Stack:** Go 1.25, vanilla JS in embedded session templates, Server-Sent Events, JSONL RPC over `pi --mode rpc`, Go tests + Vitest/export tests.

---

## File Structure

- `internal/server/sse_format.go` — new focused helper for named JSON SSE formatting.
- `internal/server/sse_format_test.go` — unit tests for safe SSE formatting.
- `internal/rpc/stream.go` — new focused types/helpers for RPC stream preview events.
- `internal/rpc/stream_test.go` — unit tests for preview accumulation.
- `internal/rpc/worker.go` — wire preview accumulator into stdout handling and expose constructor accepting a stream callback.
- `internal/rpc/worker_test.go` — verify worker emits preview callbacks from RPC lines.
- `internal/workers/manager.go` — change factory signature to include session ID and path.
- `internal/workers/manager_test.go` — verify manager passes session ID/path to factory.
- `main.go` — construct worker manager with server stream callback support.
- `internal/server/server.go` — add stream event callback method and use safe SSE formatting.
- `templates/live_reload.js` — render and clear temporary assistant preview blocks.
- `export_html_test.go` — verify exported session HTML includes preview SSE handling.
- `docs/architecture/*.md`, `docs/sequence-flows/*.md`, `README.md` — update live reload/chat streaming descriptions.

---

### Task 1: Add safe named SSE JSON formatter

**Files:**
- Create: `internal/server/sse_format.go`
- Create: `internal/server/sse_format_test.go`

- [ ] **Step 1: Write the failing formatter tests**

Create `internal/server/sse_format_test.go`:

```go
package server

import (
	"strings"
	"testing"
)

func TestFormatSSEJSONEventEscapesPayloadAsSingleDataLine(t *testing.T) {
	msg, err := formatSSEJSONEvent("chat-preview", map[string]any{
		"content": "hello\nworld",
		"done":    false,
	})
	if err != nil {
		t.Fatalf("formatSSEJSONEvent returned error: %v", err)
	}
	if !strings.HasPrefix(msg, "event: chat-preview\ndata: ") {
		t.Fatalf("message prefix = %q", msg)
	}
	if strings.Contains(msg, "\nworld") {
		t.Fatalf("payload newline was emitted as raw SSE newline: %q", msg)
	}
	if strings.HasSuffix(msg, "\n\n") {
		t.Fatalf("formatter should not append terminating blank line; handleEvents does that: %q", msg)
	}
	if !strings.Contains(msg, `"content":"hello\\nworld"`) {
		t.Fatalf("payload was not JSON escaped: %q", msg)
	}
}

func TestFormatSSEJSONEventRejectsEmptyName(t *testing.T) {
	if _, err := formatSSEJSONEvent("", map[string]any{"ok": true}); err == nil {
		t.Fatalf("expected error for empty event name")
	}
}
```

- [ ] **Step 2: Run the formatter tests and verify RED**

Run:

```bash
go test ./internal/server -run 'TestFormatSSEJSONEvent' -count=1
```

Expected: FAIL because `formatSSEJSONEvent` is undefined.

- [ ] **Step 3: Implement the formatter**

Create `internal/server/sse_format.go`:

```go
package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

func formatSSEJSONEvent(name string, payload any) (string, error) {
	if strings.TrimSpace(name) == "" {
		return "", errors.New("sse event name required")
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("event: %s\ndata: %s", name, data), nil
}
```

- [ ] **Step 4: Run the formatter tests and verify GREEN**

Run:

```bash
go test ./internal/server -run 'TestFormatSSEJSONEvent' -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/server/sse_format.go internal/server/sse_format_test.go
git commit -m "feat(server): add safe SSE JSON formatter"
```

---

### Task 2: Add RPC preview accumulation helpers

**Files:**
- Create: `internal/rpc/stream.go`
- Create: `internal/rpc/stream_test.go`

- [ ] **Step 1: Write failing stream accumulator tests**

Create `internal/rpc/stream_test.go`:

```go
package rpc

import "testing"

func TestStreamPreviewAccumulatorBuildsFullContentFromTextDeltas(t *testing.T) {
	acc := &streamPreviewAccumulator{}

	first, ok := acc.handleAssistantEvent(assistantMessageEvent{Type: "text_delta", Delta: "hel"})
	if !ok {
		t.Fatalf("first delta did not emit preview")
	}
	if first.Content != "hel" || first.Done {
		t.Fatalf("first preview = %+v, want content hel done false", first)
	}

	second, ok := acc.handleAssistantEvent(assistantMessageEvent{Type: "text_delta", Delta: "lo"})
	if !ok {
		t.Fatalf("second delta did not emit preview")
	}
	if second.Content != "hello" || second.Done {
		t.Fatalf("second preview = %+v, want content hello done false", second)
	}
}

func TestStreamPreviewAccumulatorUsesTextEndContentAndMarksDone(t *testing.T) {
	acc := &streamPreviewAccumulator{}
	_, _ = acc.handleAssistantEvent(assistantMessageEvent{Type: "text_delta", Delta: "draft"})

	preview, ok := acc.handleAssistantEvent(assistantMessageEvent{Type: "text_end", Content: "final"})
	if !ok {
		t.Fatalf("text_end did not emit preview")
	}
	if preview.Content != "final" || !preview.Done {
		t.Fatalf("preview = %+v, want final done preview", preview)
	}
}

func TestStreamPreviewAccumulatorIgnoresNonTextEvents(t *testing.T) {
	acc := &streamPreviewAccumulator{}
	if preview, ok := acc.handleAssistantEvent(assistantMessageEvent{Type: "thinking_end"}); ok {
		t.Fatalf("thinking event emitted preview: %+v", preview)
	}
}

func TestStreamPreviewAccumulatorCompletesExistingPreview(t *testing.T) {
	acc := &streamPreviewAccumulator{}
	_, _ = acc.handleAssistantEvent(assistantMessageEvent{Type: "text_delta", Delta: "hello"})

	preview, ok := acc.complete()
	if !ok {
		t.Fatalf("complete did not emit preview")
	}
	if preview.Content != "hello" || !preview.Done {
		t.Fatalf("preview = %+v, want hello done", preview)
	}
	if _, ok := acc.complete(); ok {
		t.Fatalf("second complete should not emit after reset")
	}
}
```

- [ ] **Step 2: Run the accumulator tests and verify RED**

Run:

```bash
go test ./internal/rpc -run 'TestStreamPreviewAccumulator' -count=1
```

Expected: FAIL because stream preview types are undefined.

- [ ] **Step 3: Implement preview types and accumulator**

Create `internal/rpc/stream.go`:

```go
package rpc

type StreamPreview struct {
	Content string `json:"content"`
	Done    bool   `json:"done"`
}

type StreamEventSink func(StreamPreview)

type assistantMessageEvent struct {
	Type    string `json:"type"`
	Delta   string `json:"delta"`
	Content string `json:"content"`
}

type streamPreviewAccumulator struct {
	content string
	active  bool
}

func (a *streamPreviewAccumulator) handleAssistantEvent(event assistantMessageEvent) (StreamPreview, bool) {
	switch event.Type {
	case "text_delta":
		a.content += event.Delta
		a.active = true
		return StreamPreview{Content: a.content}, true
	case "text_end":
		if event.Content != "" {
			a.content = event.Content
		}
		if a.content == "" && !a.active {
			return StreamPreview{}, false
		}
		a.active = false
		preview := StreamPreview{Content: a.content, Done: true}
		a.content = ""
		return preview, true
	default:
		return StreamPreview{}, false
	}
}

func (a *streamPreviewAccumulator) complete() (StreamPreview, bool) {
	if a.content == "" && !a.active {
		return StreamPreview{}, false
	}
	preview := StreamPreview{Content: a.content, Done: true}
	a.content = ""
	a.active = false
	return preview, true
}
```

- [ ] **Step 4: Run the accumulator tests and verify GREEN**

Run:

```bash
go test ./internal/rpc -run 'TestStreamPreviewAccumulator' -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/rpc/stream.go internal/rpc/stream_test.go
git commit -m "feat(rpc): accumulate assistant stream previews"
```

---

### Task 3: Wire RPC worker stream callbacks

**Files:**
- Modify: `internal/rpc/worker.go`
- Modify: `internal/rpc/worker_test.go`

- [ ] **Step 1: Add failing worker callback tests**

Append to `internal/rpc/worker_test.go`:

```go
func TestHandleRPCLineEmitsStreamPreviewCallbacks(t *testing.T) {
	var previews []StreamPreview
	w := &piRPCWorker{
		status:        workers.WorkerStatus{State: workers.WorkerStateIdle},
		pending:       make(map[string]chan response),
		streamSink:    func(preview StreamPreview) { previews = append(previews, preview) },
		streamPreview: &streamPreviewAccumulator{},
	}

	w.handleRPCLine(`{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hel"}}`)
	w.handleRPCLine(`{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"lo"}}`)

	if len(previews) != 2 {
		t.Fatalf("previews = %d, want 2", len(previews))
	}
	if previews[0].Content != "hel" || previews[0].Done {
		t.Fatalf("first preview = %+v", previews[0])
	}
	if previews[1].Content != "hello" || previews[1].Done {
		t.Fatalf("second preview = %+v", previews[1])
	}
}

func TestHandleRPCLineEmitsDonePreviewOnAgentEnd(t *testing.T) {
	var previews []StreamPreview
	w := &piRPCWorker{
		status:        workers.WorkerStatus{State: workers.WorkerStateIdle},
		pending:       make(map[string]chan response),
		streamSink:    func(preview StreamPreview) { previews = append(previews, preview) },
		streamPreview: &streamPreviewAccumulator{},
	}

	w.handleRPCLine(`{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hello"}}`)
	w.handleRPCLine(`{"type":"agent_end"}`)

	if len(previews) != 2 {
		t.Fatalf("previews = %d, want 2", len(previews))
	}
	if previews[1].Content != "hello" || !previews[1].Done {
		t.Fatalf("done preview = %+v", previews[1])
	}
}
```

- [ ] **Step 2: Run worker callback tests and verify RED**

Run:

```bash
go test ./internal/rpc -run 'TestHandleRPCLineEmits.*Preview' -count=1
```

Expected: FAIL because `piRPCWorker` has no `streamSink` or `streamPreview` fields.

- [ ] **Step 3: Add stream fields and constructor**

In `internal/rpc/worker.go`, add fields to `piRPCWorker`:

```go
	streamSink           StreamEventSink
	streamPreview        *streamPreviewAccumulator
```

Change `NewPiWorker` to delegate:

```go
func NewPiWorker(sessionPath string) (workers.ChatWorker, error) {
	return NewPiWorkerWithStream(sessionPath, nil)
}

func NewPiWorkerWithStream(sessionPath string, streamSink StreamEventSink) (workers.ChatWorker, error) {
```

Move the existing `NewPiWorker` body into `NewPiWorkerWithStream`, and initialize the new fields in the worker literal:

```go
		streamSink:    streamSink,
		streamPreview: &streamPreviewAccumulator{},
```

- [ ] **Step 4: Process stream events in `handleRPCLine`**

In `handleRPCLine`, after unmarshalling `raw` and before/inside the existing switch, decode assistant events:

```go
	if raw["type"] == "message_update" {
		var msg struct {
			AssistantMessageEvent assistantMessageEvent `json:"assistantMessageEvent"`
		}
		if err := json.Unmarshal([]byte(line), &msg); err == nil {
			w.emitStreamPreview(msg.AssistantMessageEvent)
		}
	}
```

Add helper methods near `noteStreamActivity`:

```go
func (w *piRPCWorker) emitStreamPreview(event assistantMessageEvent) {
	if w.streamSink == nil || w.streamPreview == nil {
		return
	}
	if preview, ok := w.streamPreview.handleAssistantEvent(event); ok {
		w.streamSink(preview)
	}
}

func (w *piRPCWorker) completeStreamPreview() {
	if w.streamSink == nil || w.streamPreview == nil {
		return
	}
	if preview, ok := w.streamPreview.complete(); ok {
		w.streamSink(preview)
	}
}
```

In the existing switch, update completion cases:

```go
	case "message_update", "message_end", "turn_end":
		w.noteStreamActivity()
		if raw["type"] == "message_end" || raw["type"] == "turn_end" {
			w.completeStreamPreview()
		}
	case "agent_end":
		w.completeStreamPreview()
		w.mu.Lock()
		w.status = workers.WorkerStatus{State: workers.WorkerStateIdle}
		w.mu.Unlock()
		w.lastStreamActivity.Store(0)
```

- [ ] **Step 5: Run worker callback tests and verify GREEN**

Run:

```bash
go test ./internal/rpc -run 'TestHandleRPCLineEmits.*Preview|TestHandleRPCLineTracksThinkingAndTextStreamEvents' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/rpc/worker.go internal/rpc/worker_test.go
git commit -m "feat(rpc): emit stream preview callbacks"
```

---

### Task 4: Pass session identity through worker manager factories

**Files:**
- Modify: `internal/workers/manager.go`
- Modify: `internal/workers/manager_test.go`
- Modify: `main.go`

- [ ] **Step 1: Add failing manager factory test**

Append to `internal/workers/manager_test.go`:

```go
func TestManagerFactoryReceivesSessionIDAndPath(t *testing.T) {
	var gotID, gotPath string
	manager := NewManager(func(sessionID, sessionPath string) (ChatWorker, error) {
		gotID = sessionID
		gotPath = sessionPath
		return &fakeChatWorker{}, nil
	})

	if err := manager.EnsureWorker(context.Background(), "a.jsonl", "/tmp/a.jsonl"); err != nil {
		t.Fatal(err)
	}
	if gotID != "a.jsonl" || gotPath != "/tmp/a.jsonl" {
		t.Fatalf("factory got id=%q path=%q, want a.jsonl /tmp/a.jsonl", gotID, gotPath)
	}
}
```

- [ ] **Step 2: Run manager tests and verify RED**

Run:

```bash
go test ./internal/workers -run 'TestManagerFactoryReceivesSessionIDAndPath' -count=1
```

Expected: FAIL because `Factory` currently accepts only `sessionPath`.

- [ ] **Step 3: Change factory signature and worker creation**

In `internal/workers/manager.go`, change:

```go
type Factory func(sessionPath string) (ChatWorker, error)
```

to:

```go
type Factory func(sessionID, sessionPath string) (ChatWorker, error)
```

In `workerFor`, change:

```go
	worker, err := m.factory(sessionPath)
```

to:

```go
	worker, err := m.factory(sessionID, sessionPath)
```

- [ ] **Step 4: Update existing manager tests to new factory signature**

In `internal/workers/manager_test.go`, replace factory literals like:

```go
func(sessionPath string) (ChatWorker, error) {
```

with:

```go
func(sessionID, sessionPath string) (ChatWorker, error) {
```

For unused parameters, use:

```go
func(string, string) (ChatWorker, error) { return w, nil }
```

- [ ] **Step 5: Update main wiring to compile**

In `main.go`, replace manager construction:

```go
workers.NewManager(rpc.NewPiWorker)
```

with:

```go
workers.NewManager(func(_ string, sessionPath string) (workers.ChatWorker, error) {
	return rpc.NewPiWorker(sessionPath)
})
```

This preserves behavior until server streaming is wired in the next task.

- [ ] **Step 6: Run workers and root tests and verify GREEN**

Run:

```bash
go test ./...
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/workers/manager.go internal/workers/manager_test.go main.go
git commit -m "feat(workers): pass session identity to worker factory"
```

---

### Task 5: Broadcast worker previews through server SSE

**Files:**
- Modify: `internal/server/server.go`
- Modify: `main.go`
- Create: `internal/server/chat_preview_test.go`

- [ ] **Step 1: Write failing server broadcast test**

Create `internal/server/chat_preview_test.go`:

```go
package server

import (
	"strings"
	"testing"

	"pi-web/internal/rpc"
)

func TestBroadcastChatPreviewSendsNamedSSEToSession(t *testing.T) {
	s := New(Deps{})
	defer s.Shutdown()
	client := s.addClient("a.jsonl")
	defer s.removeClient(client)

	s.BroadcastChatPreview("a.jsonl", rpc.StreamPreview{Content: "hello\nworld", Done: false})

	select {
	case msg := <-client.ch:
		if !strings.HasPrefix(msg, "event: chat-preview\ndata: ") {
			t.Fatalf("msg = %q", msg)
		}
		if !strings.Contains(msg, `"content":"hello\\nworld"`) {
			t.Fatalf("content was not JSON escaped in msg = %q", msg)
		}
	default:
		t.Fatalf("expected chat-preview broadcast")
	}
}

func TestBroadcastChatPreviewDoesNotSendToGlobalTopic(t *testing.T) {
	s := New(Deps{})
	defer s.Shutdown()
	client := s.addClient(globalSessID)
	defer s.removeClient(client)

	s.BroadcastChatPreview("a.jsonl", rpc.StreamPreview{Content: "secret", Done: false})

	select {
	case msg := <-client.ch:
		t.Fatalf("global client received chat preview: %q", msg)
	default:
	}
}
```

- [ ] **Step 2: Run server preview tests and verify RED**

Run:

```bash
go test ./internal/server -run 'TestBroadcastChatPreview' -count=1
```

Expected: FAIL because `BroadcastChatPreview` is undefined.

- [ ] **Step 3: Implement server broadcast method**

In `internal/server/server.go`, add import if needed:

```go
"pi-web/internal/rpc"
```

Add method near `broadcast`:

```go
func (s *Server) BroadcastChatPreview(sessionID string, preview rpc.StreamPreview) {
	if sessionID == "" || sessionID == globalSessID {
		return
	}
	msg, err := formatSSEJSONEvent("chat-preview", preview)
	if err != nil {
		return
	}
	s.broadcast(sessionID, msg)
}
```

- [ ] **Step 4: Wire main to use streaming worker constructor**

In `main.go`, locate server construction. Because `srv` is needed by the worker factory, create the manager variable before `server.New` with a closure over `srv`:

```go
var srv *server.Server
manager := workers.NewManager(func(sessionID, sessionPath string) (workers.ChatWorker, error) {
	return rpc.NewPiWorkerWithStream(sessionPath, func(preview rpc.StreamPreview) {
		if srv != nil {
			srv.BroadcastChatPreview(sessionID, preview)
		}
	})
})
srv = server.New(server.Deps{
	// existing deps...
	ChatSender: manager,
})
```

Keep all other dependencies unchanged.

- [ ] **Step 5: Run server and full Go tests and verify GREEN**

Run:

```bash
go test ./internal/server ./...
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/server/server.go internal/server/chat_preview_test.go main.go
git commit -m "feat(server): broadcast chat previews over SSE"
```

---

### Task 6: Render temporary chat preview on the session page

**Files:**
- Modify: `templates/live_reload.js`
- Modify: `export_html_test.go`

- [ ] **Step 1: Add failing export test for preview handling**

Append to `export_html_test.go`:

```go
func TestSessionHTMLIncludesChatPreviewSSEHandling(t *testing.T) {
	sess := minimalSessionForExport()
	html := generateExportHtml(sess, true)
	for _, want := range []string{
		"chat-preview",
		"renderChatPreview",
		"clearChatPreview",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("exported html missing %q", want)
		}
	}
}
```

If `minimalSessionForExport` does not exist in this file, add this helper using the existing `sessions.Session` import pattern in the file:

```go
func minimalSessionForExport() sessions.Session {
	return sessions.Session{
		SessionSummary: sessions.SessionSummary{ID: "test.jsonl", Filename: "test.jsonl", ChatAvailable: true},
		Header:         map[string]any{"cwd": "/tmp", "name": "Test"},
		Entries:        []map[string]any{},
	}
}
```

- [ ] **Step 2: Run export test and verify RED**

Run:

```bash
go test . -run TestSessionHTMLIncludesChatPreviewSSEHandling -count=1
```

Expected: FAIL because preview functions/listener are absent.

- [ ] **Step 3: Add preview DOM helpers**

In `templates/live_reload.js`, after `showIndicator()` and before `es.onmessage`, add:

```js
  var chatPreviewEl = null;

  function clearChatPreview() {
    if (chatPreviewEl && chatPreviewEl.parentNode) {
      chatPreviewEl.parentNode.removeChild(chatPreviewEl);
    }
    chatPreviewEl = null;
  }

  function renderChatPreview(payload) {
    if (!payload || typeof payload.content !== 'string' || payload.content.length === 0) return;
    var container = document.getElementById('messages') || document.getElementById('content') || document.body;
    if (!chatPreviewEl) {
      chatPreviewEl = document.createElement('div');
      chatPreviewEl.id = 'chat-preview-stream';
      chatPreviewEl.className = 'entry message assistant chat-preview-stream';
      chatPreviewEl.innerHTML = '<div class="message-content"></div><div class="preview-label">streaming preview</div>';
      container.appendChild(chatPreviewEl);
    }
    var content = chatPreviewEl.querySelector('.message-content');
    if (content) {
      content.innerHTML = renderMarkdown(payload.content);
    }
    chatPreviewEl.classList.toggle('done', !!payload.done);
    scrollToBottom(false);
  }
```

- [ ] **Step 4: Clear preview during reload reconciliation**

At the beginning of the existing successful `/api/session` `.then(function(data) { ... })` reload handler, add:

```js
        clearChatPreview();
```

Specifically, the block should start:

```js
      .then(function(data) {
        clearChatPreview();
        var entries = data.entries || [];
```

- [ ] **Step 5: Add chat-preview SSE listener**

After the existing `es.onmessage = function(e) { ... };` block and before `es.onerror`, add:

```js
  es.addEventListener('chat-preview', function(e) {
    try {
      renderChatPreview(JSON.parse(e.data));
    } catch (_) {}
  });
```

- [ ] **Step 6: Run export test and verify GREEN**

Run:

```bash
go test . -run TestSessionHTMLIncludesChatPreviewSSEHandling -count=1
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add templates/live_reload.js export_html_test.go
git commit -m "feat(session): render SSE chat preview"
```

---

### Task 7: Update architecture and sequence docs

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/frontend.md`
- Modify: `docs/architecture/data-flow.md`
- Modify: `docs/sequence-flows/chat.md`
- Modify: `docs/sequence-flows/live-reload.md`
- Modify: `docs/sequence-flows/session-viewing.md`

- [ ] **Step 1: Update README live reload paragraph**

In `README.md`, replace the live reload bullet with:

```md
- **Live reload and chat preview.** A `fsnotify` watcher tails the sessions directory and pushes SSE reload events to connected browsers when pi appends to the file. Session pages fetch `/api/session` and append/upsert canonical JSONL entries without a full page reload. Browser-started chat also streams best-effort assistant previews over the same SSE connection; the next JSONL reload remains the source-of-truth reconciliation.
```

- [ ] **Step 2: Update frontend architecture session live reload section**

In `docs/architecture/frontend.md`, replace:

```md
- On `reload` event → `window.location.reload()`
```

with:

```md
- On `reload` event → fetch `/api/session?id=…`, append/upsert canonical entries, clear any temporary chat preview
- On `chat-preview` event → render/update a temporary assistant preview block until canonical JSONL reload arrives
```

- [ ] **Step 3: Update sequence docs snippets**

In `docs/sequence-flows/live-reload.md`, replace the session page browser handling snippet with:

```js
es.onmessage = (e) => {
  if (e.data !== 'reload') return
  fetch('/api/session?id=' + encodeURIComponent(sessId))
    .then((r) => r.json())
    .then((data) => {
      clearChatPreview()
      // append/upsert canonical entries
    })
}
es.addEventListener('chat-preview', (e) => renderChatPreview(JSON.parse(e.data)))
```

In `docs/sequence-flows/session-viewing.md`, replace the final sentence about `window.location.reload()` with:

```md
When the session file changes, the file watcher calls `broadcast(sessID, "reload")`. The browser fetches `/api/session`, appends new canonical entries, upserts live-rendered entries, and clears any temporary chat preview.
```

In `docs/sequence-flows/chat.md`, replace the final note:

```md
(page reloads, showing new assistant response)
```

with:

```md
(browser reconciles from `/api/session`; interim assistant text may have appeared earlier via `chat-preview` SSE)
```

- [ ] **Step 4: Update architecture overview references**

In `docs/architecture/README.md`, change key decision 2 to:

```md
2. **Live updates via SSE**: The browser opens an EventSource connection. The server watches session files via `fsnotify` (with polling fallback) and pushes `reload` events; session pages fetch `/api/session` to reconcile canonical JSONL entries. Browser chat can also receive best-effort `chat-preview` SSE events before JSONL reconciliation.
```

In `docs/architecture/data-flow.md`, replace the live reload browser end with:

```text
Browser EventSource receives "reload"
     └──▶ fetch /api/session
          └──▶ append/upsert canonical entries and clear preview
```

- [ ] **Step 5: Run doc grep sanity check**

Run:

```bash
rg -n "window\.location\.reload\(\)|page reloads|full page reload" README.md docs/architecture docs/sequence-flows
```

Expected: no stale references for session page reload behavior. References to index `new-session` reload are allowed if clearly about index.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/architecture/README.md docs/architecture/frontend.md docs/architecture/data-flow.md docs/sequence-flows/chat.md docs/sequence-flows/live-reload.md docs/sequence-flows/session-viewing.md
git commit -m "docs: describe chat preview streaming flow"
```

---

### Task 8: Full verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run full project check**

Run:

```bash
make check
```

Expected: PASS for frontend tests/build, Go tests, and go vet.

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected: clean working tree.

- [ ] **Step 3: Summarize implemented commits**

Run:

```bash
git log --oneline --decorate -8
```

Expected: includes design commit plus task commits for SSE formatter, RPC preview, worker factory, server broadcast, client preview, and docs.

---

## Self-Review

- Spec coverage: Tasks cover safe SSE formatting, worker callback plumbing, full-content preview semantics, exact-session broadcasts, client temporary preview/reconciliation, and docs.
- Placeholder scan: No TBD/TODO/fill-in steps remain; code blocks provide concrete test and implementation snippets.
- Type consistency: `rpc.StreamPreview`, `rpc.StreamEventSink`, `formatSSEJSONEvent`, `BroadcastChatPreview`, `renderChatPreview`, and `clearChatPreview` are consistently named across tasks.
