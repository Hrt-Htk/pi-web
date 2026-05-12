package main

import (
	"strings"
	"testing"
)

func TestModelSelectorMarkupExists(t *testing.T) {
	jsChecks := []string{
		"pi-chat-model-popup",
		"pi-chat-model-search",
		"pi-chat-model-list",
		"/api/models",
		"/api/set-model?id=",
		"loadModelSelector",
		"model-scope-badge",
		"isScoped",
		"modelChanges",
		"onWorkerModelUpdate",
		"updateToggleFromStatus",
		"data.model",
		"data.modelProvider",
	}
	for _, check := range jsChecks {
		if !strings.Contains(exportJs, check) {
			t.Fatalf("missing %q in template.js", check)
		}
	}
	cssChecks := []string{
		"pi-chat-model-popup",
		"pi-chat-model-search",
		"model-item",
		"model-scope-badge",
	}
	for _, check := range cssChecks {
		if !strings.Contains(liveSessionCss, check) {
			t.Fatalf("missing %q in template.css", check)
		}
	}
}

func TestThinkingLevelSelectorMarkupExists(t *testing.T) {
	jsChecks := []string{
		"pi-chat-thinking-popup",
		"pi-chat-thinking-list",
		"pi-chat-thinking-label",
		"/api/set-thinking-level?id=",
		"THINKING_LEVELS",
		"setupThinkingLevelSelector",
		"thinkingChanges",
		"knownThinkingLevel",
		"setThinkingLabel",
	}
	for _, check := range jsChecks {
		if !strings.Contains(exportJs, check) {
			t.Fatalf("missing %q in template.js", check)
		}
	}
	cssChecks := []string{
		"pi-chat-thinking-popup",
		"pi-chat-thinking-list",
		"thinking-level-item",
		"thinking-off",
		"thinking-minimal",
		"thinking-low",
		"thinking-medium",
		"thinking-high",
		"thinking-xhigh",
	}
	for _, check := range cssChecks {
		if !strings.Contains(liveSessionCss, check) {
			t.Fatalf("missing %q in template.css", check)
		}
	}
	htmlChecks := []string{
		"pi-chat-thinking-popup",
		"pi-chat-thinking-list",
		"pi-chat-thinking-label",
	}
	composerHtml := chatComposerHtml("test-session")
	for _, check := range htmlChecks {
		if !strings.Contains(composerHtml, check) {
			t.Fatalf("missing %q in chatComposerHtml", check)
		}
	}
}
