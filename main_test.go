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

func TestLoadFrontendScriptsLoadsMultipleEntrypoints(t *testing.T) {
	fsys := fstest.MapFS{
		".vite/manifest.json": &fstest.MapFile{
			Data: []byte(`{"src/index/index.js":{"file":"assets/index-abc123.js"},"src/session/session.js":{"file":"assets/session-def456.js"},"src/live/live.js":{"file":"assets/live-ghi789.js"}}`),
		},
		"assets/index-abc123.js":   &fstest.MapFile{Data: []byte("index")},
		"assets/session-def456.js": &fstest.MapFile{Data: []byte("session")},
		"assets/live-ghi789.js":    &fstest.MapFile{Data: []byte("live")},
	}
	scripts, err := loadFrontendScripts(fsys, "src/index/index.js", "src/session/session.js", "src/live/live.js")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(scripts) != 3 {
		t.Fatalf("len(scripts) = %d, want 3", len(scripts))
	}
	checks := []struct {
		path string
		js   string
	}{
		{"/static/assets/index-abc123.js", "index"},
		{"/static/assets/session-def456.js", "session"},
		{"/static/assets/live-ghi789.js", "live"},
	}
	for i, check := range checks {
		if scripts[i].Path != check.path || scripts[i].JS != check.js {
			t.Fatalf("scripts[%d] = (%q, %q), want (%q, %q)", i, scripts[i].Path, scripts[i].JS, check.path, check.js)
		}
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
