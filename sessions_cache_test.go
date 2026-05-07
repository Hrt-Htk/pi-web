package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSessionCacheReusesParsedSessions(t *testing.T) {
	root := t.TempDir()
	writeSessionFile(t, root, "--tmp--project--", "session.jsonl")

	c := newSessionCache()

	first, err := c.loadAll(root)
	if err != nil {
		t.Fatalf("first loadAll: %v", err)
	}
	if len(first) != 1 {
		t.Fatalf("first: got %d sessions, want 1", len(first))
	}
	parses1, hits1, _ := c.stats()
	if parses1 != 1 || hits1 != 0 {
		t.Fatalf("after first call: parses=%d hits=%d, want 1/0", parses1, hits1)
	}

	second, err := c.loadAll(root)
	if err != nil {
		t.Fatalf("second loadAll: %v", err)
	}
	if len(second) != 1 {
		t.Fatalf("second: got %d sessions, want 1", len(second))
	}
	parses2, hits2, _ := c.stats()
	if parses2 != 1 {
		t.Fatalf("expected no additional parses on cached read, got parses=%d", parses2)
	}
	if hits2 != 1 {
		t.Fatalf("expected 1 cache hit, got %d", hits2)
	}
}

func TestSessionCacheReparsesOnModTimeChange(t *testing.T) {
	root := t.TempDir()
	path := writeSessionFile(t, root, "--tmp--project--", "session.jsonl")

	c := newSessionCache()
	if _, err := c.loadAll(root); err != nil {
		t.Fatalf("first loadAll: %v", err)
	}

	// Bump modtime forward.
	future := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(path, future, future); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	if _, err := c.loadAll(root); err != nil {
		t.Fatalf("second loadAll: %v", err)
	}
	parses, hits, _ := c.stats()
	if parses != 2 {
		t.Fatalf("expected re-parse after modtime bump, got parses=%d", parses)
	}
	if hits != 0 {
		t.Fatalf("expected 0 hits when modtime changed, got %d", hits)
	}
}

func TestSessionCacheEvictsRemovedFiles(t *testing.T) {
	root := t.TempDir()
	path := writeSessionFile(t, root, "--tmp--project--", "session.jsonl")

	c := newSessionCache()
	if _, err := c.loadAll(root); err != nil {
		t.Fatalf("first loadAll: %v", err)
	}
	if _, _, size := c.stats(); size != 1 {
		t.Fatalf("after first: cache size = %d, want 1", size)
	}

	if err := os.Remove(path); err != nil {
		t.Fatalf("remove: %v", err)
	}

	got, err := c.loadAll(root)
	if err != nil {
		t.Fatalf("after remove: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 sessions after deletion, got %d", len(got))
	}
	if _, _, size := c.stats(); size != 0 {
		t.Fatalf("expected cache to evict deleted file, size=%d", size)
	}
}

func TestSessionCachePicksUpNewFiles(t *testing.T) {
	root := t.TempDir()
	writeSessionFile(t, root, "--tmp--project--", "first.jsonl")

	c := newSessionCache()
	if _, err := c.loadAll(root); err != nil {
		t.Fatalf("first loadAll: %v", err)
	}

	writeSessionFile(t, root, "--tmp--project--", "second.jsonl")

	got, err := c.loadAll(root)
	if err != nil {
		t.Fatalf("second loadAll: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(got))
	}
	parses, hits, _ := c.stats()
	if parses != 2 {
		t.Fatalf("expected exactly one re-parse (for new file), got parses=%d", parses)
	}
	if hits != 1 {
		t.Fatalf("expected 1 hit (the unchanged first file), got %d", hits)
	}
}

func TestSessionCacheIgnoresNonJsonl(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "--tmp--project--")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}

	c := newSessionCache()
	got, err := c.loadAll(root)
	if err != nil {
		t.Fatalf("loadAll: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 sessions, got %d", len(got))
	}
}
