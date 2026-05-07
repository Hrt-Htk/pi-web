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

	s := &Server{sessionsDir: sessionsDir, chatSender: &fakeSender{}}
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
		sessionsDir: t.TempDir(),
		chatSender:  &fakeSender{},
		fileMod:     map[string]time.Time{"session.jsonl": now.Add(-1 * time.Second)},
		now:         func() time.Time { return now },
	}
	if !s.computeRunningStatus("session.jsonl") {
		t.Fatalf("expected running=true from recent mtime")
	}
}

func TestComputeRunningStatusIdleByDefault(t *testing.T) {
	s := &Server{sessionsDir: t.TempDir(), chatSender: &fakeSender{}}
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
