package main

import (
	"testing"
	"testing/fstest"
)

func TestLoadIndexScriptValidManifest(t *testing.T) {
	fsys := fstest.MapFS{
		".vite/manifest.json": &fstest.MapFile{
			Data: []byte(`{"src/index/index.js":{"file":"assets/index-abc123.js"}}`),
		},
		"assets/index-abc123.js": &fstest.MapFile{Data: []byte("console.log('hello')")},
	}
	path, js, err := loadIndexScript(fsys)
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
	if _, _, err := loadIndexScript(fstest.MapFS{}); err == nil {
		t.Fatal("expected error for missing manifest")
	}
}

func TestLoadIndexScriptEmptyFile(t *testing.T) {
	fsys := fstest.MapFS{
		".vite/manifest.json": &fstest.MapFile{
			Data: []byte(`{"src/index/index.js":{"file":""}}`),
		},
	}
	if _, _, err := loadIndexScript(fsys); err == nil {
		t.Fatal("expected error for empty file")
	}
}

func TestLoadIndexScriptAbsolutePath(t *testing.T) {
	fsys := fstest.MapFS{
		".vite/manifest.json": &fstest.MapFile{
			Data: []byte(`{"src/index/index.js":{"file":"/etc/passwd"}}`),
		},
	}
	if _, _, err := loadIndexScript(fsys); err == nil {
		t.Fatal("expected error for absolute path")
	}
}

func TestLoadIndexScriptPathTraversal(t *testing.T) {
	fsys := fstest.MapFS{
		".vite/manifest.json": &fstest.MapFile{
			Data: []byte(`{"src/index/index.js":{"file":"../etc/passwd"}}`),
		},
	}
	if _, _, err := loadIndexScript(fsys); err == nil {
		t.Fatal("expected error for path traversal")
	}
}
