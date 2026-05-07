package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"strings"

	"pi-web/internal/render"
)

//go:embed all:web/dist
var distEmbed embed.FS

// distFS is the Vite build output rooted at "web/dist/", surfaced as if "/" were
// the dist directory. Run `npm --prefix web run build` before `go build` —
// otherwise the embed directive will fail at build time.
func distFS() fs.FS {
	sub, err := fs.Sub(distEmbed, "web/dist")
	if err != nil {
		panic(err)
	}
	return sub
}

func loadIndexScript(distFS fs.FS) (scriptPath string, js string, err error) {
	data, err := fs.ReadFile(distFS, ".vite/manifest.json")
	if err != nil {
		return "", "", fmt.Errorf("read manifest: %w", err)
	}
	var manifest render.Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return "", "", fmt.Errorf("parse manifest: %w", err)
	}
	entry, ok := manifest["src/index/index.js"]
	if !ok {
		return "", "", fmt.Errorf("manifest missing src/index/index.js entry")
	}
	if entry.File == "" {
		return "", "", fmt.Errorf("manifest entry file is empty")
	}
	if strings.HasPrefix(entry.File, "/") {
		return "", "", fmt.Errorf("manifest entry file is absolute: %s", entry.File)
	}
	if strings.Contains(entry.File, "..") {
		return "", "", fmt.Errorf("manifest entry file contains path traversal: %s", entry.File)
	}
	scriptPath, ok = manifest.ScriptPath("src/index/index.js")
	if !ok {
		return "", "", fmt.Errorf("manifest script path not found")
	}
	content, err := fs.ReadFile(distFS, entry.File)
	if err != nil {
		return "", "", fmt.Errorf("read index js: %w", err)
	}
	return scriptPath, string(content), nil
}

func serveIndexJS(js string, immutable bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		if immutable {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		_, _ = w.Write([]byte(js))
	}
}
