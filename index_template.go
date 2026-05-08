package main

import (
	_ "embed"
	"fmt"
	"html/template"
	"time"
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

var funcMap = template.FuncMap{
	"fmtTime":     fmtTime,
	"fmtTokens":   fmtTokens,
	"fmtCost":     fmtCost,
	"indexScript": func() string { return indexScriptPath },
}

var indexTmpl = template.Must(template.New("index").Funcs(funcMap).Parse(indexTmplStr))
