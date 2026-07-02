package git

import (
	"testing"
)

func TestSummarize(t *testing.T) {
	tests := []struct {
		name  string
		files []DirtyFile
		want  Summary
	}{
		{
			name:  "empty slice returns zero summary",
			files: []DirtyFile{},
			want:  Summary{},
		},
		{
			name:  "nil returns zero summary",
			files: nil,
			want:  Summary{},
		},
		{
			name: "single modified file",
			files: []DirtyFile{
				{Status: "M", Path: "foo.txt"},
			},
			want: Summary{Modified: 1},
		},
		{
			name: "single added file",
			files: []DirtyFile{
				{Status: "A", Path: "new.txt"},
			},
			want: Summary{Added: 1},
		},
		{
			name: "single deleted file",
			files: []DirtyFile{
				{Status: "D", Path: "gone.txt"},
			},
			want: Summary{Deleted: 1},
		},
		{
			name: "single untracked file",
			files: []DirtyFile{
				{Status: "??", Path: "untracked.txt"},
			},
			want: Summary{Untracked: 1},
		},
		{
			name: "single renamed file counts as modified",
			files: []DirtyFile{
				{Status: "R", Path: "renamed.txt"},
			},
			want: Summary{Modified: 1},
		},
		{
			name: "single copied file counts as modified",
			files: []DirtyFile{
				{Status: "C", Path: "copied.txt"},
			},
			want: Summary{Modified: 1},
		},
		{
			name: "mixed statuses",
			files: []DirtyFile{
				{Status: "M", Path: "modified.txt"},
				{Status: "M", Path: "modified2.txt"},
				{Status: "A", Path: "added.txt"},
				{Status: "D", Path: "deleted.txt"},
				{Status: "??", Path: "untracked1.txt"},
				{Status: "??", Path: "untracked2.txt"},
				{Status: "??", Path: "untracked3.txt"},
				{Status: "R", Path: "renamed.txt"},
			},
			want: Summary{
				Modified:  3, // M + M + R
				Added:     1, // A
				Deleted:   1, // D
				Untracked: 3, // ?? x3
			},
		},
		{
			name: "untracked is NOT counted as added",
			files: []DirtyFile{
				{Status: "??", Path: "untracked.txt"},
				{Status: "??", Path: "also-untracked.txt"},
			},
			want: Summary{
				Untracked: 2,
				Added:     0,
			},
		},
		{
			name: "XY codes with A in index column",
			files: []DirtyFile{
				{Status: "AM", Path: "staged-and-modified.txt"},
			},
			want: Summary{Added: 1},
		},
		{
			name: "XY codes with D in index column",
			files: []DirtyFile{
				{Status: "DM", Path: "deleted-and-modified.txt"},
			},
			want: Summary{Deleted: 1},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Summarize(tt.files)
			if got != tt.want {
				t.Errorf("Summarize() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
