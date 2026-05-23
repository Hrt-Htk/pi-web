package main

import (
	"strings"
	"testing"

	"pi-web/internal/sessions"
)

func TestMobileSidebarClosesWhenNavigatingTree(t *testing.T) {
	checks := []string{
		"function setSidebarOpen(open)",
		"document.body.classList.toggle('sidebar-open', open);",
		"if (isMobileLayout()) closeSidebar();",
	}
	for _, check := range checks {
		if !strings.Contains(exportJs, check) {
			t.Fatalf("template JS missing %q; mobile sidebar can remain stuck over chat", check)
		}
	}
}

func TestMobileSessionActionsStayAtTopAndHideBehindSidebar(t *testing.T) {
	checks := []string{
		`class="session-actions"`,
		"body.sidebar-open .session-actions",
		"@media (max-width: 900px)",
		"top: calc(10px + env(safe-area-inset-top));",
	}
	combined := liveSessionCss + exportHtml + exportJs + chatComposerHtmlForSession(sessions.Session{SessionSummary: sessions.SessionSummary{ID: "s.jsonl"}}) + renderLiveSessionPage(sessions.Session{SessionSummary: sessions.SessionSummary{ID: "s.jsonl"}})
	for _, check := range checks {
		if !strings.Contains(combined, check) {
			t.Fatalf("mobile action UI missing %q", check)
		}
	}
	// Session actions should use top, not bottom positioning, in mobile breakpoint.
	// The .hide-sidebar button legitimately uses bottom positioning — that's unrelated.
	// Assert .session-actions inside a mobile media query does NOT have bottom:
	cssAfterMobile := liveSessionCss[strings.Index(liveSessionCss, "@media (max-width: 900px)"):]
	sessionActionsIdx := strings.Index(cssAfterMobile, ".session-actions")
	if sessionActionsIdx == -1 {
		t.Fatalf("missing .session-actions in mobile media query")
	}
	// Find the closing brace of this .session-actions block
	blockIdx := strings.Index(cssAfterMobile[sessionActionsIdx:], "}")
	if blockIdx == -1 {
		t.Fatalf("unclosed .session-actions block in mobile media query")
	}
	sessionActionsBlock := cssAfterMobile[sessionActionsIdx : sessionActionsIdx+blockIdx+1]
	if strings.Contains(sessionActionsBlock, "bottom:") && !strings.Contains(sessionActionsBlock, "bottom: auto") {
		t.Fatalf("mobile session actions should use top positioning, not bottom, to avoid overlapping chat composer")
	}
}

func TestMobileSessionActionsDoNotCoverHeaderToggleButtons(t *testing.T) {
	checks := []string{
		"padding: calc(var(--line-height) * 3) 16px calc(var(--pi-chat-composer-height, 0px) + var(--line-height));",
		".header-toggle-btn",
		"data-action=\"toggle-thinking\"",
		"data-action=\"toggle-tools\"",
	}
	combined := liveSessionCss + exportJs
	for _, check := range checks {
		if !strings.Contains(combined, check) {
			t.Fatalf("mobile session header controls missing %q; fixed session actions can cover toggle buttons", check)
		}
	}
}
