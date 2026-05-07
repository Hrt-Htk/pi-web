package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEncodeProjectName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"/Users/setkyar/pi-web", "--Users-setkyar-pi-web--"},
		{"/Users/setkyar", "--Users-setkyar--"},
		{"/home/user/project", "--home-user-project--"},
		{"/a/b/c/d", "--a-b-c-d--"},
	}
	for _, tt := range tests {
		got := encodeProjectName(tt.input)
		if got != tt.expected {
			t.Errorf("encodeProjectName(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestDecodeProjectName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"--Users-setkyar--", "/Users/setkyar"},
		{"--home-user-project--", "/home/user/project"},
		{"--a-b-c-d--", "/a/b/c/d"},
	}
	for _, tt := range tests {
		got := decodeProjectName(tt.input)
		if got != tt.expected {
			t.Errorf("decodeProjectName(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestEncodeDecodeRoundTrip(t *testing.T) {
	paths := []string{
		"/Users/setkyar",
		"/home/user/project",
		"/a/b/c/d",
	}
	for _, p := range paths {
		encoded := encodeProjectName(p)
		decoded := decodeProjectName(encoded)
		if decoded != p {
			t.Errorf("round-trip failed: %q -> %q -> %q", p, encoded, decoded)
		}
	}
}

func TestCreateSessionFile(t *testing.T) {
	tmpDir := t.TempDir()
	sessDir := filepath.Join(tmpDir, "sessions")

	id, err := createSessionFile(sessDir, "/Users/setkyar/test-project")
	if err != nil {
		t.Fatalf("createSessionFile failed: %v", err)
	}
	if !strings.HasSuffix(id, ".jsonl") {
		t.Fatalf("expected .jsonl suffix, got %q", id)
	}

	// Verify file exists
	projectDir := filepath.Join(sessDir, "--Users-setkyar-test-project--")
	entries, err := os.ReadDir(projectDir)
	if err != nil {
		t.Fatalf("project dir not created: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 file, got %d", len(entries))
	}

	// Verify content starts with session header
	data, err := os.ReadFile(filepath.Join(projectDir, entries[0].Name()))
	if err != nil {
		t.Fatalf("read file failed: %v", err)
	}
	if !strings.Contains(string(data), `"type":"session"`) {
		t.Fatalf("missing session header: %s", string(data))
	}
	if !strings.Contains(string(data), `"cwd":"/Users/setkyar/test-project"`) {
		t.Fatalf("missing cwd: %s", string(data))
	}
}

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
