package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadIndexScriptValidManifest(t *testing.T) {
	tmpDir := t.TempDir()
	viteDir := filepath.Join(tmpDir, ".vite")
	os.MkdirAll(viteDir, 0755)
	assetsDir := filepath.Join(tmpDir, "assets")
	os.MkdirAll(assetsDir, 0755)

	manifest := `{"src/index/index.js":{"file":"assets/index-abc123.js"}}`
	os.WriteFile(filepath.Join(viteDir, "manifest.json"), []byte(manifest), 0644)
	os.WriteFile(filepath.Join(assetsDir, "index-abc123.js"), []byte("console.log('hello')"), 0644)

	path, js, err := loadIndexScript(tmpDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path != "/static/assets/index-abc123.js" {
		t.Errorf("path = %q, want %q", path, "/static/assets/index-abc123.js")
	}
	if js != "console.log('hello')" {
		t.Errorf("js = %q, want %q", js, "console.log('hello')")
	}
}

func TestLoadIndexScriptMissingManifest(t *testing.T) {
	tmpDir := t.TempDir()
	_, _, err := loadIndexScript(tmpDir)
	if err == nil {
		t.Fatal("expected error for missing manifest")
	}
}

func TestLoadIndexScriptEmptyFile(t *testing.T) {
	tmpDir := t.TempDir()
	viteDir := filepath.Join(tmpDir, ".vite")
	os.MkdirAll(viteDir, 0755)
	manifest := `{"src/index/index.js":{"file":""}}`
	os.WriteFile(filepath.Join(viteDir, "manifest.json"), []byte(manifest), 0644)
	_, _, err := loadIndexScript(tmpDir)
	if err == nil {
		t.Fatal("expected error for empty file")
	}
}

func TestLoadIndexScriptAbsolutePath(t *testing.T) {
	tmpDir := t.TempDir()
	viteDir := filepath.Join(tmpDir, ".vite")
	os.MkdirAll(viteDir, 0755)
	manifest := `{"src/index/index.js":{"file":"/etc/passwd"}}`
	os.WriteFile(filepath.Join(viteDir, "manifest.json"), []byte(manifest), 0644)
	_, _, err := loadIndexScript(tmpDir)
	if err == nil {
		t.Fatal("expected error for absolute path")
	}
}

func TestLoadIndexScriptPathTraversal(t *testing.T) {
	tmpDir := t.TempDir()
	viteDir := filepath.Join(tmpDir, ".vite")
	os.MkdirAll(viteDir, 0755)
	manifest := `{"src/index/index.js":{"file":"../etc/passwd"}}`
	os.WriteFile(filepath.Join(viteDir, "manifest.json"), []byte(manifest), 0644)
	_, _, err := loadIndexScript(tmpDir)
	if err == nil {
		t.Fatal("expected error for path traversal")
	}
}
