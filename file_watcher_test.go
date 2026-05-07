package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// drainBroadcast pops one reload event off the SSE channel for sessID with a
// timeout. Returns true if a reload was received.
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

	s := &server{sessionsDir: root, fileMod: make(map[string]time.Time)}
	if err := s.watchFilesFsnotify(); err != nil {
		t.Skipf("fsnotify unavailable on this platform: %v", err)
	}

	client := s.addClient("session.jsonl")
	defer s.removeClient(client)

	// Give the watcher a moment to register the initial scan.
	time.Sleep(20 * time.Millisecond)

	// Bump the mtime past the recorded baseline. Some filesystems have low
	// mtime resolution, so explicitly set it forward.
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

	s := &server{sessionsDir: root, fileMod: make(map[string]time.Time)}
	// Seed the baseline so a later mtime advance triggers a broadcast.
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
