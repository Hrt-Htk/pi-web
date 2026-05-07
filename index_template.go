package main

import (
	_ "embed"
	"fmt"
	"html/template"
	"time"

	"pi-web/internal/sessions"
)

//go:embed templates/index.html
var indexTmplStr string

func fmtTime(ts string) string {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return ts
	}
	return t.Format("Jan 2, 2006 3:04 PM")
}

func fmtTokens(n int) string {
	if n >= 1_000_000 {
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	}
	if n >= 1_000 {
		return fmt.Sprintf("%.1fk", float64(n)/1_000)
	}
	return fmt.Sprintf("%d", n)
}

func fmtCost(n float64) string {
	if n == 0 {
		return "—"
	}
	return fmt.Sprintf("$%.4f", n)
}

func sessionName(s sessions.Session) string {
	if s.Header != nil {
		if name, ok := s.Header["name"].(string); ok && name != "" {
			return name
		}
	}
	for _, e := range s.Entries {
		if e["type"] == "message" {
			msg, ok := e["message"].(map[string]any)
			if ok {
				if role, _ := msg["role"].(string); role == "user" {
					content := msg["content"]
					var text string
					switch v := content.(type) {
					case string:
						text = v
					case []any:
						for _, item := range v {
							if block, ok := item.(map[string]any); ok {
								if t, _ := block["type"].(string); t == "text" {
									text += fmt.Sprintf("%v", block["text"])
								}
							}
						}
					}
					if len(text) > 80 {
						text = text[:80] + "…"
					}
					return text
				}
			}
		}
	}
	return s.Filename
}

var funcMap = template.FuncMap{
	"fmtTime":     fmtTime,
	"fmtTokens":   fmtTokens,
	"fmtCost":     fmtCost,
	"sessionName": sessionName,
	"indexScript": func() string { return indexScriptPath },
}

var indexTmpl = template.Must(template.New("index").Funcs(funcMap).Parse(indexTmplStr))
