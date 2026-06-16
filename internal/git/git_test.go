package git

import (
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
