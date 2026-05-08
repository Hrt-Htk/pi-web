# Fix Session DateTime Mismatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage session list display timestamps in the browser's local timezone, matching the session detail page behavior.

**Architecture:** Remove server-side `fmtTime` formatting; render raw ISO timestamps in `data-timestamp` attributes; add a small inline JavaScript snippet to format them client-side on page load.

**Tech Stack:** Go (html/template), HTML, JavaScript

---

### Task 1: Write failing test for removed fmtTime function

**Files:**
- Modify: `templates_embed_test.go`

- [ ] **Step 1: Add test asserting fmtTime is NOT in funcMap**

```go
func TestIndexTemplateDoesNotRegisterFmtTime(t *testing.T) {
	if _, ok := funcMap["fmtTime"]; ok {
		t.Fatal("funcMap should not contain fmtTime; timestamps are formatted client-side")
	}
}
```

- [ ] **Step 2: Add test asserting rendered output contains data-timestamp attribute**

```go
func TestIndexTemplateRendersDataTimestampAttribute(t *testing.T) {
	var buf bytes.Buffer
	data := []sessions.Session{{SessionSummary: sessions.SessionSummary{
		ID:           "s1.jsonl",
		Project:      "/tmp/project",
		LastActivity: "2026-05-08T09:49:41.591Z",
		ChatAvailable: true,
	}}}
	if err := indexTmpl.Execute(&buf, data); err != nil {
		t.Fatalf("failed to render index template: %v", err)
	}
	rendered := buf.String()
	if !strings.Contains(rendered, `data-timestamp="2026-05-08T09:49:41.591Z"`) {
		t.Fatalf("rendered index page missing data-timestamp attribute, got: %s", rendered)
	}
	// Ensure the old server-side formatted text is NOT present
	if strings.Contains(rendered, "May 8, 2026 9:49 AM") {
		t.Fatal("rendered index page still contains server-side formatted timestamp")
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `go test -run 'TestIndexTemplateDoesNotRegisterFmtTime|TestIndexTemplateRendersDataTimestampAttribute' -v`

Expected: FAIL — `fmtTime` still exists in `funcMap` and template still uses `{{ fmtTime }}`

- [ ] **Step 4: Commit the failing tests**

```bash
git add templates_embed_test.go
git commit -m "test: add failing tests for client-side timestamp formatting"
```

---

### Task 2: Remove fmtTime from Go code

**Files:**
- Modify: `index_template.go`

- [ ] **Step 1: Remove fmtTime function and funcMap entry**

Delete the entire `fmtTime` function and remove `"fmtTime"` from `funcMap`.

`index_template.go` should end up looking like this (only showing changed parts):

```go
func fmtTokens(n int) string { ... }
func fmtCost(n float64) string { ... }

var funcMap = template.FuncMap{
	"fmtTokens":   fmtTokens,
	"fmtCost":     fmtCost,
	"indexScript": func() string { return indexScriptPath },
}
```

- [ ] **Step 2: Verify Go tests still compile and failing tests now pass**

Run: `go test -run 'TestIndexTemplateDoesNotRegisterFmtTime|TestIndexTemplateRendersDataTimestampAttribute' -v`

Expected: FAIL on `TestIndexTemplateRendersDataTimestampAttribute` because template still uses `{{ fmtTime }}`.

- [ ] **Step 3: Commit**

```bash
git add index_template.go
git commit -m "refactor: remove server-side fmtTime function"
```

---

### Task 3: Update template to use data-timestamp and add client-side formatter

**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Replace fmtTime usage with data-timestamp**

In `templates/index.html`, find:

```html
<span>{{ fmtTime .LastActivity }}</span>
```

Replace with:

```html
<span data-timestamp="{{ .LastActivity }}">{{ .LastActivity }}</span>
```

- [ ] **Step 2: Add client-side timestamp formatter script**

Before the closing `</body>` tag (just before the existing `<script type="module" src="{{ indexScript }}"></script>`), add:

```html
<script>
(function() {
  document.querySelectorAll('[data-timestamp]').forEach(function(el) {
    var ts = el.dataset.timestamp;
    if (ts) {
      var d = new Date(ts);
      if (!isNaN(d)) {
        el.textContent = d.toLocaleString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit'
        });
      }
    }
  });
})();
</script>
```

- [ ] **Step 3: Run all Go tests**

Run: `go test ./...`

Expected: PASS — all tests pass including `TestIndexTemplateRendersDataTimestampAttribute`.

- [ ] **Step 4: Commit**

```bash
git add templates/index.html
git commit -m "feat: render timestamps client-side in browser local timezone"
```

---

### Task 4: Verify end-to-end

**Files:**
- None (manual verification)

- [ ] **Step 1: Build the binary**

Run: `go build -o pi-web .`

Expected: Clean build with no errors.

- [ ] **Step 2: Run the server and check the homepage**

Start the server: `./pi-web` (or with appropriate flags for your environment), load `http://localhost:8080/` in a browser.

Confirm:
1. Session cards show timestamps like "May 8, 2026 4:49 PM" (local timezone)
2. Open a session detail page for the same session
3. The header timestamp matches the card timestamp

- [ ] **Step 3: Commit verification notes (optional)**

If any issues found, fix and commit. Otherwise no additional commit needed.

---

## Self-Review

**Spec coverage:**
- ✅ Remove `fmtTime` from `funcMap` — Task 2
- ✅ Replace `{{ fmtTime .LastActivity }}` with `<span data-timestamp>` — Task 3 Step 1
- ✅ Add client-side JS formatter — Task 3 Step 2
- ✅ Testing — Task 1 and Task 3 Step 3

**Placeholder scan:**
- ✅ No TBD/TODO/fill-in-details
- ✅ All code shown explicitly
- ✅ All commands with expected output

**Type consistency:**
- ✅ `funcMap`, `indexTmpl`, `fmtTokens`, `fmtCost` names consistent with codebase
