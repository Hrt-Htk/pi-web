package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleBrowse_ListsEntries(t *testing.T) {
	root := t.TempDir()

	// Create test structure
	os.MkdirAll(filepath.Join(root, "src"), 0755)
	os.MkdirAll(filepath.Join(root, "docs"), 0755)
	os.WriteFile(filepath.Join(root, "README.md"), nil, 0644)
	os.WriteFile(filepath.Join(root, "go.mod"), nil, 0644)
	// Skip dir — should not appear
	os.MkdirAll(filepath.Join(root, ".git"), 0755)
	os.MkdirAll(filepath.Join(root, "node_modules"), 0755)

	s := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/api/browse?path="+root, nil)
	w := httptest.NewRecorder()
	s.handleBrowse(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}

	entries, ok := resp["entries"].([]any)
	if !ok {
		t.Fatal("entries not found")
	}

	// docs, src (dirs) + README.md, go.mod (files) = 4 entries
	if len(entries) != 4 {
		t.Fatalf("expected 4 entries, got %d", len(entries))
	}

	// Directories should come first
	first := entries[0].(map[string]any)
	if first["isDir"] != true {
		t.Fatal("expected first entry to be a directory")
	}
}

func TestHandleBrowse_DefaultsToHome(t *testing.T) {
	s := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/api/browse", nil)
	w := httptest.NewRecorder()
	s.handleBrowse(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}

	path, ok := resp["path"].(string)
	if !ok || path == "" {
		t.Fatal("expected non-empty path")
	}

	home, _ := os.UserHomeDir()
	if path != home {
		t.Fatalf("expected home dir %s, got %s", home, path)
	}
}

func TestHandleBrowse_FilterByQuery(t *testing.T) {
	root := t.TempDir()

	os.WriteFile(filepath.Join(root, "apple.txt"), nil, 0644)
	os.WriteFile(filepath.Join(root, "banana.txt"), nil, 0644)
	os.WriteFile(filepath.Join(root, "cherry.txt"), nil, 0644)

	s := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/api/browse?path="+root+"&q=ban", nil)
	w := httptest.NewRecorder()
	s.handleBrowse(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}

	entries := resp["entries"].([]any)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry for 'ban', got %d", len(entries))
	}

	entry := entries[0].(map[string]any)
	if entry["name"] != "banana.txt" {
		t.Fatalf("expected banana.txt, got %v", entry["name"])
	}
}

func TestHandleBrowse_404OnInvalidPath(t *testing.T) {
	s := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/api/browse?path=/nonexistent/path", nil)
	w := httptest.NewRecorder()
	s.handleBrowse(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestHandleBrowse_RejectsNonGet(t *testing.T) {
	s := &Server{}

	req := httptest.NewRequest(http.MethodPost, "/api/browse", nil)
	w := httptest.NewRecorder()
	s.handleBrowse(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}
