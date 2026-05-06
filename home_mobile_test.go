package main

import (
	"strings"
	"testing"
)

func TestHomePageMobilePreventsHorizontalOverflow(t *testing.T) {
	html := indexTmpl.Tree.Root.String()
	checks := []string{
		"overflow-x: hidden;",
		"min-width: 0;",
		"overflow-wrap: anywhere;",
	}
	for _, check := range checks {
		if !strings.Contains(html, check) {
			t.Fatalf("home page CSS missing %q; mobile home page can create horizontal scrollbar", check)
		}
	}
}

func TestNewSessionButtonExists(t *testing.T) {
	checks := []string{
		`id="newSessionBtn"`,
		`class="new-session-btn"`,
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
		`/api/new-session`,
		`/api/recent-locations`,
	}
	for _, check := range checks {
		if !strings.Contains(indexTmpl.Tree.Root.String(), check) {
			t.Fatalf("index template missing %q", check)
		}
	}
}
