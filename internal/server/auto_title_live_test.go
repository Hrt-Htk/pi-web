package server

import (
	"os"
	"strings"
	"testing"
)

// TestMaybeAutoTitleLiveModel exercises the real end-to-end auto-title path
// against the live title model configured in ~/.pi/agent/models.json: it writes
// a fresh session, runs maybeAutoTitle (the exact function the file watcher
// invokes), and asserts the resulting title came from the model rather than the
// keyword heuristic.
//
// It is skipped unless PIWEB_LIVE_TITLE=1 because it makes a real network call.
// Run it with:
//
//	PIWEB_LIVE_TITLE=1 go test ./internal/server/ -run TestMaybeAutoTitleLiveModel -v
func TestMaybeAutoTitleLiveModel(t *testing.T) {
	if os.Getenv("PIWEB_LIVE_TITLE") != "1" {
		t.Skip("set PIWEB_LIVE_TITLE=1 to run the live title-model integration test")
	}

	model := os.Getenv("PIWEB_LIVE_TITLE_MODEL")
	if model == "" {
		model = "llama-server/qwen3.6-27b-q4-mtp-128k"
	}

	s := newAutoTitleServer(t, map[string]string{
		"pi-web:v1:auto-title:mode":  "once",
		"pi-web:v1:auto-title:model": model,
	})

	// A message whose heuristic title (first 5 non-stop-words, Title Cased) is
	// easy to compute, so we can prove the model produced something different.
	userText := "the database connection pool keeps getting exhausted whenever many requests arrive at once"
	id := writeAutoTitleSession(t, s.sessionsDir, userText, "")

	heuristic := deriveTitleFromInput(userText)

	s.maybeAutoTitle(id)

	got := sessionNameNow(t, s, id)
	t.Logf("model      = %q", model)
	t.Logf("input      = %q", userText)
	t.Logf("heuristic  = %q", heuristic)
	t.Logf("auto-title = %q", got)

	if strings.TrimSpace(got) == "" {
		t.Fatal("no auto-title was written")
	}
	if strings.HasPrefix(userText, got) || strings.HasPrefix(got, userText) {
		t.Fatalf("session was never titled (still the raw first message): %q", got)
	}
	if got == heuristic {
		t.Fatalf("title matched the keyword heuristic %q — the model call did not fire", heuristic)
	}
}
