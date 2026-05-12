package main

import (
	"strings"
	"testing"
)

func TestChatComposerScriptAccumulatesRepeatedImageSelections(t *testing.T) {
	checks := []string{
		"let selectedChatFiles = [];",
		"selectedChatFiles.push(file);",
		"for (const file of files) body.append('images', file);",
		"selectedChatFiles = [];",
	}
	for _, check := range checks {
		if !strings.Contains(exportJs, check) {
			t.Fatalf("template JS missing %q; repeated image selections may replace earlier attachments", check)
		}
	}
}

func TestChatComposerCSSUsesIntegratedToolbarLayout(t *testing.T) {
	checks := []string{
		".pi-chat-shell",
		".pi-chat-toolbar",
		"border: 1px solid var(--dim);",
		"border-top: none;",
	}
	for _, check := range checks {
		if !strings.Contains(sessionCss, check) {
			t.Fatalf("template CSS missing %q; composer should render as an integrated input bar", check)
		}
	}
}

func TestChatComposerEnterKeyDoesNotSubmitOnMobile(t *testing.T) {
	checks := []string{
		"function isMobileTextInputMode()",
		"if (isMobileTextInputMode()) return;",
		"form.requestSubmit();",
	}
	for _, check := range checks {
		if !strings.Contains(exportJs, check) {
			t.Fatalf("template JS missing %q; mobile Enter should insert a newline instead of sending", check)
		}
	}
}
