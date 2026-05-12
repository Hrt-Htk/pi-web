# Export

This directory contains the **standalone, server-independent session snapshot** that gets uploaded as a GitHub Gist when you click **↗ Share**.

The export is a single self-contained `session.html` file with all CSS and JS inlined. It has no chat composer, no SSE, no API calls, and no external asset dependencies.

## Directory Layout

```
export/
├── app/              # Export runtime JS modules
│   ├── 00-data.js    # Base64 session data decoding, URL params
│   ├── 10-tree.js    # Entry tree building & navigation state
│   ├── 20-filter.js  # Tool/branch filtering logic
│   ├── 30-format.js  # Markdown & code formatting helpers
│   ├── 40-render-tree.js    # Tree sidebar rendering
│   ├── 50-render-entry.js   # Entry detail rendering
│   ├── 60-header.js         # Session header rendering
│   ├── 70-navigation.js     # Tree selection & breadcrumb
│   ├── 80-ui.js             # UI helpers (modals, toasts, etc.)
│   └── 90-chat.js           # Chat-related rendering (export has no composer)
├── vendor/           # Vendored third-party libraries
│   ├── marked.min.js
│   └── highlight.min.js
└── README.md
```

## How the Export is Built

`export.go` (`renderExportSessionPage`) produces the final HTML:

1. **Template & CSS** — Uses `export/template.html` and `export/template.css`.
2. **Vendor JS** — Inlines `vendor/marked.min.js` and `vendor/highlight.min.js`.
3. **App JS** — Reads all `app/*.js` files, sorts them lexically by filename (the `00-`, `10-`, … prefixes control evaluation order), concatenates them, and wraps the result in a single IIFE.
4. **Session data** — Embeds the session JSON as a base64 `<script type="application/json">` blob decoded by `00-data.js`.

## When to Edit These Files

| Change | Where |
|--------|-------|
| Fix export rendering / filtering / tree behavior | `export/app/*.js` |
| Update markdown or syntax-highlighting libraries | `export/vendor/*.js` |
| Change session page layout or styling | `export/template.html` or `export/template.css` |

## Important Notes

- The numeric prefixes (`00-`, `10-`, …) on `app/*.js` **must** be preserved — they determine concatenation order.
- The live session page (`/session?id=...`) uses the same `export/template.html` shell, but Go replaces `{{SESSION_SCRIPT}}` with a Vite module URL and injects action buttons + chat composer. If you change `export/template.html`, verify both live and export render correctly.
- Unlike the live app (`web/src/session/`), the export JS is **not** built by Vite. It is plain ES5-ish JS concatenated at compile time by Go.
