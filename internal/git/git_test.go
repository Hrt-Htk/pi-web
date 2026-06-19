package git

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestParsePorcelain(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []DirtyFile
	}{
		{
			name: "unstaged modified",
			in:   " M internal/git/git.go",
			want: []DirtyFile{{Status: "M", Path: "internal/git/git.go"}},
		},
		{
			name: "staged modified",
			in:   "M  staged.go",
			want: []DirtyFile{{Status: "M", Path: "staged.go"}},
		},
		{
			name: "untracked",
			in:   "?? newfile.txt",
			want: []DirtyFile{{Status: "??", Path: "newfile.txt"}},
		},
		{
			name: "staged added",
			in:   "A  added.go",
			want: []DirtyFile{{Status: "A", Path: "added.go"}},
		},
		{
			name: "rename with arrow",
			in:   "R  old.go -> new.go",
			want: []DirtyFile{{Status: "R", Path: "new.go"}},
		},
		{
			name: "deleted",
			in:   "D  gone.go",
			want: []DirtyFile{{Status: "D", Path: "gone.go"}},
		},
		{
			name: "multiple files",
			in: " M foo.go\n?? bar.txt\nA  baz.go",
			want: []DirtyFile{
				{Status: "M", Path: "foo.go"},
				{Status: "??", Path: "bar.txt"},
				{Status: "A", Path: "baz.go"},
			},
		},
		{
			name: "short line",
			in:   "M",
			want: []DirtyFile{{Path: "M"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parsePorcelain(tt.in)
			if len(got) != len(tt.want) {
				t.Fatalf("got %d entries, want %d", len(got), len(tt.want))
			}
			for i := range got {
				if got[i].Status != tt.want[i].Status {
					t.Errorf("[%d] status = %q, want %q", i, got[i].Status, tt.want[i].Status)
				}
				if got[i].Path != tt.want[i].Path {
					t.Errorf("[%d] path = %q, want %q", i, got[i].Path, tt.want[i].Path)
				}
			}
		})
	}
}

func TestTally(t *testing.T) {
	tests := []struct {
		name       string
		files      []DirtyFile
		wantM, wantA, wantD int
	}{
		{
			name:  "modified ( M )",
			files: []DirtyFile{{Status: "M", Path: "x"}},
			wantM: 1,
		},
		{
			name:  "untracked (??)",
			files: []DirtyFile{{Status: "??", Path: "y"}},
			wantA: 1,
		},
		{
			name:  "staged added (A )",
			files: []DirtyFile{{Status: "A", Path: "z"}},
			wantA: 1,
		},
		{
			name:  "deleted (D )",
			files: []DirtyFile{{Status: "D", Path: "w"}},
			wantD: 1,
		},
		{
			name:  "rename (R )",
			files: []DirtyFile{{Status: "R", Path: "b"}},
			wantM: 1,
		},
		{
			name:  "staged+unstaged modified (MM)",
			files: []DirtyFile{{Status: "MM", Path: "c"}},
			wantM: 1,
		},
		{
			name: "mixed",
			files: []DirtyFile{
				{Status: "M", Path: "a"},
				{Status: "??", Path: "b"},
				{Status: "D", Path: "c"},
				{Status: "A", Path: "d"},
				{Status: "R", Path: "e"},
			},
			wantM: 2, wantA: 2, wantD: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, a, d := tally(tt.files)
			if m != tt.wantM || a != tt.wantA || d != tt.wantD {
				t.Errorf("tally = (m=%d, a=%d, d=%d), want (m=%d, a=%d, d=%d)", m, a, d, tt.wantM, tt.wantA, tt.wantD)
			}
		})
	}
}

// fakeGhBinary creates a minimal fake gh CLI in dir that responds to the
// commands used by OpenIssues, OpenPRs, and RepoDescription. On Windows it
// writes a .cmd batch file; on Unix it writes an executable shell script.
func fakeGhBinary(dir string) string {
	bin := "gh"
	if runtime.GOOS == "windows" {
		bin = "gh.cmd"
	}
	path := filepath.Join(dir, bin)

	var script string
	if runtime.GOOS == "windows" {
		script = `@echo off
if "%1"=="issue" echo [{"number":1,"title":"Fake issue","url":"https://github.com/fake/repo/issues/1"}]
if "%1"=="pr" echo [{"number":2,"title":"Fake PR","url":"https://github.com/fake/repo/pull/2"}]
if "%1"=="repo" echo {"description":"Fake repo description"}
`
	} else {
		script = `#!/bin/sh
case "$1" in
  issue) echo '[{"number":1,"title":"Fake issue","url":"https://github.com/fake/repo/issues/1"}]' ;;
  pr)    echo '[{"number":2,"title":"Fake PR","url":"https://github.com/fake/repo/pull/2"}]' ;;
  repo)  echo '{"description":"Fake repo description"}' ;;
esac
`
	}

	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		panic(err)
	}
	return path
}

// setPathFirst prepends dir to the PATH environment variable for the duration
// of the test. It restores the original PATH on cleanup.
func setPathFirst(t *testing.T, dir string) {
	t.Helper()
	orig := os.Getenv("PATH")
	newPath := dir + string(os.PathListSeparator) + orig
	os.Setenv("PATH", newPath)
	t.Cleanup(func() { os.Setenv("PATH", orig) })
}

func TestOpenIssues(t *testing.T) {
	dir := t.TempDir()
	fakeGhBinary(dir)
	setPathFirst(t, dir)

	got := OpenIssues(dir)
	if len(got) != 1 {
		t.Fatalf("got %d issues, want 1", len(got))
	}
	if got[0].Number != 1 {
		t.Errorf("number = %d, want 1", got[0].Number)
	}
	if got[0].Title != "Fake issue" {
		t.Errorf("title = %q, want %q", got[0].Title, "Fake issue")
	}
	if got[0].URL != "https://github.com/fake/repo/issues/1" {
		t.Errorf("url = %q, want %q", got[0].URL, "https://github.com/fake/repo/issues/1")
	}
}

func TestOpenPRs(t *testing.T) {
	dir := t.TempDir()
	fakeGhBinary(dir)
	setPathFirst(t, dir)

	got := OpenPRs(dir)
	if len(got) != 1 {
		t.Fatalf("got %d PRs, want 1", len(got))
	}
	if got[0].Number != 2 {
		t.Errorf("number = %d, want 2", got[0].Number)
	}
	if got[0].Title != "Fake PR" {
		t.Errorf("title = %q, want %q", got[0].Title, "Fake PR")
	}
	if got[0].URL != "https://github.com/fake/repo/pull/2" {
		t.Errorf("url = %q, want %q", got[0].URL, "https://github.com/fake/repo/pull/2")
	}
}

func TestRepoDescription(t *testing.T) {
	dir := t.TempDir()
	fakeGhBinary(dir)
	setPathFirst(t, dir)

	got := RepoDescription(dir)
	if got != "Fake repo description" {
		t.Errorf("description = %q, want %q", got, "Fake repo description")
	}
}

func TestOpenIssues_NoGh(t *testing.T) {
	orig := os.Getenv("PATH")
	empty := t.TempDir()
	os.Setenv("PATH", empty)
	t.Cleanup(func() { os.Setenv("PATH", orig) })

	got := OpenIssues(t.TempDir())
	if got != nil {
		t.Errorf("expected nil when gh not available, got %v", got)
	}
}

func TestOpenPRs_NoGh(t *testing.T) {
	orig := os.Getenv("PATH")
	empty := t.TempDir()
	os.Setenv("PATH", empty)
	t.Cleanup(func() { os.Setenv("PATH", orig) })

	got := OpenPRs(t.TempDir())
	if got != nil {
		t.Errorf("expected nil when gh not available, got %v", got)
	}
}

func TestRepoDescription_NoGh(t *testing.T) {
	orig := os.Getenv("PATH")
	empty := t.TempDir()
	os.Setenv("PATH", empty)
	t.Cleanup(func() { os.Setenv("PATH", orig) })

	got := RepoDescription(t.TempDir())
	if got != "" {
		t.Errorf("expected empty string when gh not available, got %q", got)
	}
}

func TestOpenIssues_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	bin := "gh"
	if runtime.GOOS == "windows" {
		bin = "gh.cmd"
	}
	path := filepath.Join(dir, bin)
	if runtime.GOOS == "windows" {
		_ = os.WriteFile(path, []byte("@echo off\necho not-json\n"), 0o755)
	} else {
		_ = os.WriteFile(path, []byte("#!/bin/sh\necho not-json\n"), 0o755)
	}
	setPathFirst(t, dir)

	got := OpenIssues(dir)
	if got != nil {
		t.Errorf("expected nil for invalid JSON, got %v", got)
	}
}

func TestOpenPRs_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	bin := "gh"
	if runtime.GOOS == "windows" {
		bin = "gh.cmd"
	}
	path := filepath.Join(dir, bin)
	if runtime.GOOS == "windows" {
		_ = os.WriteFile(path, []byte("@echo off\necho not-json\n"), 0o755)
	} else {
		_ = os.WriteFile(path, []byte("#!/bin/sh\necho not-json\n"), 0o755)
	}
	setPathFirst(t, dir)

	got := OpenPRs(dir)
	if got != nil {
		t.Errorf("expected nil for invalid JSON, got %v", got)
	}
}

func TestRepoDescription_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	bin := "gh"
	if runtime.GOOS == "windows" {
		bin = "gh.cmd"
	}
	path := filepath.Join(dir, bin)
	if runtime.GOOS == "windows" {
		_ = os.WriteFile(path, []byte("@echo off\necho not-json\n"), 0o755)
	} else {
		_ = os.WriteFile(path, []byte("#!/bin/sh\necho not-json\n"), 0o755)
	}
	setPathFirst(t, dir)

	got := RepoDescription(dir)
	if got != "" {
		t.Errorf("expected empty string for invalid JSON, got %q", got)
	}
}

