package main

import (
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"sort"
	"strings"
)

//go:embed templates/template.html
var templateHtml string

//go:embed templates/template.css
var templateCss string

//go:embed templates/template.js
var templateJs string

//go:embed templates/vendor/marked.min.js
var markedJs string

//go:embed templates/vendor/highlight.min.js
var hljsJs string

//go:embed templates/live_reload.js
var liveReloadJsBody string

//go:embed templates/chat_composer.html
var chatComposerTmplStr string

var liveReloadJs = "<script>\n" + liveReloadJsBody + "</script>\n"

var chatComposerTmpl = template.Must(template.New("chat_composer").Parse(chatComposerTmplStr))

var precomputedThemeVars = computeThemeVars()

func generateExportHtml(session Session, showButtons bool) string {
	leafID := ""
	if len(session.Entries) > 0 {
		if id, ok := session.Entries[len(session.Entries)-1]["id"].(string); ok {
			leafID = id
		}
	}

	sessionData := map[string]any{
		"header":        session.Header,
		"entries":       session.Entries,
		"leafId":        leafID,
		"systemPrompt":  nil,
		"tools":         nil,
		"renderedTools": nil,
	}

	dataJSON, _ := json.Marshal(sessionData)
	dataBase64 := base64.StdEncoding.EncodeToString(dataJSON)

	bodyBg := "#18181e"
	cardBg := "#1e1e24"
	infoBg := "#3c3728"

	css := templateCss
	css = strings.Replace(css, "{{THEME_VARS}}", precomputedThemeVars, 1)
	css = strings.Replace(css, "{{BODY_BG}}", bodyBg, 1)
	css = strings.Replace(css, "{{CONTAINER_BG}}", cardBg, 1)
	css = strings.Replace(css, "{{INFO_BG}}", infoBg, 1)

	html := templateHtml
	html = strings.Replace(html, "<title>Session Export</title>", "<title>"+template.HTMLEscapeString(sessionName(session))+"</title>", 1)
	html = strings.Replace(html, "{{CSS}}", css, 1)
	html = strings.Replace(html, "{{JS}}", templateJs, 1)
	html = strings.Replace(html, "{{SESSION_DATA}}", dataBase64, 1)
	html = strings.Replace(html, "{{MARKED_JS}}", markedJs, 1)
	html = strings.Replace(html, "{{HIGHLIGHT_JS}}", hljsJs, 1)

	if showButtons {
		btns := `<div class="session-actions">
<a href="/" class="session-action" title="Back to sessions">← Sessions</a>
<button id="share-btn" class="session-action" title="Share session as GitHub Gist">↗ Share</button>
</div>`
		html = strings.Replace(html, "<body>", "<body>"+btns, 1)
		html = strings.Replace(html, "{{CHAT_COMPOSER}}", chatComposerHtml(session.ID), 1)
		html = strings.Replace(html, "</body>", liveReloadJs+"</body>", 1)
	} else {
		html = strings.Replace(html, "{{CHAT_COMPOSER}}", "", 1)
	}

	return html
}

func chatComposerHtml(sessionID string) string {
	var buf strings.Builder
	if err := chatComposerTmpl.Execute(&buf, struct{ SessionID string }{sessionID}); err != nil {
		return ""
	}
	return buf.String()
}

func computeThemeVars() string {
	vars := map[string]string{
		"cyan": "#00d7ff", "blue": "#5f87ff", "green": "#b5bd68", "red": "#cc6666",
		"yellow": "#ffff00", "gray": "#808080", "dimGray": "#666666", "darkGray": "#505050",
		"accent": "#8abeb7", "selectedBg": "#3a3a4a", "userMessageBg": "#343541",
		"toolPendingBg": "#282832", "toolSuccessBg": "#283228", "toolErrorBg": "#3c2828",
		"customMessageBg": "#2d2838", "customMessageLabel": "#9575cd", "thinkingText": "#808080",
		"mdHeading": "#f0c674", "mdLink": "#81a2be", "mdLinkUrl": "#666666",
		"mdCode": "#8abeb7", "mdCodeBlock": "#b5bd68", "mdCodeBlockBorder": "#808080",
		"mdQuote": "#808080", "mdQuoteBorder": "#808080", "mdHr": "#808080",
		"mdListBullet": "#8abeb7", "toolDiffAdded": "#b5bd68", "toolDiffRemoved": "#cc6666",
		"toolDiffContext": "#808080", "syntaxComment": "#6A9955", "syntaxKeyword": "#569CD6",
		"syntaxFunction": "#DCDCAA", "syntaxVariable": "#9CDCFE", "syntaxString": "#CE9178",
		"syntaxNumber": "#B5CEA8", "syntaxType": "#4EC9B0", "syntaxOperator": "#D4D4D4",
		"syntaxPunctuation": "#D4D4D4", "thinkingOff": "#505050", "thinkingMinimal": "#6e6e6e",
		"thinkingLow": "#5f87af", "thinkingMedium": "#81a2be", "thinkingHigh": "#b294bb",
		"thinkingXhigh": "#d183e8", "bashMode": "#b5bd68", "success": "#b5bd68",
		"error": "#cc6666", "warning": "#ffff00", "muted": "#808080", "dim": "#666666",
		"text": "#c9d1d9", "border": "#5f87ff", "borderAccent": "#00d7ff", "borderMuted": "#505050",
		"toolOutput": "#808080",
	}
	var lines []string
	for k, v := range vars {
		lines = append(lines, fmt.Sprintf("      --%s: %s;", k, v))
	}
	sort.Strings(lines)
	return strings.Join(lines, "\n")
}
