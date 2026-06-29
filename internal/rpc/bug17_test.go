package rpc

import "testing"

func TestStreamPreviewAccumulatorThinkingDeltaSeparateFromContent(t *testing.T) {
	acc := &streamPreviewAccumulator{}

	preview, ok := acc.handleAssistantEvent(assistantMessageEvent{Type: "thinking_delta", Delta: "reasoning A"})
	if !ok {
		t.Fatalf("thinking_delta did not emit preview")
	}
	if preview.Thinking != "reasoning A" {
		t.Fatalf("preview.Thinking = %q, want \"reasoning A\"", preview.Thinking)
	}
	if preview.Content != "" {
		t.Fatalf("preview.Content = %q, want \"\"", preview.Content)
	}

	preview2, ok := acc.handleAssistantEvent(assistantMessageEvent{Type: "text_delta", Delta: "answer B"})
	if !ok {
		t.Fatalf("text_delta did not emit preview")
	}
	if preview2.Thinking != "reasoning A" {
		t.Fatalf("preview2.Thinking = %q, want \"reasoning A\"", preview2.Thinking)
	}
	if preview2.Content != "answer B" {
		t.Fatalf("preview2.Content = %q, want \"answer B\"", preview2.Content)
	}
}

func TestStreamPreviewAccumulatorThinkingThenTextEnd(t *testing.T) {
	acc := &streamPreviewAccumulator{}

	_, _ = acc.handleAssistantEvent(assistantMessageEvent{Type: "thinking_delta", Delta: "r"})

	preview, ok := acc.handleAssistantEvent(assistantMessageEvent{Type: "text_end", Content: "final"})
	if !ok {
		t.Fatalf("text_end did not emit preview")
	}
	if !preview.Done {
		t.Fatalf("preview.Done = false, want true")
	}
	if preview.Thinking != "r" {
		t.Fatalf("preview.Thinking = %q, want \"r\"", preview.Thinking)
	}
	if preview.Content != "final" {
		t.Fatalf("preview.Content = %q, want \"final\"", preview.Content)
	}
}

func TestStreamPreviewAccumulatorBareThinkingEndIgnored(t *testing.T) {
	acc := &streamPreviewAccumulator{}

	preview, ok := acc.handleAssistantEvent(assistantMessageEvent{Type: "thinking_end"})
	if ok {
		t.Fatalf("bare thinking_end emitted preview: %+v", preview)
	}
}
