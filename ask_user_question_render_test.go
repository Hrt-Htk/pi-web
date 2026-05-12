package main

import (
	"strings"
	"testing"
)

func TestAskUserQuestionToolHasDedicatedRenderer(t *testing.T) {
	checks := []string{
		"case 'ask_user_question':",
		"renderAskUserQuestionTool(args, result)",
		"ask-question-card",
		"ask-question-option",
	}
	for _, check := range checks {
		if !strings.Contains(exportJs+liveSessionCss, check) {
			t.Fatalf("missing %q; ask_user_question should not render as raw JSON", check)
		}
	}
}

func TestPendingAskUserQuestionOptionsSendImmediately(t *testing.T) {
	checks := []string{
		"ask-question-option-action",
		"data-question=",
		"data-answer=",
		"sendChatMessage(message)",
		"document.addEventListener('click', async (event) =>",
	}
	for _, check := range checks {
		if !strings.Contains(exportJs, check) {
			t.Fatalf("missing %q; pending question options should be clickable and send immediately", check)
		}
	}
}

func TestErroredAskUserQuestionKeepsFallbackOptionsClickable(t *testing.T) {
	checks := []string{
		"const questionToolFailed = result?.isError === true;",
		"question UI failed",
		"const canClick = !result || questionToolFailed;",
		"Use these options as a fallback",
	}
	for _, check := range checks {
		if !strings.Contains(exportJs, check) {
			t.Fatalf("missing %q; errored multi-question cards should remain answerable", check)
		}
	}
}
