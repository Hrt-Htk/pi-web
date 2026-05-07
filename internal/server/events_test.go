package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHandleEventsSendsStatusSnapshotForAllSubscribers(t *testing.T) {
	s := &Server{
		sessionsDir: t.TempDir(),
		chatSender:  &fakeSender{},
		clients:     make([]*sseClient, 0),
		lastKnown:   map[string]struct{}{"a.jsonl": {}, "b.jsonl": {}},
	}

	req := httptest.NewRequest(http.MethodGet, "/events?id=__all__", nil)
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		s.handleEvents(w, req)
		close(done)
	}()

	// Wait briefly for the snapshot to be written, then close.
	time.Sleep(50 * time.Millisecond)
	cancel()
	<-done

	body := w.Body.String()
	if !strings.Contains(body, "event: status-snapshot") {
		t.Fatalf("missing snapshot event header in body:\n%s", body)
	}
	if !strings.Contains(body, `"a.jsonl"`) || !strings.Contains(body, `"b.jsonl"`) {
		t.Fatalf("snapshot did not include both ids:\n%s", body)
	}
}

func TestHandleEventsForwardsNamedDeltaEvents(t *testing.T) {
	s := &Server{
		sessionsDir: t.TempDir(),
		chatSender:  &fakeSender{},
		clients:     make([]*sseClient, 0),
		lastKnown:   make(map[string]struct{}),
	}

	req := httptest.NewRequest(http.MethodGet, "/events?id=__all__", nil)
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		s.handleEvents(w, req)
		close(done)
	}()

	// Wait for snapshot, then push a delta and a legacy reload.
	time.Sleep(50 * time.Millisecond)
	s.broadcast(globalSessID, "event: status-delta\ndata: {\"id\":\"x\",\"running\":true}")
	s.broadcast(globalSessID, "new-session")
	time.Sleep(50 * time.Millisecond)
	cancel()
	<-done

	body := w.Body.String()
	if !strings.Contains(body, "event: status-delta\ndata: {\"id\":\"x\",\"running\":true}") {
		t.Fatalf("expected named delta passthrough, got:\n%s", body)
	}
	if !strings.Contains(body, "data: new-session") {
		t.Fatalf("expected legacy plain-data passthrough, got:\n%s", body)
	}
}
