package server

import (
	"errors"
	"net/http"

	"pi-web/internal/files"
	"pi-web/internal/git"
)

// handleFilesTree returns a depth-1 directory listing for the resolved cwd,
// optionally scoped to a relative subdirectory via ?scope=. Accepts
// ?id=<sessionId> or ?path=<cwd>. Non-GET returns 405.
func (s *Server) handleFilesTree(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	cwd, err := resolveCwd(s, r)
	if resolveOrWriteError(w, err) {
		return
	}

	scope := r.URL.Query().Get("scope")
	key := fileWalkKey(cwd, scope, false)
	entries, err := s.fileWalkCache().get(key, func() ([]files.Entry, error) {
		return files.TopLevel(cwd, scope)
	})
	if err != nil {
		if errors.Is(err, files.ErrNotDir) {
			writeJSON(w, 0, map[string]any{"files": []files.Entry{}})
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, 0, map[string]any{"files": entries})
}

// handleFilesGitStatus returns dirty files and a summary for the resolved cwd.
// Accepts ?id=<sessionId> or ?path=<cwd>. Non-GET returns 405.
func (s *Server) handleFilesGitStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	cwd, err := resolveCwd(s, r)
	if resolveOrWriteError(w, err) {
		return
	}

	filesList, err := git.DirtyFiles(cwd)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if filesList == nil {
		filesList = []git.DirtyFile{}
	}
	writeJSON(w, 0, map[string]any{"files": filesList, "summary": git.Summarize(filesList)})
}
