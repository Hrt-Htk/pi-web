package main

import (
	"strings"
	"testing"
)

func TestMobileSidebarClosesWhenNavigatingTree(t *testing.T) {
	checks := []string{
		"function setSidebarOpen(open)",
		"document.body.classList.toggle('sidebar-open', open);",
		"if (isMobileLayout()) closeSidebar();",
	}
	for _, check := range checks {
		if !strings.Contains(templateJs, check) {
			t.Fatalf("template JS missing %q; mobile sidebar can remain stuck over chat", check)
		}
	}
}

func TestMobileSessionActionsDoNotCoverOpenSidebar(t *testing.T) {
	if !strings.Contains(templateHtml, `class="session-actions"`) && !strings.Contains(templateCss, "body.sidebar-open .session-actions") {
		// templateHtml is static; local session action markup is generated in Go.
	}
	checks := []string{
		`class="session-actions"`,
		"body.sidebar-open .session-actions",
		"@media (max-width: 900px)",
	}
	combined := templateCss + templateHtml + liveReloadJs + templateJs + chatComposerHtml("s.jsonl") + generateExportHtml(Session{ID: "s.jsonl"}, true)
	for _, check := range checks {
		if !strings.Contains(combined, check) {
			t.Fatalf("mobile action UI missing %q", check)
		}
	}
}
