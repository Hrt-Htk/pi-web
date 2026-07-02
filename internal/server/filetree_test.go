package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestHandleFilesTree(t *testing.T) {
	// Build a temp directory with known structure.
	tmpDir := t.TempDir()
	os.MkdirAll(filepath.Join(tmpDir, "subdir"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "file1.txt"), []byte("hello"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "file2.go"), []byte("package main"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "subdir", "nested.txt"), []byte("nested"), 0644)

	s := newTestServer(t)

	t.Run("lists top-level entries via path param", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/files/tree?path="+tmpDir, nil)
		rec := httptest.NewRecorder()
		s.handleFilesTree(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var resp map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		fileList, ok := resp["files"].([]any)
		if !ok {
			t.Fatalf("expected files to be array, got %T", resp["files"])
		}
		// Should contain file1.txt, file2.go, subdir (not nested.txt).
		var hasSubdirDir bool
		expectedNames := []string{"file1.txt", "file2.go", "subdir"}
		for _, entryAny := range fileList {
			entry := entryAny.(map[string]any)
			path := entry["path"].(string)
			isDir := entry["isDir"].(bool)
			for _, name := range expectedNames {
				if path == name {
					if path == "subdir" && !isDir {
						t.Error("expected subdir to be a directory")
					}
					if path == "subdir" && isDir {
						hasSubdirDir = true
					}
				}
			}
		}
		if !hasSubdirDir {
			t.Error("expected subdir to be a directory")
		}
	})

	t.Run("lists scoped subdirectory", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/files/tree?path="+tmpDir+"&scope=subdir", nil)
		rec := httptest.NewRecorder()
		s.handleFilesTree(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var resp map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		fileList, ok := resp["files"].([]any)
		if !ok {
			t.Fatalf("expected files to be array, got %T", resp["files"])
		}
		// Should only contain nested.txt (inside subdir), path is cwd-relative.
		if len(fileList) != 1 {
			t.Fatalf("expected 1 entry, got %d", len(fileList))
		}
		entry := fileList[0].(map[string]any)
		if entry["path"].(string) != "subdir/nested.txt" {
			t.Errorf("expected subdir/nested.txt, got %v", entry["path"])
		}
	})

	t.Run("non-GET returns 405", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/files/tree?path="+tmpDir, nil)
		rec := httptest.NewRecorder()
		s.handleFilesTree(rec, req)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("expected 405, got %d", rec.Code)
		}
	})

	t.Run("missing path param returns 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/files/tree", nil)
		rec := httptest.NewRecorder()
		s.handleFilesTree(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestHandleFilesGitStatus(t *testing.T) {
	t.Run("clean repo returns empty files and zero summary", func(t *testing.T) {
		tmpDir := t.TempDir()
		exec.Command("git", "init", tmpDir).Run() // ignore error
		exec.Command("git", "-C", tmpDir, "config", "user.email", "test@test.com").Run()
		exec.Command("git", "-C", tmpDir, "config", "user.name", "Test").Run()

		s := newTestServer(t)
		req := httptest.NewRequest(http.MethodGet, "/api/files/git-status?path="+tmpDir, nil)
		rec := httptest.NewRecorder()
		s.handleFilesGitStatus(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var resp map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		filesSlice, ok := resp["files"].([]interface{})
		if !ok {
			t.Fatalf("expected files to be array, got %T", resp["files"])
		}
		if len(filesSlice) != 0 {
			t.Errorf("expected empty files, got %v", filesSlice)
		}
	})

	t.Run("dirty repo returns files and correct summary", func(t *testing.T) {
		tmpDir := t.TempDir()
		exec.Command("git", "init", tmpDir).Run()
		exec.Command("git", "-C", tmpDir, "config", "user.email", "test@test.com").Run()
		exec.Command("git", "-C", tmpDir, "config", "user.name", "Test").Run()

		// Create and commit a file.
		os.WriteFile(filepath.Join(tmpDir, "base.txt"), []byte("base"), 0644)
		exec.Command("git", "-C", tmpDir, "add", "base.txt").Run()
		exec.Command("git", "-C", tmpDir, "commit", "-m", "init").Run()

		// Modify base.txt (modified).
		os.WriteFile(filepath.Join(tmpDir, "base.txt"), []byte("modified"), 0644)
		// Stage a new file (added).
		os.WriteFile(filepath.Join(tmpDir, "added.txt"), []byte("added"), 0644)
		exec.Command("git", "-C", tmpDir, "add", "added.txt").Run()
		// Create an untracked file.
		os.WriteFile(filepath.Join(tmpDir, "untracked.txt"), []byte("untracked"), 0644)
		// Delete a file.
		os.WriteFile(filepath.Join(tmpDir, "todelete.txt"), []byte("delete me"), 0644)
		exec.Command("git", "-C", tmpDir, "add", "todelete.txt").Run()
		exec.Command("git", "-C", tmpDir, "commit", "-m", "add todelete").Run()
		os.Remove(filepath.Join(tmpDir, "todelete.txt"))

		s := newTestServer(t)
		req := httptest.NewRequest(http.MethodGet, "/api/files/git-status?path="+tmpDir, nil)
		rec := httptest.NewRecorder()
		s.handleFilesGitStatus(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var resp map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		filesSlice, ok := resp["files"].([]interface{})
		if !ok {
			t.Fatalf("expected files to be array, got %T", resp["files"])
		}
		if len(filesSlice) == 0 {
			t.Fatal("expected non-empty files list for dirty repo")
		}
		summary, ok := resp["summary"].(map[string]interface{})
		if !ok {
			t.Fatalf("expected summary to be object, got %T", resp["summary"])
		}
		// At minimum check that modified > 0 (base.txt) and untracked > 0.
		modified, _ := summary["modified"].(float64)
		untracked, _ := summary["untracked"].(float64)
		if modified < 1 {
			t.Errorf("expected modified >= 1, got %v", modified)
		}
		if untracked < 1 {
			t.Errorf("expected untracked >= 1, got %v", untracked)
		}
	})

	t.Run("non-GET returns 405", func(t *testing.T) {
		tmpDir := t.TempDir()
		s := newTestServer(t)
		req := httptest.NewRequest(http.MethodPost, "/api/files/git-status?path="+tmpDir, nil)
		rec := httptest.NewRecorder()
		s.handleFilesGitStatus(rec, req)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("expected 405, got %d", rec.Code)
		}
	})

	t.Run("missing path param returns 400", func(t *testing.T) {
		s := newTestServer(t)
		req := httptest.NewRequest(http.MethodGet, "/api/files/git-status", nil)
		rec := httptest.NewRecorder()
		s.handleFilesGitStatus(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

// Test that the handlers are registered on the router.
func TestRoutesRegistered(t *testing.T) {
	s := newTestServer(t)
	mux := http.NewServeMux()
	s.Register(mux)

	// Verify the routes exist by checking they don't 404.
	for _, path := range []string{"/api/files/tree", "/api/files/git-status"} {
		req := httptest.NewRequest(http.MethodGet, path+"?path=/tmp", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		// Should NOT be 404 (will be 400 or other, but route should match).
		if rec.Code == http.StatusNotFound {
			t.Errorf("route %s returned 404 — not registered", path)
		}
	}
}
