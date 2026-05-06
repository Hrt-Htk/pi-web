# Design: Start New Session (Mobile + Desktop)

## Goal
Allow users to create a new pi session directly from the pi-web browser UI by selecting a directory path. The feature works on both mobile and desktop.

## Context
- pi-web is a Go HTTP server that serves a web UI for pi sessions
- Sessions are stored as JSONL files under `~/.pi/agent/sessions/<project-dir>/<timestamp>_<uuid>.jsonl`
- Project directories use `--` as path separator: `--Users-setkyar-pi-web--`
- The server already has a chat system that spawns `pi --mode rpc` workers per session
- Current UI: header with search + session cards grouped by project

## Architecture

### UI Flow
```
User clicks "+" button in header
  → Modal overlay appears
  → User enters/selects a directory path
  → User clicks "Create"
  → POST /api/new-session
  → Server creates JSONL file
  → Redirect to /session?id=<new-id>
```

### Components

1. **"+" Button** — Floating action button in the header area (visible on all screen sizes)
2. **Modal Dialog** — Centered overlay with:
   - Path text input (with `~` → home expansion)
   - Recent locations dropdown (decoded from existing session dirs)
   - Create / Cancel buttons
3. **New API Endpoint** — `POST /api/new-session`
4. **Server-side Session Creation** — Direct file I/O, no external process

### Data Flow

```
Browser                          Server
  │                                 │
  ├─ POST /api/new-session ───────→│
  │   { "path": "/Users/setkyar/foo" }│
  │                                 │
  │  validate path exists           │
  │  → encode to dir name           │
  │  → create dir if needed         │
  │  → write JSONL header           │
  │                                 │
  │←─ 200 { "id": "...", "ok": true }│
  │                                 │
  ├─ GET /session?id=... ─────────→│
```

### Session File Format
```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"2026-05-06T...","cwd":"/Users/setkyar/foo"}
```

### Recent Locations
- Scan `~/.pi/agent/sessions/*` directories
- Decode each via reverse of `cleanProjectName()`
- Deduplicate and sort by recency
- Show top 10 in dropdown

## API Spec

### POST /api/new-session
**Request:**
```json
{ "path": "/Users/setkyar/my-project" }
```

**Response (200):**
```json
{ "ok": true, "id": "2026-05-06T..._uuid.jsonl" }
```

**Errors:**
- 400 — missing or invalid path
- 500 — failed to create file

## Error Handling
- Invalid path → 400 with clear message
- Non-existent parent directory → create it (if permissions allow)
- File write failure → 500
- Modal stays open on error, shows inline error message

## UI/UX Details
- `~` shorthand expanded to `$HOME`
- Input autofocused when modal opens
- Enter key submits form
- Escape key closes modal
- Recent locations shown as clickable chips above the input
- Mobile: modal takes full width with safe-area insets
- Desktop: modal max-width 480px centered

## Testing
- Unit test for path encoding/decoding round-trip
- Unit test for JSONL header generation
- Test that new session appears in loadAllSessions()
- Test modal open/close via JS (existing test patterns)

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Session format changes in pi | Keep format minimal (just header), pi will append to it |
| Path contains special chars | Sanitize and validate, reject paths with `..` traversal |
| Race condition creating dir | Use `os.MkdirAll` which is atomic enough for this case |
