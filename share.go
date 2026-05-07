package main

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// shareCmdRunner is overridable in tests so the share handler doesn't shell out.
type shareCmdRunner interface {
	authStatus() error
	createGist(htmlPath string) (string, string, error) // returns (stdout, stderr)
}

type ghShareRunner struct{ ghPath string }

func (g ghShareRunner) authStatus() error {
	return exec.Command(g.ghPath, "auth", "status").Run()
}

func (g ghShareRunner) createGist(htmlPath string) (string, string, error) {
	cmd := exec.Command(g.ghPath, "gist", "create", "--public=false", htmlPath)
	out, err := cmd.Output()
	var stderr string
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr = string(exitErr.Stderr)
		}
	}
	return string(out), stderr, err
}

func findGh() string {
	candidates := []string{
		"/opt/homebrew/bin/gh",
		"/usr/local/bin/gh",
		"/usr/bin/gh",
		"/bin/gh",
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	if p, err := exec.LookPath("gh"); err == nil {
		return p
	}
	return ""
}

func (s *server) handleShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing id")
		return
	}

	runner := s.shareRunner
	if runner == nil {
		ghPath := findGh()
		if ghPath == "" {
			writeJSONError(w, http.StatusBadRequest, "GitHub CLI (gh) not installed. Install from https://cli.github.com/")
			return
		}
		runner = ghShareRunner{ghPath: ghPath}
	}

	if err := runner.authStatus(); err != nil {
		writeJSONError(w, http.StatusBadRequest, "GitHub CLI not logged in. Run 'gh auth login' first.")
		return
	}

	sessions, err := s.loadSessions()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var html string
	for _, sess := range sessions {
		if sess.ID == id {
			html = generateExportHtml(sess, false)
			break
		}
	}
	if html == "" {
		writeJSONError(w, http.StatusNotFound, "session not found")
		return
	}

	tmpDir, err := os.MkdirTemp(os.TempDir(), "pi-share-*")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create temp dir: "+err.Error())
		return
	}
	defer os.RemoveAll(tmpDir)
	tmpFile := filepath.Join(tmpDir, "session.html")
	if err := os.WriteFile(tmpFile, []byte(html), 0644); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to write temp file: "+err.Error())
		return
	}

	stdout, stderr, err := runner.createGist(tmpFile)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"error": "failed to create gist", "stderr": stderr})
		return
	}

	gistUrl := strings.TrimSpace(stdout)
	gistId := ""
	if parts := strings.Split(gistUrl, "/"); len(parts) > 0 {
		gistId = parts[len(parts)-1]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"gistUrl":    gistUrl,
		"gistId":     gistId,
		"previewUrl": "https://pi.dev/session/#" + gistId,
	})
}
