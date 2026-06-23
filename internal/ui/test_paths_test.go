package ui

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func repoPath(parts ...string) string {
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
	return filepath.Join(append([]string{root}, parts...)...)
}

func readSrc(t *testing.T, rel string) string {
	t.Helper()
	data, err := os.ReadFile(repoPath(rel))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}
	return string(data)
}
