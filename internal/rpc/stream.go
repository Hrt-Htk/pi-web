package rpc

type StreamPreview struct {
	Content  string `json:"content"`
	Thinking string `json:"thinking"`
	Done     bool   `json:"done"`
}

type StreamEventSink func(StreamPreview)

type assistantMessageEvent struct {
	Type    string `json:"type"`
	Delta   string `json:"delta"`
	Content string `json:"content"`
}

type streamPreviewAccumulator struct {
	content  string
	thinking string
	active   bool
}

func (a *streamPreviewAccumulator) empty() bool {
	return a.content == "" && a.thinking == "" && !a.active
}

// snapshot exposes thinking and answer text as SEPARATE fields (never merged).
func (a *streamPreviewAccumulator) snapshot(done bool) StreamPreview {
	return StreamPreview{Content: a.content, Thinking: a.thinking, Done: done}
}

func (a *streamPreviewAccumulator) reset() {
	a.content = ""
	a.thinking = ""
	a.active = false
}

func (a *streamPreviewAccumulator) handleAssistantEvent(event assistantMessageEvent) (StreamPreview, bool) {
	switch event.Type {
	case "thinking_delta":
		a.thinking += event.Delta
		a.active = true
		return a.snapshot(false), true
	case "thinking_end":
		if event.Content != "" {
			a.thinking = event.Content
		}
		if a.empty() {
			return StreamPreview{}, false
		}
		a.active = true
		return a.snapshot(false), true
	case "text_delta":
		a.content += event.Delta
		a.active = true
		return a.snapshot(false), true
	case "text_end":
		if event.Content != "" {
			a.content = event.Content
		}
		if a.empty() {
			return StreamPreview{}, false
		}
		preview := a.snapshot(true)
		a.reset()
		return preview, true
	default:
		return StreamPreview{}, false
	}
}

func (a *streamPreviewAccumulator) complete() (StreamPreview, bool) {
	if a.empty() {
		return StreamPreview{}, false
	}
	preview := a.snapshot(true)
	a.reset()
	return preview, true
}
