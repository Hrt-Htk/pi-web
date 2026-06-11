package server

import (
	"os"
	"path/filepath"
	"testing"
)

func writeSessionFile(t *testing.T, root, project, name string) string {
	t.Helper()
	dir := filepath.Join(root, project)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, name)
	cwd := filepath.Join(root, "cwd")
	if err := os.MkdirAll(cwd, 0755); err != nil {
		t.Fatal(err)
	}
	content := `{"type":"session","version":3,"id":"sid","timestamp":"2026-05-06T00:00:00.000Z","cwd":"` + filepath.ToSlash(cwd) + `"}` + "\n" +
		`{"type":"message","id":"aaaaaaaa","parentId":null,"timestamp":"2026-05-06T00:00:01.000Z","message":{"role":"user","content":"hello","timestamp":1778025601000}}` + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return path
}
