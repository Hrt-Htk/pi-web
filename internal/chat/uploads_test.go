package chat

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"simple", "report.pdf", "report.pdf"},
		{"traversal dotdot", "../../etc/passwd", "passwd"},
		{"traversal slash", "foo/../bar.txt", "bar.txt"},
		{"backslash path", "dir\\file.txt", "file.txt"},
		{"mixed separators", "a/b\\c.txt", "c.txt"},
		{"windows reserved CON", "CON", "_CON"},
		{"windows reserved con lowercase", "con", "_con"},
		{"windows reserved nul.txt", "nul.txt", "_nul.txt"},
		{"windows reserved AUX", "AUX", "_AUX"},
		{"windows reserved COM1", "COM1", "_COM1"},
		{"windows reserved LPT9", "LPT9", "_LPT9"},
		{"illegal chars colon", "report:v2.csv", "reportv2.csv"},
		{"illegal chars angle", "a<b.txt", "ab.txt"},
		{"illegal chars pipe", "x|y.txt", "xy.txt"},
		{"illegal chars star", "te*.txt", "te.txt"},
		{"illegal chars question", "wh?.txt", "wh.txt"},
		{"illegal chars doublequote", `a"b.txt`, "ab.txt"},
		{"trailing dots", "file...", "file"},
		{"trailing spaces", "file ", "file"},
		{"trailing dots and spaces", "file... ", "file"},
		{"empty input", "", "file"},
		{"only dots", "...", "file"},
		{"only spaces", "   ", "file"},
		{"only illegal chars", `<>*"`, "file"},
		{"dot prefix kept", ".hidden", ".hidden"},
		{"multiple extensions", "archive.tar.gz", "archive.tar.gz"},
		{"dotdot in name", "file..txt", "filetxt"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := SanitizeFilename(tc.in)
			if got != tc.want {
				t.Fatalf("SanitizeFilename(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestSaveUploads(t *testing.T) {
	dir := t.TempDir()

	// Basic write
	files := []UploadedFile{
		{Name: "hello.txt", MimeType: "text/plain", Data: []byte("world")},
		{Name: "data.json", MimeType: "application/json", Data: []byte(`{"a":1}`)},
	}
	saved, err := SaveUploads(dir, files)
	if err != nil {
		t.Fatalf("SaveUploads: %v", err)
	}
	if len(saved) != 2 {
		t.Fatalf("got %d saved, want 2", len(saved))
	}

	// Verify absolute paths
	for i, s := range saved {
		if !filepath.IsAbs(s.Path) {
			t.Errorf("saved[%d].Path = %q is not absolute", i, s.Path)
		}
	}

	// Verify files are readable and paths contain expected names
	for i, s := range saved {
		if _, err := os.ReadFile(s.Path); err != nil {
			t.Fatalf("ReadFile(%q): %v", s.Path, err)
		}
		if !strings.Contains(s.Path, files[i].Name) {
			t.Errorf("path %q doesn't contain name %q", s.Path, files[i].Name)
		}
	}

	// Verify sizes
	if saved[0].Size != 5 {
		t.Errorf("saved[0].Size = %d, want 5", saved[0].Size)
	}
	if saved[1].Size != 7 {
		t.Errorf("saved[1].Size = %d, want 7", saved[1].Size)
	}
}

func TestSaveUploadsCollision(t *testing.T) {
	dir := t.TempDir()

	// Pre-create a file with the target name
	existing := filepath.Join(dir, "report.txt")
	if err := os.WriteFile(existing, []byte("old"), 0644); err != nil {
		t.Fatal(err)
	}

	files := []UploadedFile{
		{Name: "report.txt", MimeType: "text/plain", Data: []byte("new")},
	}
	saved, err := SaveUploads(dir, files)
	if err != nil {
		t.Fatalf("SaveUploads: %v", err)
	}
	if len(saved) != 1 {
		t.Fatalf("got %d saved, want 1", len(saved))
	}

	// Collision should produce a different path
	if saved[0].Path == existing {
		t.Fatalf("collision path should differ, got %q", saved[0].Path)
	}

	// Original file should be untouched
	data, err := os.ReadFile(existing)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "old" {
		t.Fatalf("original file was overwritten: %q", string(data))
	}

	// New file should have our data
	newData, err := os.ReadFile(saved[0].Path)
	if err != nil {
		t.Fatal(err)
	}
	if string(newData) != "new" {
		t.Fatalf("new file content = %q, want new", string(newData))
	}
}

func TestSaveUploadsSanitizesName(t *testing.T) {
	dir := t.TempDir()
	files := []UploadedFile{
		{Name: "../../etc/passwd", MimeType: "text/plain", Data: []byte("x")},
	}
	saved, err := SaveUploads(dir, files)
	if err != nil {
		t.Fatalf("SaveUploads: %v", err)
	}
	// Path should be inside dir
	if !strings.HasPrefix(saved[0].Path, dir) {
		t.Fatalf("path %q is outside dir %q", saved[0].Path, dir)
	}
}

func TestAttachmentLine(t *testing.T) {
	su := SavedUpload{
		Path:     "/home/user/.pi/agent/pi-web/chat-uploads/s1/report.txt",
		MimeType: "text/plain",
		Size:     42,
	}
	want := "[Attached file: /home/user/.pi/agent/pi-web/chat-uploads/s1/report.txt (text/plain, 42 bytes)]"
	got := AttachmentLine(su)
	if got != want {
		t.Fatalf("AttachmentLine() = %q, want %q", got, want)
	}
}
