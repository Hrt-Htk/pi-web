package server

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/google/uuid"
)

// handleClaudeSession boots a fresh Claude Code worker in orchestrator mode
// with a "standby" prompt. The worker is a live psmux session the user can
// attach to and drive (remote-control mode).
func (s *Server) handleClaudeSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		body.Path = ""
	}

	// Resolve working directory: use the project path from the request,
	// or fall back to the server's own directory.
	cwd := body.Path
	if cwd == "" {
		cwd = s.sessionsDir
	}

	// Dev mode: skip actual execution and just log.
	dev := r.URL.Query().Get("dev") == "1" || os.Getenv("PI_WEB_CLAUDE_DEV") == "1"

	if dev {
		writeJSON(w, 0, map[string]any{
			"ok":      true,
			"dev":     true,
			"message": "dry run — no session created",
			"wouldRun": map[string]any{
				"script": "scripts/claude-standby.ps1",
				"cwd":    cwd,
				"target": "claude-standby-" + uuid.New().String()[:8],
			},
		})
		return
	}

	// Only supported on Windows (psmux + PowerShell).
	if runtime.GOOS != "windows" {
		writeJSONError(w, http.StatusNotImplemented, "claude session launcher is only available on Windows")
		return
	}

	// Locate the script relative to the server binary's directory.
	scriptPath := findClaudeStandbyScript()
	if scriptPath == "" {
		writeJSONError(w, http.StatusInternalServerError, "claude-standby.ps1 script not found")
		return
	}

	// Execute the PowerShell script.
	result, err := runClaudeStandbyScript(scriptPath, cwd)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to start claude session: "+err.Error())
		return
	}

	writeJSON(w, 0, map[string]any{
		"ok":     true,
		"result": result,
	})
}

// findClaudeStandbyScript locates scripts/claude-standby.ps1.
// Prod is fully standalone — the script lives in <exe-dir>/scripts/.
func findClaudeStandbyScript() string {
	// Same directory as the binary (prod: h:\software\pi-web-prod\scripts\)
	// or dev test server (h:\software\pi-web\scripts\ when cwd matches).
	if exe, err := os.Executable(); err == nil {
		c := filepath.Join(filepath.Dir(exe), "scripts", "claude-standby.ps1")
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	// Fallback: current working directory.
	if c, err := filepath.Abs("scripts/claude-standby.ps1"); err == nil {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

// runClaudeStandbyScript executes the PowerShell script and returns its JSON output.
// The script writes diagnostics to stderr and a single JSON line to stdout.
func runClaudeStandbyScript(scriptPath, cwd string) (map[string]any, error) {
	pwsh, err := findPwsh()
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(pwsh,
		"-NoProfile",
		"-File", scriptPath,
		"-Cwd", cwd,
	)
	cmd.Dir = cwd

	// Capture stdout (JSON) and stderr (diagnostics) separately.
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	var stderrBuf strings.Builder
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		return nil, &ClaudeSessionError{message: stderrBuf.String(), err: err}
	}

	// Read stdout (should be a single JSON line).
	var stdoutBuf strings.Builder
	buf := make([]byte, 4096)
	for {
		n, readErr := stdout.Read(buf)
		if n > 0 {
			stdoutBuf.WriteString(string(buf[:n]))
		}
		if readErr != nil {
			break
		}
	}

	if err := cmd.Wait(); err != nil {
		return nil, &ClaudeSessionError{
			message: "stderr: " + stderrBuf.String(),
			err:     err,
		}
	}

	// Parse the JSON handle from stdout.
	var result map[string]any
	if err := json.Unmarshal([]byte(stdoutBuf.String()), &result); err != nil {
		return nil, &ClaudeSessionError{
			message: "invalid JSON from script. stdout: " + stdoutBuf.String() + " stderr: " + stderrBuf.String(),
			err:     err,
		}
	}
	return result, nil
}

// findPwsh locates PowerShell (pwsh or powershell).
func findPwsh() (string, error) {
	// Try pwsh first (PowerShell 7+), then fallback to Windows PowerShell.
	for _, name := range []string{"pwsh", "powershell"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	// Common install paths.
	for _, p := range []string{
		`C:\Program Files\PowerShell\7\pwsh.exe`,
		`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
	} {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", &ClaudeSessionError{message: "pwsh or powershell not found in PATH or common locations"}
}

// ClaudeSessionError carries a human-readable message from the script.
type ClaudeSessionError struct {
	message string
	err     error
}

func (e *ClaudeSessionError) Error() string {
	if e.message != "" {
		return e.message
	}
	return e.err.Error()
}

func (e *ClaudeSessionError) Unwrap() error {
	return e.err
}
