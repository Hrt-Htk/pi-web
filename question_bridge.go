package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
)

type questionAnswerRequest struct {
	ToolCallID string            `json:"toolCallId"`
	Answers    map[string]string `json:"answers"`
	Cancelled  bool              `json:"cancelled,omitempty"`
}

func questionBridgeDir() string {
	return filepath.Join(os.TempDir(), "pi-sessions-viewer-questions")
}

func questionBridgeKey(toolCallID string) string {
	// Keep this compatible with the TypeScript extension's Buffer.toString("base64url").
	return base64.RawURLEncoding.EncodeToString([]byte(toolCallID))
}

func questionBridgeResponsePath(dir, toolCallID string) (string, error) {
	if toolCallID == "" {
		return "", errors.New("missing toolCallId")
	}
	return filepath.Join(dir, questionBridgeKey(toolCallID)+".response.json"), nil
}

func writeQuestionBridgeResponse(dir string, req questionAnswerRequest) error {
	path, err := questionBridgeResponsePath(dir, req.ToolCallID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(req)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func (s *server) handleQuestionAnswer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req questionAnswerRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.Answers) == 0 && !req.Cancelled {
		writeJSONError(w, http.StatusBadRequest, "missing answers")
		return
	}
	if err := writeQuestionBridgeResponse(s.questionDir, req); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func questionBridgeDirSuffix(dir string) string {
	// Useful in tests/debugging without leaking arbitrary full paths into generated names.
	sum := sha256.Sum256([]byte(dir))
	return base64.RawURLEncoding.EncodeToString(sum[:])[:12]
}
