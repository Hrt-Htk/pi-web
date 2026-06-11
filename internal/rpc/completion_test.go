package rpc

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOneShotCompletion(t1 *testing.T) {
	t1.Run("happy_path", func(t1 *testing.T) {
		dir := t1.TempDir()

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				t1.Fatalf("expected POST, got %s", r.Method)
			}
			if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
				t1.Fatalf("unexpected path: %s", r.URL.Path)
			}
			if auth := r.Header.Get("Authorization"); auth != "Bearer test-key" {
				t1.Fatalf("expected Bearer test-key, got %q", auth)
			}

			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t1.Fatalf("decode body: %v", err)
			}
			if body["model"] != "qwen3.6-27b" {
				t1.Fatalf("expected model qwen3.6-27b, got %v", body["model"])
			}
			msgs := body["messages"].([]any)
			if len(msgs) != 2 {
				t1.Fatalf("expected 2 messages, got %d", len(msgs))
			}
			sys := msgs[0].(map[string]any)
			if sys["role"] != "system" {
				t1.Fatalf("first message role: %v", sys["role"])
			}
			user := msgs[1].(map[string]any)
			if user["role"] != "user" {
				t1.Fatalf("second message role: %v", user["role"])
			}
			kwargs := body["chat_template_kwargs"].(map[string]any)
			if kwargs["enable_thinking"] != false {
				t1.Fatalf("expected enable_thinking=false, got %v", kwargs["enable_thinking"])
			}

			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"Fix Login Bug"}}]}`))
		}))
		defer srv.Close()

		writeModelsJSON(t1, dir, map[string]providerConfig{
			"llama-server": {
				BaseUrl:    srv.URL,
				ApiKey:     "test-key",
				AuthHeader: true,
				Compat:     compatConfig{ThinkingFormat: "qwen-chat-template"},
			},
		})

		got, err := OneShotCompletion(context.Background(), dir, PromptOpts{
			Message:      "fix login",
			Model:        "llama-server/qwen3.6-27b",
			SystemPrompt: "be brief",
		})
		if err != nil {
			t1.Fatalf("unexpected error: %v", err)
		}
		if got != "Fix Login Bug" {
			t1.Fatalf("expected Fix Login Bug, got %q", got)
		}
	})

	t1.Run("provider_not_found", func(t1 *testing.T) {
		dir := t1.TempDir()
		writeModelsJSON(t1, dir, map[string]providerConfig{
			"other": {BaseUrl: "https://example.com"},
		})

		_, err := OneShotCompletion(context.Background(), dir, PromptOpts{
			Model: "missing/model",
		})
		if err == nil {
			t1.Fatal("expected error for missing provider")
		}
	})

	t1.Run("no_thinking_format_omits_kwargs", func(t1 *testing.T) {
		dir := t1.TempDir()

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t1.Fatalf("decode body: %v", err)
			}
			if _, has := body["chat_template_kwargs"]; has {
				t1.Fatal("expected no chat_template_kwargs when thinkingFormat is not qwen-chat-template")
			}

			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"Title"}}]}`))
		}))
		defer srv.Close()

		writeModelsJSON(t1, dir, map[string]providerConfig{
			"llama-server": {
				BaseUrl: srv.URL,
				Compat:  compatConfig{ThinkingFormat: "other-format"},
			},
		})

		got, err := OneShotCompletion(context.Background(), dir, PromptOpts{
			Model: "llama-server/model",
		})
		if err != nil {
			t1.Fatalf("unexpected error: %v", err)
		}
		if got != "Title" {
			t1.Fatalf("expected Title, got %q", got)
		}
	})

	t1.Run("empty_content_returns_error", func(t1 *testing.T) {
		dir := t1.TempDir()

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"  "}}]}`))
		}))
		defer srv.Close()

		writeModelsJSON(t1, dir, map[string]providerConfig{
			"llama-server": {BaseUrl: srv.URL},
		})

		_, err := OneShotCompletion(context.Background(), dir, PromptOpts{
			Model: "llama-server/model",
		})
		if err == nil {
			t1.Fatal("expected error for empty content")
		}
	})
}

func writeModelsJSON(t *testing.T, dir string, providers map[string]providerConfig) {
	t.Helper()
	file := modelsFile{Providers: providers}
	data, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("marshal models.json: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "models.json"), data, 0644); err != nil {
		t.Fatalf("write models.json: %v", err)
	}
}
