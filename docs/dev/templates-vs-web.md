# `export/`, `live_templates/`, and `web/`

> This repo used to put export files, live Go templates, vendored JS, and Vite-owned frontend code under one overloaded `templates/` directory. That split is now explicit.

## Short Version

| Directory | Purpose |
|-----------|---------|
| `web/` | The **live app runtime** — Vite-built ES modules served from `/static/assets/...` |
| `live_templates/` | Thin **live app HTML/template shells** embedded by Go |
| `export/` | The **standalone share/export app** — self-contained HTML/CSS/JS for Gist uploads |

## ⚠️ Live App vs. Export — Separate Products

**These are not the same thing. Do not mix them up.**

The live app is a dynamic web UI served by the Go server. The export is a frozen, serverless HTML file uploaded to GitHub Gist. They share some CSS and DOM structure, but they have **separate HTML shells, separate JS runtimes, and separate Go rendering code**.

| | Live App (`/session`) | Export/Share (Gist) |
|---|---|---|
| Go renderer | `session_page.go` | `export.go` |
| HTML shell | `live_templates/session.html` | `export/index.html` |
| JS runtime | `web/src/session/` (Vite) | `export/app/*.js` + `export/vendor/` |
| CSS | `export/template.css` (shared) | `export/template.css` (shared) |
| Chat composer | Yes | No |
| Action buttons | Yes (baked into template) | No |
| SSE/API | Yes | No |
| Needs server | Yes | No — fully self-contained |

### Live App

The live app is the browser UI served by the local Go server.

#### Index page (`/`)

- Go renders `live_templates/index.html`.
- The template injects the Vite index module path via `indexScript`.
- The interactive code lives in `web/src/index/`.

#### Session page (`/session?id=...`)

- Go renders `live_templates/session.html`.
- The template includes action buttons (Sessions, Share, Terminal) and a chat composer placeholder.
- The page loads the Vite session module with `<script type="module" src="/static/assets/session-*.js">`.
- Interactive session behavior lives in `web/src/session/`.
- `export/app/*.js` is **not** used by the live session page.

#### Live reload / SSE

- `web/src/session/live/live-reload.js` is bundled by the Vite session entrypoint.
- The live session page uses server APIs and SSE (`/events?id=...`) for reloads, chat previews, and running-state updates.

### Standalone Export / Share

The export is a frozen, server-independent session snapshot uploaded by the Share flow.

When you click **"↗ Share"**:

1. The server calls `renderExportSessionPage(session)` in `export.go`.
2. Go renders `export/index.html` with `export/template.css`.
3. Go inlines the export runtime JS:
   - `export/vendor/marked.min.js`
   - `export/vendor/highlight.min.js`
   - `export/app/*.js` concatenated in lexical order and wrapped in one IIFE
   - `export/template.css` styles
4. The resulting single HTML file is uploaded as a private Gist with `gh gist create --public=false`.

The export intentionally has no chat composer, no action buttons, no SSE, no API calls, and no external asset dependency.

### What Not To Do

- **Do not** use `export/index.html` for the live session page. It has no buttons, no chat composer placeholder, and no Vite module hook.
- **Do not** inject live-only chrome (buttons, chat composer) into `export/index.html`. The export must remain server-independent.
- **Do not** use `export/app/*.js` for the live app. The live app uses Vite-built `web/src/session/`.
- **Do not** put `export/template.css` in `live_templates/`. The CSS is shared, but it lives in `export/` because the export needs it at build time.

## Why the Split Exists

The live app and export are **different products** with different constraints:

| | Live App | Export |
|---|---|---|
| Needs Go server? | Yes | No |
| Chat? | Yes | No |
| Action buttons? | Yes | No |
| API/SSE? | Yes | No |
| JS delivery | Vite assets (`/static/assets/...`) | Inline JS (no external requests) |
| State | Live/updating | Frozen snapshot |
| HTML shell | `live_templates/session.html` | `export/index.html` |
| Go renderer | `session_page.go` | `export.go` |

They share `export/template.css` because both need the same visual styling. They share `prepareSessionPageData()` because both need the same base64-encoded session data. Everything else is separate.

## Remaining Duplication

There is still duplicated session rendering logic between:

- `web/src/session/` for the live app
- `export/app/*.js` for standalone exports

That duplication is deliberate for now. The next safe cleanup would be extracting small pure formatting/tree helpers that can be shared without forcing the export path to depend on live-only chat, SSE, or API behavior.
