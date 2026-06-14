package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"pi-web/internal/workers"
)

func TestComputeRunningStatusFromStatusFile(t *testing.T) {
	root := t.TempDir()
	sessionsDir := filepath.Join(root, "sessions")
	statusDir := filepath.Join(root, "session-status")
	if err := os.MkdirAll(sessionsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(statusDir, 0o755); err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(sessionStatusFile{State: "running", UpdatedAt: time.Now().UTC().Format(time.RFC3339)})
	if err := os.WriteFile(filepath.Join(statusDir, "session.jsonl"), payload, 0o644); err != nil {
		t.Fatal(err)
	}

	s := &Server{agentDir: root, sessionsDir: sessionsDir, chatSender: &fakeSender{}}
	if !s.computeRunningStatus("session.jsonl") {
		t.Fatalf("expected running=true from session-status file")
	}
}

func TestComputeRunningStatusFromChatSender(t *testing.T) {
	s := &Server{
		sessionsDir: t.TempDir(),
		chatSender:  &fakeSender{status: workers.WorkerStatus{State: workers.WorkerStateRunning}},
	}
	if !s.computeRunningStatus("session.jsonl") {
		t.Fatalf("expected running=true from chatSender")
	}
}

func TestComputeRunningStatusFromRecentMtime(t *testing.T) {
	now := time.Date(2026, 5, 8, 12, 0, 0, 0, time.UTC)
	s := &Server{
		sessionsDir:  t.TempDir(),
		chatSender:   &fakeSender{},
		fileMod:      map[string]time.Time{"session.jsonl": now.Add(-400 * time.Millisecond)},
		fileActivity: map[string]time.Time{"session.jsonl": now.Add(-400 * time.Millisecond)},
		now:          func() time.Time { return now },
	}
	if !s.computeRunningStatus("session.jsonl") {
		t.Fatalf("expected running=true from recent mtime")
	}
}

func TestComputeRunningStatusIdleByDefault(t *testing.T) {
	s := &Server{sessionsDir: t.TempDir(), chatSender: &fakeSender{}, now: time.Now}
	if s.computeRunningStatus("session.jsonl") {
		t.Fatalf("expected running=false by default")
	}
}

func TestComputeRunningStatusEmptyID(t *testing.T) {
	s := &Server{sessionsDir: t.TempDir(), chatSender: &fakeSender{}}
	if s.computeRunningStatus("") {
		t.Fatalf("empty id must be idle")
	}
}

// Regression test for issue #26: during worker cold-start the worker exists
// (or is being created) but Model is still empty because get_state hasn't
// returned yet. The old code used Model != "" as a proxy for worker existence
// and fell through to hasRecentSessionActivity, which returned true because
// real pi writes to the session file during cold-start. This caused a false
// running→idle transition and a spurious "done" notification.
func TestComputeRunningStatusSkipsFallbackDuringWorkerColdStart(t *testing.T) {
	now := time.Date(2026, 5, 8, 12, 0, 0, 0, time.UTC)
	s := &Server{
		sessionsDir: t.TempDir(),
		chatSender: &fakeSender{
			// Worker is idle, Model is empty — exactly the cold-start state
			// before get_state has returned.
			status:    workers.WorkerStatus{State: workers.WorkerStateIdle},
			hasWorker: true, // worker exists / creation in flight
		},
		// Recent file activity would make the fallback return true.
		fileMod:      map[string]time.Time{"session.jsonl": now.Add(-400 * time.Millisecond)},
		fileActivity: map[string]time.Time{"session.jsonl": now.Add(-400 * time.Millisecond)},
		now:          func() time.Time { return now },
	}
	if s.computeRunningStatus("session.jsonl") {
		t.Fatal("expected running=false: HasWorker=true must short-circuit the file-activity fallback during cold-start")
	}
}

// Warm idle worker with Model set still returns false (existing behavior).
func TestComputeRunningStatusWarmIdleWorker(t *testing.T) {
	now := time.Date(2026, 5, 8, 12, 0, 0, 0, time.UTC)
	s := &Server{
		sessionsDir: t.TempDir(),
		chatSender: &fakeSender{
			status:    workers.WorkerStatus{State: workers.WorkerStateIdle, Model: "gpt-5.5"},
			hasWorker: true,
		},
		fileMod:      map[string]time.Time{"session.jsonl": now.Add(-100 * time.Millisecond)},
		fileActivity: map[string]time.Time{"session.jsonl": now.Add(-100 * time.Millisecond)},
		now:          func() time.Time { return now },
	}
	if s.computeRunningStatus("session.jsonl") {
		t.Fatal("expected running=false for warm idle worker")
	}
}

func TestRecomputeAndBroadcastStatusEmitsDeltaOnFlip(t *testing.T) {
	now := time.Date(2026, 5, 8, 12, 0, 0, 0, time.UTC)
	s := &Server{
		sessionsDir:  t.TempDir(),
		chatSender:   &fakeSender{},
		clients:      make([]*sseClient, 0),
		lastKnown:    make(map[string]struct{}),
		fileMod:      map[string]time.Time{"a.jsonl": now.Add(-400 * time.Millisecond)},
		fileActivity: map[string]time.Time{"a.jsonl": now.Add(-400 * time.Millisecond)},
		now:          func() time.Time { return now },
	}
	c := s.addClient(globalSessID)
	defer s.removeClient(c)

	s.recomputeAndBroadcastStatus("a.jsonl")

	want := "event: status-delta\ndata: {\"id\":\"a.jsonl\",\"running\":true}"
	select {
	case msg := <-c.ch:
		if msg != want {
			t.Fatalf("msg = %q want %q", msg, want)
		}
	case <-time.After(time.Second):
		t.Fatalf("expected status-delta broadcast")
	}
}

func TestComputeRunningStatusIgnoresInitialFileCreation(t *testing.T) {
	now := time.Date(2026, 5, 8, 12, 0, 1, 0, time.UTC)
	s := &Server{
		sessionsDir:  t.TempDir(),
		chatSender:   &fakeSender{},
		clients:      make([]*sseClient, 0),
		fileMod:      map[string]time.Time{"new.jsonl": {}}, // pre-seeded zero by fsnotify Create handler
		fileActivity: make(map[string]time.Time),
		lastKnown:    make(map[string]struct{}),
		now:          func() time.Time { return now },
	}

	// Simulate the first real write of the freshly created file.
	s.recordModTime("new.jsonl", now)

	// The creation write must NOT be treated as running.
	if s.computeRunningStatus("new.jsonl") {
		t.Fatal("expected running=false after initial file creation write")
	}
}

func TestRecomputeAndBroadcastStatusNoBroadcastWhenUnchanged(t *testing.T) {
	s := &Server{
		sessionsDir: t.TempDir(),
		chatSender:  &fakeSender{},
		clients:     make([]*sseClient, 0),
		lastKnown:   make(map[string]struct{}),
		now:         time.Now,
	}
	c := s.addClient(globalSessID)
	defer s.removeClient(c)

	// First call on an idle session: idle was never recorded, computeRunning
	// returns false → was==false, now==false → no broadcast.
	s.recomputeAndBroadcastStatus("a.jsonl")

	select {
	case msg := <-c.ch:
		t.Fatalf("unexpected broadcast: %q", msg)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestRecomputeAndBroadcastStatusFlipsBackToIdle(t *testing.T) {
	s := &Server{
		sessionsDir: t.TempDir(),
		chatSender:  &fakeSender{},
		clients:     make([]*sseClient, 0),
		lastKnown:   map[string]struct{}{"a.jsonl": {}},
		now:         time.Now,
	}
	c := s.addClient(globalSessID)
	defer s.removeClient(c)

	s.recomputeAndBroadcastStatus("a.jsonl")

	want := "event: status-delta\ndata: {\"id\":\"a.jsonl\",\"running\":false}"
	select {
	case msg := <-c.ch:
		if msg != want {
			t.Fatalf("msg = %q want %q", msg, want)
		}
	case <-time.After(time.Second):
		t.Fatalf("expected idle delta")
	}
	if _, ok := s.lastKnown["a.jsonl"]; ok {
		t.Fatalf("lastKnown should no longer contain a.jsonl")
	}
}
