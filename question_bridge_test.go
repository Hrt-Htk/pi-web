package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestQuestionBridgeWritesResponseByToolCallID(t *testing.T) {
	dir := t.TempDir()
	req := questionAnswerRequest{ToolCallID: "call|abc", Answers: map[string]string{"Q?": "A"}}
	if err := writeQuestionBridgeResponse(dir, req); err != nil {
		t.Fatalf("writeQuestionBridgeResponse error: %v", err)
	}
	path, err := questionBridgeResponsePath(dir, req.ToolCallID)
	if err != nil {
		t.Fatalf("questionBridgeResponsePath error: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("response file missing: %v", err)
	}
	var got questionAnswerRequest
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("invalid response json: %v", err)
	}
	if got.Answers["Q?"] != "A" {
		t.Fatalf("answers = %#v", got.Answers)
	}
}

func TestEmbeddedWebQuestionExtensionOverridesTool(t *testing.T) {
	checks := []string{
		`name: "ask_user_question"`,
		"PI_WEB_QUESTION_DIR",
		"base64url",
		"cancelled: false",
	}
	for _, check := range checks {
		if !strings.Contains(webQuestionExtensionSource, check) {
			t.Fatalf("extension missing %q", check)
		}
	}
}
