package integration

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"pi-web/internal/chat"
	"pi-web/internal/rpc"
)

// TestScenario_StreamPreviewBroadcast verifies: send prompt → fake worker emits
// a StreamPreview → server broadcasts it as a chat-preview SSE event →
// subscribed client receives it.
// Mechanism: workers.Manager.Send → fakeWorker.Prompt → fakeWorker.emit →
// rpc.StreamEventSink → server.BroadcastChatPreview → server.broadcast →
// sseClient channel → SSE handler writes to HTTP response.
func TestScenario_StreamPreviewBroadcast(t *testing.T) {
	h := newHarness(t, 0)

	sessionID := "preview.jsonl"
	h.writeSessionFile(sessionID, "proj-preview")

	// Subscribe SSE client to the session topic.
	sub := h.subscribeSSE(sessionID)
	defer sub.close()

	// Wait for SSE connection to establish.
	sub.waitFor(t, ":ok")

	// Send a prompt (creates the worker).
	ctx := context.Background()
	if err := h.manager.Send(ctx, sessionID, "", chat.Request{Message: "hello"}); err != nil {
		t.Fatalf("Send: %v", err)
	}

	// Fake worker emits a stream preview.
	fw := h.getWorker(sessionID)
	fw.emit(rpc.StreamPreview{Content: "thinking about it", Done: false})

	// Assert the SSE client receives the chat-preview event.
	sub.waitFor(t, "event: chat-preview")
	if !sub.contains(`"content":"thinking about it"`) {
		t.Fatalf("SSE body missing preview content:\n%s", sub.rec.body())
	}
}

// TestScenario_WorkerCrashEvictionReplacement verifies: worker enters error
// state → next Send evicts it and creates a replacement.
// Mechanism: Manager.workerFor checks worker.Status().State != WorkerStateError;
// when it IS error, the worker is deleted from the map, Closed, and a new
// worker is created via the factory.
//
// Relevant code (manager.go workerFor):
//
//	if worker.Status().State != WorkerStateError {
//	    m.mu.Unlock()
//	    return worker, nil
//	}
//	delete(m.workers, sessionID)
//	m.mu.Unlock()
//	_ = worker.Close()
//	continue  // loops back, worker is nil, factory is called
func TestScenario_WorkerCrashEvictionReplacement(t *testing.T) {
	h := newHarness(t, 0)

	sessionID := "crash.jsonl"
	h.writeSessionFile(sessionID, "proj-crash")
	ctx := context.Background()

	// First Send creates worker A.
	if err := h.manager.Send(ctx, sessionID, "", chat.Request{Message: "before crash"}); err != nil {
		t.Fatalf("initial Send: %v", err)
	}
	workerA := h.getWorker(sessionID)

	// Simulate crash: worker A enters error state.
	workerA.crash()

	// Next Send triggers eviction: workerFor sees error state, deletes A,
	// closes it, and creates worker B via factory.
	if err := h.manager.Send(ctx, sessionID, "", chat.Request{Message: "after crash"}); err != nil {
		t.Fatalf("retry Send: %v", err)
	}
	workerB := h.getWorker(sessionID)

	// Assert A != B (different instances).
	if workerA == workerB {
		t.Fatal("expected new worker after crash, got same instance")
	}

	// Assert A was closed.
	workerA.mu.Lock()
	aCloseCalls := workerA.closeCalls
	workerA.mu.Unlock()
	if aCloseCalls < 1 {
		t.Fatalf("worker A Close() calls = %d, want >= 1", aCloseCalls)
	}

	// Assert B received the retry prompt.
	workerB.mu.Lock()
	bPrompts := len(workerB.prompts)
	workerB.mu.Unlock()
	if bPrompts != 1 {
		t.Fatalf("worker B prompts = %d, want 1", bPrompts)
	}
}

// TestScenario_SSETopicRoutingIsolation verifies: chat-preview for S1 reaches
// only S1's client, not S2's; index-wide events reach __all__ client but not
// per-session clients.
// Mechanism: server.broadcast(sessID, msg) iterates clients and only delivers
// to those where c.sessID == sessID. globalSessID ("__all__") is a separate topic.
func TestScenario_SSETopicRoutingIsolation(t *testing.T) {
	h := newHarness(t, 0)

	s1ID := "isolation1.jsonl"
	s2ID := "isolation2.jsonl"
	h.writeSessionFile(s1ID, "proj-iso")
	h.writeSessionFile(s2ID, "proj-iso")

	// Subscribe clients to S1, S2, and __all__.
	subS1 := h.subscribeSSE(s1ID)
	defer subS1.close()
	subS2 := h.subscribeSSE(s2ID)
	defer subS2.close()
	subAll := h.subscribeSSE("__all__")
	defer subAll.close()

	// Wait for all connections to establish.
	subS1.waitFor(t, ":ok")
	subS2.waitFor(t, ":ok")
	subAll.waitFor(t, ":ok")

	// Create workers for both sessions.
	if err := h.manager.EnsureWorker(context.Background(), s1ID, ""); err != nil {
		t.Fatal(err)
	}
	if err := h.manager.EnsureWorker(context.Background(), s2ID, ""); err != nil {
		t.Fatal(err)
	}

	// Emit a chat-preview for S1 only.
	fw1 := h.getWorker(s1ID)
	fw1.emit(rpc.StreamPreview{Content: "from session 1", Done: false})

	// Give the broadcast time to propagate.
	time.Sleep(50 * time.Millisecond)

	// S1's client should have the preview.
	if !subS1.contains("event: chat-preview") {
		t.Fatalf("S1 client missing chat-preview:\n%s", subS1.rec.body())
	}
	if !subS1.contains(`"content":"from session 1"`) {
		t.Fatalf("S1 client missing preview content:\n%s", subS1.rec.body())
	}

	// S2's client should NOT have the preview.
	if subS2.contains("event: chat-preview") {
		t.Fatalf("S2 client should not have S1's chat-preview:\n%s", subS2.rec.body())
	}

	// __all__ client should NOT have the session-specific preview.
	if subAll.contains("event: chat-preview") {
		t.Fatalf("__all__ client should not have session-specific chat-preview:\n%s", subAll.rec.body())
	}
}

// TestScenario_ConcurrentSessions verifies: N concurrent sessions each get
// their own worker, and prompts are isolated (no cross-talk).
// Mechanism: Manager maintains a map[string]ChatWorker; workerFor creates
// per-session workers via the factory.
func TestScenario_ConcurrentSessions(t *testing.T) {
	const n = 5
	h := newHarness(t, 0)

	// Pre-create session files with unique IDs.
	sessionIDs := make([]string, n)
	for i := 0; i < n; i++ {
		id := fmt.Sprintf("concurrent-%d.jsonl", i)
		h.writeSessionFile(id, "proj-conc")
		sessionIDs[i] = id
	}

	ctx := context.Background()
	var wg sync.WaitGroup
	errs := make([]error, n)

	// Send concurrently from separate goroutines.
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			msg := fmt.Sprintf("message from goroutine %d", idx)
			errs[idx] = h.manager.Send(ctx, sessionIDs[idx], "", chat.Request{Message: msg})
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Errorf("Send[%d]: %v", i, err)
		}
	}

	// Each worker should have exactly its own prompt.
	for i := 0; i < n; i++ {
		fw := h.getWorker(sessionIDs[i])
		fw.mu.Lock()
		promptCount := len(fw.prompts)
		if promptCount != 1 {
			t.Errorf("worker[%d] prompts = %d, want 1", i, promptCount)
		}
		wantMsg := fmt.Sprintf("message from goroutine %d", i)
		if promptCount > 0 && fw.prompts[0].Message != wantMsg {
			t.Errorf("worker[%d] got wrong message: %q, want %q", i, fw.prompts[0].Message, wantMsg)
		}
		fw.mu.Unlock()
	}
}

// TestScenario_IdleReaping verifies: worker idle beyond TTL is reaped
// (removed from manager, Close called).
// Mechanism: Manager.reapLoop → reapOnce checks idleReportable.IdleSince > TTL
// for idle workers; removes from map and calls Close.
func TestScenario_IdleReaping(t *testing.T) {
	ttl := 100 * time.Millisecond
	h := newHarness(t, ttl)

	sessionID := "reap.jsonl"
	h.writeSessionFile(sessionID, "proj-reap")

	// Create worker via Send.
	ctx := context.Background()
	if err := h.manager.Send(ctx, sessionID, "", chat.Request{Message: "hello"}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	fw := h.getWorker(sessionID)

	// Mark the worker as idle for longer than the TTL.
	fw.mu.Lock()
	fw.state = "idle" // ensure idle state
	fw.idleFor = ttl + 50*time.Millisecond
	fw.mu.Unlock()

	// Wait for the reaper tick (interval = ttl/5 = 20ms).
	// Poll with a short deadline.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if !h.manager.HasWorker(sessionID) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Assert worker was reaped.
	if h.manager.HasWorker(sessionID) {
		t.Fatal("worker should have been reaped but still exists")
	}

	// Assert Close was called.
	fw.mu.Lock()
	closeCalls := fw.closeCalls
	fw.mu.Unlock()
	if closeCalls < 1 {
		t.Fatalf("reaped worker Close() calls = %d, want >= 1", closeCalls)
	}
}
