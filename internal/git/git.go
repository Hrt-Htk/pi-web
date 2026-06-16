// Package git provides thin, read-mostly helpers around the local git CLI for
// the chat composer's branch indicator and PR button. All commands run with an
// explicit working directory and fixed argument lists (no shell), so session
// cwd values can never inject extra commands.
package git

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

var (
	// ErrNotRepo is returned when dir is not inside a git work tree.
	ErrNotRepo = errors.New("not a git repository")
	// ErrInvalidBranchName is returned when a requested branch name is empty
	// or contains characters git would reject.
	ErrInvalidBranchName = errors.New("invalid branch name")
	// ErrNoRemote is returned when no GitHub-style origin remote is configured.
	ErrNoRemote = errors.New("no github remote configured")
	// ErrDefaultBranch is returned when a rename targets the repository's
	// default branch, which we refuse to rename.
	ErrDefaultBranch = errors.New("refusing to rename the default branch")
)

// branchNamePattern is intentionally stricter than git's own check-ref-format:
// it covers the names humans actually type and rejects anything exotic.
var branchNamePattern = regexp.MustCompile(`^[A-Za-z0-9._/-]+$`)

// Info describes the git state surfaced in the composer footer.
type Info struct {
	IsRepo bool   `json:"isRepo"`
	Branch string `json:"branch"`
	// IsDefault marks the repository's default branch (no rename / no PR).
	IsDefault bool `json:"isDefault"`
	// HasChanges is true when the working tree is dirty or there are local
	// commits not yet pushed to the upstream — i.e. there's something to push.
	HasChanges bool `json:"hasChanges"`
	// Dirty is true when the working tree has unstaged or staged changes.
	Dirty bool `json:"dirty"`
	// Ahead is the number of local commits not yet pushed to the upstream branch.
	Ahead int `json:"ahead"`
	// Behind is the number of upstream commits not yet pulled locally.
	Behind int `json:"behind"`
	// Modified/Added/Deleted count working-tree changes by kind (for the footer badges).
	Modified int `json:"modified"`
	Added    int `json:"added"`   // new / untracked files
	Deleted  int `json:"deleted"`
	// PRCreateURL is the GitHub "open a pull request" URL for this branch.
	PRCreateURL string `json:"prCreateUrl"`
	// PRURL is set when an OPEN pull request already exists for this branch,
	// in which case the UI offers "View PR" instead of "Create PR".
	PRURL string `json:"prUrl"`
}

func run(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	// Trim only trailing newlines, not leading whitespace: `git status
	// --porcelain` encodes the staged-status column as a leading space (" M path"),
	// and stripping it would shift the path parse by one character. Single-value
	// outputs (branch names, counts, URLs) carry no leading whitespace, so they are
	// unaffected.
	return strings.TrimRight(string(out), "\r\n"), nil
}

// CurrentBranch returns the checked-out branch name for dir.
func CurrentBranch(dir string) (string, error) {
	if dir == "" {
		return "", ErrNotRepo
	}
	branch, err := run(dir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", ErrNotRepo
	}
	if branch == "" || branch == "HEAD" {
		// Detached HEAD or empty repo: no editable branch.
		return "", ErrNotRepo
	}
	return branch, nil
}

// Describe gathers the branch and a best-effort GitHub PR URL for dir. A
// non-repo directory yields Info{IsRepo: false} with a nil error so callers can
// simply hide the footer.
func Describe(dir string) (Info, error) {
	branch, err := CurrentBranch(dir)
	if err != nil {
		return Info{IsRepo: false}, nil
	}
	info := Info{IsRepo: true, Branch: branch}
	info.Dirty = isDirty(dir)
	info.Modified, info.Added, info.Deleted = dirtyCounts(dir)
	info.Ahead, info.Behind = aheadBehind(dir)
	info.HasChanges = info.Dirty || info.Ahead > 0
	if def := DefaultBranch(dir); def != "" && def == branch {
		info.IsDefault = true
	}
	if url, err := pullRequestURL(dir, branch); err == nil {
		info.PRCreateURL = url
	}
	// Only feature branches can have a PR against the default branch.
	if !info.IsDefault {
		info.PRURL = existingOpenPRURL(dir)
	}
	return info, nil
}

// HasLocalChanges reports whether there is something to commit or push: either
// a dirty working tree, or local commits ahead of the upstream branch.
func HasLocalChanges(dir string) bool {
	if isDirty(dir) {
		return true
	}
	ahead, _ := aheadBehind(dir)
	return ahead > 0
}

// isDirty reports whether the working tree has unstaged or staged changes.
func isDirty(dir string) bool {
	if out, err := run(dir, "status", "--porcelain"); err == nil {
		return out != ""
	}
	return false
}

// tally counts working-tree changes by kind from parsed porcelain entries.
// Precedence: untracked/added first, then deleted, else modified.
func tally(files []DirtyFile) (modified, added, deleted int) {
	for _, f := range files {
		switch {
		case f.Status == "??" || strings.ContainsRune(f.Status, 'A'):
			added++
		case strings.ContainsRune(f.Status, 'D'):
			deleted++
		default:
			modified++
		}
	}
	return modified, added, deleted
}

// dirtyCounts tallies changed files by kind from `git status --porcelain`.
func dirtyCounts(dir string) (modified, added, deleted int) {
	out, err := run(dir, "status", "--porcelain")
	if err != nil || out == "" {
		return 0, 0, 0
	}
	return tally(parsePorcelain(out))
}

// aheadBehind returns the number of local commits ahead of upstream and
// upstream commits behind (not yet pulled). Returns (0, 0) if no upstream
// is configured or the command fails.
func aheadBehind(dir string) (ahead, behind int) {
	if out, err := run(dir, "rev-list", "--count", "@{upstream}..HEAD"); err == nil && out != "" {
		fmt.Sscanf(out, "%d", &ahead)
	}
	if out, err := run(dir, "rev-list", "--count", "HEAD..@{upstream}"); err == nil && out != "" {
		fmt.Sscanf(out, "%d", &behind)
	}
	return ahead, behind
}

// existingOpenPRURL returns the URL of an OPEN pull request for the current
// branch, using the gh CLI when available. It is best-effort: a missing/
// unauthenticated gh, no PR, or a closed/merged PR all yield "".
func existingOpenPRURL(dir string) string {
	gh, err := exec.LookPath("gh")
	if err != nil {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, gh, "pr", "view", "--json", "url,state")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	var pr struct {
		URL   string `json:"url"`
		State string `json:"state"`
	}
	if err := json.Unmarshal(out, &pr); err != nil {
		return ""
	}
	if strings.EqualFold(pr.State, "OPEN") {
		return pr.URL
	}
	return ""
}

// DefaultBranch reports the repository's default branch. It prefers the
// remote's published HEAD (origin/HEAD) and falls back to a local main/master
// when that isn't configured. Returns "" when it can't be determined.
func DefaultBranch(dir string) string {
	if out, err := run(dir, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"); err == nil && out != "" {
		return strings.TrimPrefix(out, "origin/")
	}
	for _, candidate := range []string{"main", "master"} {
		if _, err := run(dir, "rev-parse", "--verify", "--quiet", "refs/heads/"+candidate); err == nil {
			return candidate
		}
	}
	return ""
}

// RenameBranch renames the currently checked-out branch to name via
// `git branch -m`, validating the name first.
func RenameBranch(dir, name string) (string, error) {
	name = strings.TrimSpace(name)
	if !ValidBranchName(name) {
		return "", ErrInvalidBranchName
	}
	branch, err := CurrentBranch(dir)
	if err != nil {
		return "", err
	}
	if def := DefaultBranch(dir); def != "" && def == branch {
		return "", ErrDefaultBranch
	}
	cmd := exec.Command("git", "branch", "-m", name)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("%s", msg)
	}
	return name, nil
}

// ValidBranchName reports whether name is safe to pass to git branch -m.
func ValidBranchName(name string) bool {
	if name == "" || len(name) > 255 {
		return false
	}
	if strings.HasPrefix(name, "-") || strings.HasPrefix(name, "/") || strings.HasSuffix(name, "/") {
		return false
	}
	if strings.Contains(name, "..") || strings.Contains(name, "//") {
		return false
	}
	return branchNamePattern.MatchString(name)
}

// pullRequestURL turns the origin remote + branch into a GitHub "open a pull
// request" URL. Supports both SSH (git@github.com:owner/repo.git) and HTTPS
// remotes. Returns ErrNoRemote for non-GitHub or missing remotes.
func pullRequestURL(dir, branch string) (string, error) {
	remote, err := run(dir, "remote", "get-url", "origin")
	if err != nil || remote == "" {
		return "", ErrNoRemote
	}
	slug, ok := githubSlug(remote)
	if !ok {
		return "", ErrNoRemote
	}
	return fmt.Sprintf("https://github.com/%s/pull/new/%s", slug, branch), nil
}

// DirtyFile is one changed entry from `git status --porcelain`.
type DirtyFile struct {
	Status string `json:"status"` // trimmed XY code, e.g. "M", "A", "D", "R", "??"
	Path   string `json:"path"`   // path with the status prefix stripped; rename dest
}

// parsePorcelain parses git status --porcelain output into DirtyFile entries.
// Porcelain v1: 2 status chars (XY) + 1 space + path. Renames use " -> " or tabs.
func parsePorcelain(out string) []DirtyFile {
	lines := strings.Split(strings.TrimSuffix(out, "\n"), "\n")
	result := make([]DirtyFile, 0, len(lines))
	for _, line := range lines {
		if len(line) < 3 {
			result = append(result, DirtyFile{Path: strings.TrimSpace(line)})
			continue
		}
		status := strings.TrimSpace(line[:2])
		rest := strings.TrimSpace(line[3:])
		// For renames/copies, extract the destination after " -> ".
		if idx := strings.Index(rest, " -> "); idx >= 0 {
			rest = strings.TrimSpace(rest[idx+4:])
		}
		result = append(result, DirtyFile{Status: status, Path: rest})
	}
	return result
}

// DirtyFiles returns the list of changed files from `git status --porcelain`.
// Returns nil if the working tree is clean.
func DirtyFiles(dir string) ([]DirtyFile, error) {
	out, err := run(dir, "status", "--porcelain")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}
	return parsePorcelain(out), nil
}

// githubSlug extracts "owner/repo" from a github remote URL, or returns false.
func githubSlug(remote string) (string, bool) {
	remote = strings.TrimSpace(remote)
	remote = strings.TrimSuffix(remote, ".git")

	switch {
	case strings.HasPrefix(remote, "git@github.com:"):
		return strings.TrimPrefix(remote, "git@github.com:"), true
	case strings.HasPrefix(remote, "ssh://git@github.com/"):
		return strings.TrimPrefix(remote, "ssh://git@github.com/"), true
	case strings.HasPrefix(remote, "https://github.com/"):
		return strings.TrimPrefix(remote, "https://github.com/"), true
	case strings.HasPrefix(remote, "http://github.com/"):
		return strings.TrimPrefix(remote, "http://github.com/"), true
	}
	return "", false
}
