# Start New Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+" button to the pi-web sessions list that opens a modal for creating a new session at a user-specified directory path, then redirects to the new session.

**Architecture:** Server-side direct file creation (Approach A from spec). The Go server writes a minimal session JSONL header. UI is a modal in the existing index template with recent locations derived from existing session directories.

**Tech Stack:** Go 1.22+, standard library, embedded HTML template in `main.go`

---

### File Structure

| File | Responsibility |
|------|---------------|
| `main.go` | Add `POST /api/new-session` route, `handleNewSession` handler, helper functions (`encodeProjectName`, `listRecentLocations`, `createSessionFile`), update `indexTmpl` with modal UI |
| `main.go` (existing) | `cleanProjectName`, `loadAllSessions` — referenced by new code |
| `main_test.go` (new) | Tests for encoding/decoding round-trip, `createSessionFile`, `listRecentLocations` |

---

### Task 1: Add Backend Helpers

**Files:**
- Modify: `main.go` (after `cleanProjectName` function, around line 1203)
- Test: `main_test.go` (create)

- [ ] **Step 1: Write the failing test for encoding/decoding**

Create `main_test.go`:

```go
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEncodeProjectName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"/Users/setkyar/pi-web", "--Users-setkyar-pi-web--"},
		{"/Users/setkyar", "--Users-setkyar--"},
		{"/home/user/project", "--home-user-project--"},
		{"/a/b/c/d", "--a-b-c-d--"},
	}
	for _, tt := range tests {
		got := encodeProjectName(tt.input)
		if got != tt.expected {
			t.Errorf("encodeProjectName(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestEncodeDecodeRoundTrip(t *testing.T) {
	paths := []string{
		"/Users/setkyar/pi-web",
		"/Users/setkyar",
		"/home/user/my-project",
	}
	for _, p := range paths {
		encoded := encodeProjectName(p)
		decoded := cleanProjectName(encoded)
		if decoded != p {
			t.Errorf("round-trip failed: %q -> %q -> %q", p, encoded, decoded)
		}
	}
}

func TestCreateSessionFile(t *testing.T) {
	tmpDir := t.TempDir()
	sessDir := filepath.Join(tmpDir, "sessions")

	id, err := createSessionFile(sessDir, "/Users/setkyar/test-project")
	if err != nil {
		t.Fatalf("createSessionFile failed: %v", err)
	}
	if !strings.HasSuffix(id, ".jsonl") {
		t.Fatalf("expected .jsonl suffix, got %q", id)
	}

	// Verify file exists
	projectDir := filepath.Join(sessDir, "--Users-setkyar-test-project--")
	entries, err := os.ReadDir(projectDir)
	if err != nil {
		t.Fatalf("project dir not created: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 file, got %d", len(entries))
	}

	// Verify content starts with session header
	data, err := os.ReadFile(filepath.Join(projectDir, entries[0].Name()))
	if err != nil {
		t.Fatalf("read file failed: %v", err)
	}
	if !strings.Contains(string(data), `"type":"session"`) {
		t.Fatalf("missing session header: %s", string(data))
	}
	if !strings.Contains(string(data), `"cwd":"/Users/setkyar/test-project"`) {
		t.Fatalf("missing cwd: %s", string(data))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/setkyar/pi-web
go test -run "TestEncodeProjectName|TestEncodeDecodeRoundTrip|TestCreateSessionFile" -v
```

Expected: FAIL — `encodeProjectName` and `createSessionFile` not defined

- [ ] **Step 3: Add helper functions to `main.go`**

Insert after `cleanProjectName` (around line 1203):

```go
func encodeProjectName(path string) string {
	s := strings.TrimSpace(path)
	s = strings.Trim(s, "/")
	s = strings.ReplaceAll(s, "/", "--")
	return "--" + s + "--"
}

func listRecentLocations(sessionsDir string) ([]string, error) {
	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		return nil, err
	}
	var locations []string
	seen := make(map[string]bool)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		loc := cleanProjectName(e.Name())
		if loc != "" && !seen[loc] {
			seen[loc] = true
			locations = append(locations, loc)
		}
	}
	return locations, nil
}

func createSessionFile(sessionsDir, path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("path is required")
	}
	// Expand ~ to home
	if strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		path = filepath.Join(home, path[2:])
	}
	// Clean path
	path = filepath.Clean(path)
	// Reject path traversal
	if strings.Contains(path, "..") {
		return "", errors.New("invalid path")
	}
	// Ensure parent exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := os.MkdirAll(path, 0755); err != nil {
			return "", err
		}
	}

	projectDir := filepath.Join(sessionsDir, encodeProjectName(path))
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return "", err
	}

	id := uuid.New().String()
	timestamp := time.Now().UTC().Format("2006-01-02T15-04-05.000Z")
	filename := timestamp + "_" + id + ".jsonl"
	filePath := filepath.Join(projectDir, filename)

	header := map[string]any{
		"type":      "session",
		"version":   3,
		"id":        id,
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"cwd":       path,
	}
	data, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filePath, append(data, '\n'), 0644); err != nil {
		return "", err
	}
	return filename, nil
}
```

Also add `"github.com/google/uuid"` to imports. Check if it's already in `go.mod`:

```bash
grep uuid /Users/setkyar/pi-web/go.mod
```

If not present, add it. Actually, looking at the existing code, there's no uuid dependency. We can generate a UUID manually or add the dependency. For simplicity, let's use a simple approach without adding a dependency:

Replace the `uuid.New().String()` with a manual ID:

```go
id := fmt.Sprintf("%x-%x-%x-%x-%x",
	rand.Uint32(), rand.Uint32()&0xffff, rand.Uint32()&0xffff&0x0fff|0x4000,
	rand.Uint32()&0x3fff|0x8000, rand.Uint32())
```

Wait, that's complex. Better to just use `crypto/rand` and format as UUID v4:

Actually, let's check what `pi` uses. From the existing sessions, the IDs look like standard UUIDs: `d60958d6-5e8f-4ff0-bbd6-0c2508c1b218`. Let's generate one simply:

```go
func randomUUID() string {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variant is 10
	return fmt.Sprintf("%x-%x-%x-%x-%x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
```

Add `crypto/rand` and `math/rand` or just `crypto/rand` to imports. Actually we just need `crypto/rand` and `fmt`.

Wait, `fmt` is already imported. We just need to add `crypto/rand`.

Let me revise. The `createSessionFile` function should use `crypto/rand`:

```go
func createSessionFile(sessionsDir, path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("path is required")
	}
	if strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		path = filepath.Join(home, path[2:])
	}
	path = filepath.Clean(path)
	if strings.Contains(path, "..") {
		return "", errors.New("invalid path")
	}
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := os.MkdirAll(path, 0755); err != nil {
			return "", err
		}
	}

	projectDir := filepath.Join(sessionsDir, encodeProjectName(path))
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return "", err
	}

	id := randomUUID()
	timestamp := time.Now().UTC().Format("2006-01-02T15-04-05.000Z")
	filename := timestamp + "_" + id + ".jsonl"
	filePath := filepath.Join(projectDir, filename)

	header := map[string]any{
		"type":      "session",
		"version":   3,
		"id":        id,
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"cwd":       path,
	}
	data, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filePath, append(data, '\n'), 0644); err != nil {
		return "", err
	}
	return filename, nil
}

func randomUUID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
```

Add `crypto/rand` to imports in `main.go`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/setkyar/pi-web
go test -run "TestEncodeProjectName|TestEncodeDecodeRoundTrip|TestCreateSessionFile" -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/setkyar/pi-web
git add main.go main_test.go
git commit -m "feat: add session creation helpers (encodeProjectName, listRecentLocations, createSessionFile)"
```

---

### Task 2: Add HTTP Handler and Route

**Files:**
- Modify: `main.go` (add route in `main()`, add `handleNewSession`)

- [ ] **Step 1: Add route in `main()`**

Find the route registration block (around line 624) and add:

```go
	http.HandleFunc("/api/new-session", srv.handleNewSession)
```

After `http.HandleFunc("/events", srv.handleEvents)`.

- [ ] **Step 2: Add `handleNewSession` handler**

Insert near other handlers (e.g., after `handleEvents` around line 970):

```go
func (s *server) handleNewSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if body.Path == "" {
		writeJSONError(w, http.StatusBadRequest, "path is required")
		return
	}

	id, err := createSessionFile(s.sessionsDir, body.Path)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true, "id": id})
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/setkyar/pi-web
git add main.go
git commit -m "feat: add POST /api/new-session handler"
```

---

### Task 3: Update Index Template — "+" Button

**Files:**
- Modify: `main.go` — `indexTmpl` template string (around line 1388)

- [ ] **Step 1: Add "+" button to header**

Find the header section in `indexTmpl`:

```html
<div class="header">
  <div class="header-inner">
    <h1>🥧 Pi Sessions</h1>
```

Change to:

```html
<div class="header">
  <div class="header-inner">
    <div class="header-top">
      <h1>🥧 Pi Sessions</h1>
      <button class="new-session-btn" id="newSessionBtn" title="Start new session">+</button>
    </div>
```

- [ ] **Step 2: Add header-top CSS**

Find `.header h1` in the style block and add before it:

```css
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--line-height);
}
.new-session-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.new-session-btn:hover {
  background: var(--accent);
  color: var(--body-bg);
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/setkyar/pi-web
git add main.go
git commit -m "feat: add new session button to header"
```

---

### Task 4: Update Index Template — Modal HTML + CSS + JS

**Files:**
- Modify: `main.go` — `indexTmpl` template string

- [ ] **Step 1: Add modal HTML before `</body>`**

Find the closing `</body>` tag in `indexTmpl` and insert before it:

```html
<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <h2>Start New Session</h2>
    <div class="recent-locations" id="recentLocations"></div>
    <input type="text" id="sessionPath" placeholder="/path/to/project or ~/project" autofocus>
    <div class="modal-actions">
      <button class="btn-secondary" id="cancelBtn">Cancel</button>
      <button class="btn-primary" id="createBtn">Create</button>
    </div>
    <div class="modal-error" id="modalError"></div>
  </div>
</div>
```

- [ ] **Step 2: Add modal CSS in style block**

Find `.empty-state h3` CSS and add after the `@media` block (at the end of `<style>`):

```css
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.modal-overlay.open {
  display: flex;
}
.modal {
  background: var(--container-bg);
  border: 1px solid var(--dim);
  border-radius: 6px;
  padding: calc(var(--line-height) * 1.5);
  width: 100%;
  max-width: 480px;
}
.modal h2 {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: var(--line-height);
  color: var(--text);
}
.modal input {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  background: var(--body-bg);
  color: var(--text);
  border: 1px solid var(--dim);
  border-radius: 3px;
  margin-bottom: var(--line-height);
}
.modal input:focus {
  outline: none;
  border-color: var(--accent);
}
.recent-locations {
  margin-bottom: var(--line-height);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.recent-chip {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 3px;
  background: var(--body-bg);
  border: 1px solid var(--dim);
  color: var(--muted);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  overflow-wrap: anywhere;
}
.recent-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn-primary, .btn-secondary {
  padding: 5px 14px;
  font-size: 11px;
  font-family: inherit;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid;
}
.btn-primary {
  background: var(--accent);
  color: var(--body-bg);
  border-color: var(--accent);
}
.btn-secondary {
  background: transparent;
  color: var(--muted);
  border-color: var(--dim);
}
.btn-secondary:hover {
  color: var(--text);
  border-color: var(--text);
}
.modal-error {
  margin-top: 8px;
  font-size: 11px;
  color: #f85149;
  min-height: 16px;
}
@media (max-width: 700px) {
  .modal {
    padding: var(--line-height) 16px;
  }
}
```

- [ ] **Step 3: Add modal JS before `</script>`**

Find the existing `<script>` block in `indexTmpl` and add before its closing `</script>`:

```javascript
const modalOverlay = document.getElementById('modalOverlay');
const newSessionBtn = document.getElementById('newSessionBtn');
const sessionPath = document.getElementById('sessionPath');
const createBtn = document.getElementById('createBtn');
const cancelBtn = document.getElementById('cancelBtn');
const modalError = document.getElementById('modalError');
const recentLocations = document.getElementById('recentLocations');

function openModal() {
  modalOverlay.classList.add('open');
  sessionPath.value = '';
  modalError.textContent = '';
  loadRecentLocations();
  setTimeout(() => sessionPath.focus(), 10);
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

function loadRecentLocations() {
  fetch('/api/recent-locations')
    .then(r => r.json())
    .then(data => {
      recentLocations.innerHTML = '';
      if (!data.locations || data.locations.length === 0) return;
      data.locations.slice(0, 10).forEach(loc => {
        const chip = document.createElement('span');
        chip.className = 'recent-chip';
        chip.textContent = loc;
        chip.addEventListener('click', () => {
          sessionPath.value = loc;
          sessionPath.focus();
        });
        recentLocations.appendChild(chip);
      });
    })
    .catch(() => {});
}

function doCreate() {
  const path = sessionPath.value.trim();
  if (!path) {
    modalError.textContent = 'Please enter a path';
    return;
  }
  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';
  fetch('/api/new-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  })
    .then(r => r.json())
    .then(data => {
      createBtn.disabled = false;
      createBtn.textContent = 'Create';
      if (data.ok && data.id) {
        window.location.href = '/session?id=' + encodeURIComponent(data.id);
      } else {
        modalError.textContent = data.error || 'Failed to create session';
      }
    })
    .catch(err => {
      createBtn.disabled = false;
      createBtn.textContent = 'Create';
      modalError.textContent = err.message || 'Network error';
    });
}

newSessionBtn.addEventListener('click', openModal);
cancelBtn.addEventListener('click', closeModal);
createBtn.addEventListener('click', doCreate);
sessionPath.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doCreate();
  if (e.key === 'Escape') closeModal();
});
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});
```

- [ ] **Step 4: Commit**

```bash
cd /Users/setkyar/pi-web
git add main.go
git commit -m "feat: add new session modal with recent locations"
```

---

### Task 5: Add GET /api/recent-locations Handler

**Files:**
- Modify: `main.go`

- [ ] **Step 1: Add route in `main()`**

```go
	http.HandleFunc("/api/recent-locations", srv.handleRecentLocations)
```

- [ ] **Step 2: Add handler**

```go
func (s *server) handleRecentLocations(w http.ResponseWriter, r *http.Request) {
	locations, err := listRecentLocations(s.sessionsDir)
	if err != nil {
		locations = []string{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"locations": locations})
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/setkyar/pi-web
git add main.go
git commit -m "feat: add GET /api/recent-locations endpoint"
```

---

### Task 6: Test the Full Feature

**Files:**
- Modify: `home_mobile_test.go` (add test for new button)

- [ ] **Step 1: Add test for new session button in template**

Open `home_mobile_test.go` and add:

```go
func TestNewSessionButtonExists(t *testing.T) {
	checks := []string{
		`id="newSessionBtn"`,
		`class="new-session-btn"`,
		`title="Start new session"`,
		`+`,
	}
	for _, check := range checks {
		if !strings.Contains(indexTmpl.Tree.Root.String(), check) {
			t.Fatalf("index template missing %q", check)
		}
	}
}

func TestNewSessionModalExists(t *testing.T) {
	checks := []string{
		`id="modalOverlay"`,
		`class="modal-overlay"`,
		`id="sessionPath"`,
		`id="createBtn"`,
		`id="cancelBtn"`,
		`/api/new-session`,
		`/api/recent-locations`,
	}
	for _, check := range checks {
		if !strings.Contains(indexTmpl.Tree.Root.String(), check) {
			t.Fatalf("index template missing %q", check)
		}
	}
}
```

- [ ] **Step 2: Run all tests**

```bash
cd /Users/setkyar/pi-web
go test ./... -v
```

Expected: All tests pass

- [ ] **Step 3: Build and manual test**

```bash
cd /Users/setkyar/pi-web
go build -o pi-web .
./pi-web &
```

Open browser to `http://localhost:31483`, click "+", enter a path, verify modal works, verify redirect to new session.

Kill server:
```bash
pkill -f "pi-web"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/setkyar/pi-web
git add home_mobile_test.go
git commit -m "test: add tests for new session button and modal"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| "+" button in header | Task 3 |
| Modal with path input | Task 4 |
| Recent locations dropdown | Tasks 4, 5 |
| `~` expansion | Task 1 (`createSessionFile`) |
| POST /api/new-session | Task 2 |
| Redirect to new session | Task 4 (JS) |
| Mobile-friendly modal | Task 4 (CSS media query) |
| Error handling in modal | Task 4 (JS) + Task 2 (handler) |
| Server-side file creation | Task 1 |

## Placeholder Scan

- ✅ No "TBD", "TODO", "implement later"
- ✅ All test code shown in full
- ✅ All handler code shown in full
- ✅ Exact file paths specified
- ✅ Exact commands with expected output

## Type Consistency Check

- `encodeProjectName` returns `string` — used in `createSessionFile`
- `listRecentLocations` returns `([]string, error)` — used in handler
- `createSessionFile` returns `(string, error)` — used in handler, returns filename as ID
- `handleNewSession` writes `{"ok": true, "id": string}` — matches JS expectation

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-start-new-session.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach would you like?