package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleSetModelRequiresProviderAndModelId(t *testing.T) {
	root := t.TempDir()
	writeSessionFile(t, root, "test-project", "session.jsonl")
	s := &server{
		sessionsDir: root,
		chatSender:  &fakeSender{},
	}
	req := httptest.NewRequest(http.MethodPost, "/api/set-model?id=session.jsonl", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleSetModel(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
	if !strings.Contains(w.Body.String(), "provider and modelId required") {
		t.Fatalf("body = %q", w.Body.String())
	}
}

func TestHandleSetModelRejectsMissingSession(t *testing.T) {
	s := &server{sessionsDir: t.TempDir(), chatSender: &fakeSender{}}
	req := httptest.NewRequest(http.MethodPost, "/api/set-model?id=missing.jsonl", strings.NewReader(`{"provider":"a","modelId":"b"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleSetModel(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestModelSelectorMarkupExists(t *testing.T) {
	checks := []string{
		"model-selector",
		"/api/models",
		"/api/set-model?id=",
		"loadModelSelector",
	}
	for _, check := range checks {
		if !strings.Contains(templateJs, check) {
			t.Fatalf("missing %q in template.js", check)
		}
	}
	if !strings.Contains(templateCss, "model-selector") {
		t.Fatal("missing .model-selector in template.css")
	}
}
