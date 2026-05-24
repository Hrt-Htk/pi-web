package main

import (
	"strings"
	"testing"
)

func TestHomePageMobilePreventsHorizontalOverflow(t *testing.T) {
	checks := []string{
		"overflow-x: hidden;",
		"min-width: 0;",
		"overflow-wrap: anywhere;",
	}
	for _, check := range checks {
		if !strings.Contains(indexCSS, check) {
			t.Fatalf("home page CSS missing %q; mobile home page can create horizontal scrollbar", check)
		}
	}
}

func TestHomePageRunningCountHasDesktopAndMobilePlacements(t *testing.T) {
	html := indexTmpl.Tree.Root.String()
	htmlChecks := []string{
		`<div class="header-top">`,
		`<span class="stat-running" data-running-stat><span data-running-count>0</span><span class="stat-running-label"> active</span></span>`,
		`<span class="stat-running" id="statRunning" data-running-stat><span data-running-count>0</span><span class="stat-running-label"> active</span></span>`,
		"document.querySelectorAll('[data-running-count]')",
		"document.querySelectorAll('[data-running-stat]')",
	}
	for _, check := range htmlChecks {
		if !strings.Contains(html, check) {
			t.Fatalf("home running-count responsive UI missing %q", check)
		}
	}
	cssChecks := []string{
		".stats-bar .stat-running.visible {",
		"display: inline-flex;",
		"display: none;",
		".header-top .stat-running.visible {",
	}
	for _, check := range cssChecks {
		if !strings.Contains(indexCSS, check) {
			t.Fatalf("home running-count responsive CSS missing %q", check)
		}
	}
}

func TestHomePageNewSessionButtonHasDesktopAndMobilePlacements(t *testing.T) {
	html := indexTmpl.Tree.Root.String()
	htmlChecks := []string{
		`class="new-session-btn new-session-btn-desktop" data-new-session-btn`,
		`class="new-session-btn new-session-btn-mobile" id="newSessionBtn" data-new-session-btn`,
	}
	for _, check := range htmlChecks {
		if !strings.Contains(html, check) {
			t.Fatalf("home responsive new-session button HTML missing %q", check)
		}
	}
	cssChecks := []string{
		".new-session-btn-mobile {",
		"display: none;",
		".new-session-btn-desktop {",
		"position: fixed;",
		"bottom: calc(18px + env(safe-area-inset-bottom));",
		"right: calc(18px + env(safe-area-inset-right));",
		".content {",
		"padding: 20px 16px calc(92px + env(safe-area-inset-bottom));",
	}
	for _, check := range cssChecks {
		if !strings.Contains(indexCSS, check) {
			t.Fatalf("home responsive new-session button CSS missing %q", check)
		}
	}
}

func TestNewSessionButtonExists(t *testing.T) {
	checks := []string{
		`id="newSessionBtn"`,
		`new-session-btn`,
		`title="Start new session"`,
		`+`,
	}
	for _, check := range checks {
		if !strings.Contains(indexTmpl.Tree.Root.String(), check) {
			t.Fatalf("index template missing %q", check)
		}
	}
}

func TestNewSessionModalExists(t *testing.T) {
	checks := []string{
		`id="modalOverlay"`,
		`class="modal-overlay"`,
		`id="sessionPath"`,
		`id="createBtn"`,
		`id="cancelBtn"`,
	}
	for _, check := range checks {
		if !strings.Contains(indexTmpl.Tree.Root.String(), check) {
			t.Fatalf("index template missing %q", check)
		}
	}
}

func TestHomePageSessionCardsExposeRunningStatusHook(t *testing.T) {
	if !strings.Contains(indexTmplStr, `data-session-id="{{ .ID }}"`) {
		t.Fatal("homepage should expose session ids for running-status cards")
	}
}
