package server

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func drainBroadcast(t *testing.T, c *sseClient, timeout time.Duration) bool {
	t.Helper()
	select {
	case <-c.ch:
		return true
	case <-time.After(timeout):
		return false
	}
}

func TestFsnotifyWatcherBroadcastsOnAppend(t *testing.T) {
	root := t.TempDir()
	projectDir := filepath.Join(root, "--tmp--project--")
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatal(err)
	}
	sessionPath := filepath.Join(projectDir, "session.jsonl")
	if err := os.WriteFile(sessionPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	s := &Server{sessionsDir: root, fileMod: make(map[string]time.Time)}
	if err := s.watchFilesFsnotify(); err != nil {
		t.Skipf("fsnotify unavailable on this platform: %v", err)
	}

	client := s.addClient("session.jsonl")
	defer s.removeClient(client)

	time.Sleep(20 * time.Millisecond)

	future := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(sessionPath, future, future); err != nil {
		t.Fatal(err)
	}
	f, err := os.OpenFile(sessionPath, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString(`{"type":"message"}` + "\n")
	f.Close()

	if !drainBroadcast(t, client, 2*time.Second) {
		t.Fatalf("expected reload broadcast after file append")
	}
}

func TestPollingFallbackBroadcastsOnAppend(t *testing.T) {
	root := t.TempDir()
	projectDir := filepath.Join(root, "--tmp--project--")
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatal(err)
	}
	sessionPath := filepath.Join(projectDir, "session.jsonl")
	if err := os.WriteFile(sessionPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	s := &Server{sessionsDir: root, fileMod: make(map[string]time.Time)}
	s.scanForChanges()

	client := s.addClient("session.jsonl")
	defer s.removeClient(client)

	future := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(sessionPath, future, future); err != nil {
		t.Fatal(err)
	}

	s.scanForChanges()

	if !drainBroadcast(t, client, 100*time.Millisecond) {
		t.Fatalf("expected reload broadcast after scanForChanges")
	}
}
