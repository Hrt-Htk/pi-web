package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// providerConfig mirrors the shape of a single provider entry in models.json.
type providerConfig struct {
	BaseUrl    string       `json:"baseUrl"`
	Api        string       `json:"api"`
	ApiKey     string       `json:"apiKey"`
	AuthHeader bool         `json:"authHeader"`
	Compat     compatConfig `json:"compat"`
}

type compatConfig struct {
	ThinkingFormat string `json:"thinkingFormat"`
}

// modelsFile mirrors the top-level shape of models.json.
type modelsFile struct {
	Providers map[string]providerConfig `json:"providers"`
}

// authEntry mirrors a single entry in auth.json.
type authEntry struct {
	Type string `json:"type"`
	Key  string `json:"key"`
}

// OneShotCompletion sends a single, non-streaming chat completion request
// directly to the provider's OpenAI-compatible /chat/completions endpoint.
// It reads the provider configuration from <agentDir>/models.json and,
// optionally, the API key from <agentDir>/auth.json.
func OneShotCompletion(ctx context.Context, agentDir string, opts PromptOpts) (string, error) {
	provider, modelID, err := splitModelSpec(opts.Model)
	if err != nil {
		return "", err
	}

	cfg, err := loadProvider(agentDir, provider)
	if err != nil {
		return "", err
	}

	apiKey := cfg.ApiKey
	if apiKey == "" {
		apiKey, _ = resolveApiKey(agentDir, provider)
	}

	disableThinking := cfg.Compat.ThinkingFormat == "qwen-chat-template"

	endpoint := strings.TrimRight(cfg.BaseUrl, "/") + "/chat/completions"

	body, err := buildRequestBody(modelID, opts, disableThinking)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("completion request failed: %s — %s", resp.Status, snippet)
	}

	var result completionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode completion response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("completion response had no choices")
	}

	content := strings.TrimSpace(result.Choices[0].Message.Content)
	if content == "" {
		return "", fmt.Errorf("empty completion")
	}
	return content, nil
}

func splitModelSpec(model string) (provider, modelID string, err error) {
	idx := strings.Index(model, "/")
	if idx < 0 {
		return "", "", fmt.Errorf("model spec must be provider/id, got %q", model)
	}
	provider = strings.TrimSpace(model[:idx])
	if eq := strings.Index(provider, "="); eq >= 0 {
		provider = provider[:eq]
	}
	return provider, strings.TrimSpace(model[idx+1:]), nil
}

func loadProvider(agentDir, provider string) (providerConfig, error) {
	data, err := os.ReadFile(filepath.Join(agentDir, "models.json"))
	if err != nil {
		return providerConfig{}, fmt.Errorf("read models.json: %w", err)
	}

	var file modelsFile
	if err := json.Unmarshal(data, &file); err != nil {
		return providerConfig{}, fmt.Errorf("parse models.json: %w", err)
	}

	cfg, ok := file.Providers[provider]
	if !ok {
		return providerConfig{}, fmt.Errorf("provider %q not found in models.json", provider)
	}
	return cfg, nil
}

func resolveApiKey(agentDir, provider string) (string, error) {
	data, err := os.ReadFile(filepath.Join(agentDir, "auth.json"))
	if err != nil {
		return "", err
	}

	var entries map[string]authEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return "", err
	}

	// Exact match first, then prefix match.
	if e, ok := entries[provider]; ok {
		return e.Key, nil
	}
	prefix := provider + "="
	for k, e := range entries {
		if strings.HasPrefix(k, prefix) {
			return e.Key, nil
		}
	}
	return "", nil
}

func buildRequestBody(modelID string, opts PromptOpts, disableThinking bool) (*strings.Reader, error) {
	messages := make([]map[string]string, 0, 2)
	if strings.TrimSpace(opts.SystemPrompt) != "" {
		messages = append(messages, map[string]string{
			"role":    "system",
			"content": opts.SystemPrompt,
		})
	}
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": opts.Message,
	})

	payload := map[string]any{
		"model":      modelID,
		"messages":   messages,
		"stream":     false,
		"max_tokens": 64,
	}
	if disableThinking {
		payload["chat_template_kwargs"] = map[string]bool{
			"enable_thinking": false,
		}
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return strings.NewReader(string(data)), nil
}

type completionResponse struct {
	Choices []choiceItem `json:"choices"`
}

type choiceItem struct {
	Message messageItem `json:"message"`
}

type messageItem struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}
