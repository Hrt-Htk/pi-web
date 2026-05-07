package sessions

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
		got := EncodeProjectName(tt.input)
		if got != tt.expected {
			t.Errorf("EncodeProjectName(%q) = %q, want %q", tt.input, got, tt.expected)
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
		got := DecodeProjectName(tt.input)
		if got != tt.expected {
			t.Errorf("DecodeProjectName(%q) = %q, want %q", tt.input, got, tt.expected)
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
		encoded := EncodeProjectName(p)
		decoded := DecodeProjectName(encoded)
		if decoded != p {
			t.Errorf("round-trip failed: %q -> %q -> %q", p, encoded, decoded)
		}
	}
}

func TestCreateSessionFile(t *testing.T) {
	tmpDir := t.TempDir()
	sessDir := filepath.Join(tmpDir, "sessions")

	id, err := CreateSessionFile(sessDir, "/Users/setkyar/test-project")
	if err != nil {
		t.Fatalf("CreateSessionFile failed: %v", err)
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

func TestParseFileMarksSessionBrokenWhenCwdMissing(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "session.jsonl")
	content := `{"type":"session","version":3,"id":"sid","timestamp":"2026-05-06T00:00:00.000Z","cwd":"/definitely/missing/path"}` + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	sess, err := ParseFile(path, "--tmp-project--", "session.jsonl")
	if err != nil {
		t.Fatalf("ParseFile failed: %v", err)
	}
	if sess.ChatAvailable {
		t.Fatal("expected chat to be disabled for missing cwd")
	}
	if !strings.Contains(sess.ChatDisabledReason, "working directory no longer exists") {
		t.Fatalf("reason = %q", sess.ChatDisabledReason)
	}
}

func TestParseFileLeavesChatEnabledWhenCwdExists(t *testing.T) {
	root := t.TempDir()
	cwd := filepath.Join(root, "project")
	if err := os.MkdirAll(cwd, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "session.jsonl")
	content := `{"type":"session","version":3,"id":"sid","timestamp":"2026-05-06T00:00:00.000Z","cwd":"` + cwd + `"}` + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	sess, err := ParseFile(path, "--tmp-project--", "session.jsonl")
	if err != nil {
		t.Fatalf("ParseFile failed: %v", err)
	}
	if !sess.ChatAvailable {
		t.Fatalf("expected chat to be enabled, reason = %q", sess.ChatDisabledReason)
	}
}
