package sessions

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Session struct {
	ID                 string
	Filename           string
	Project            string
	LastActivity       string
	MessageCount       int
	TokenTotal         int
	CostTotal          float64
	Header             map[string]any
	Entries            []map[string]any
	ChatAvailable      bool
	ChatDisabledReason string
}

func LoadAll(dir string) ([]Session, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var sessions []Session
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		subDir := filepath.Join(dir, e.Name())
		subs, err := os.ReadDir(subDir)
		if err != nil {
			continue
		}
		for _, f := range subs {
			if f.IsDir() || !strings.HasSuffix(f.Name(), ".jsonl") {
				continue
			}
			path := filepath.Join(subDir, f.Name())
			sess, err := ParseFile(path, e.Name(), f.Name())
			if err != nil {
				continue
			}
			sessions = append(sessions, sess)
		}
	}

	SortByActivity(sessions)
	return sessions, nil
}

func SortByActivity(sessions []Session) {
	sort.Slice(sessions, func(i, j int) bool {
		ti, _ := time.Parse(time.RFC3339, sessions[i].LastActivity)
		tj, _ := time.Parse(time.RFC3339, sessions[j].LastActivity)
		return ti.After(tj)
	})
}

func ParseFile(path, dirName, fileName string) (Session, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Session{}, err
	}

	sess := Session{
		ID:            fileName,
		Filename:      fileName,
		Project:       cleanProjectName(dirName),
		ChatAvailable: true,
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var raw map[string]any
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}

		sess.Entries = append(sess.Entries, raw)

		if raw["type"] == "session" {
			sess.Header = raw
			continue
		}

		if ts, ok := raw["timestamp"].(string); ok {
			sess.LastActivity = ts
		}

		if raw["type"] == "message" {
			msg, ok := raw["message"].(map[string]any)
			if ok {
				sess.MessageCount++
				if usage, ok := msg["usage"].(map[string]any); ok {
					if t, ok := usage["totalTokens"].(float64); ok {
						sess.TokenTotal += int(t)
					}
					if cost, ok := usage["cost"].(map[string]any); ok {
						if total, ok := cost["total"].(float64); ok {
							sess.CostTotal += total
						}
					}
				}
			}
		}
	}

	if sess.LastActivity == "" {
		info, _ := os.Stat(path)
		if info != nil {
			sess.LastActivity = info.ModTime().Format(time.RFC3339)
		}
	}

	if cwd, _ := sess.Header["cwd"].(string); cwd != "" {
		if _, err := os.Stat(cwd); err != nil {
			sess.ChatAvailable = false
			sess.ChatDisabledReason = "This session can be viewed, but chat is disabled because its working directory no longer exists."
		}
	}

	return sess, nil
}

func cleanProjectName(dirName string) string {
	s := strings.TrimPrefix(dirName, "--")
	s = strings.TrimSuffix(s, "--")
	s = strings.ReplaceAll(s, "--", "/")
	return s
}

func EncodeProjectName(path string) string {
	s := strings.TrimSpace(path)
	s = strings.Trim(s, "/")
	s = strings.ReplaceAll(s, "/", "-")
	return "--" + s + "--"
}

func DecodeProjectName(dirName string) string {
	s := strings.TrimPrefix(dirName, "--")
	s = strings.TrimSuffix(s, "--")
	s = strings.ReplaceAll(s, "-", "/")
	if s != "" && !strings.HasPrefix(s, "/") {
		s = "/" + s
	}
	return s
}

func ListRecentLocations(sessionsDir string) ([]string, error) {
	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		return nil, err
	}
	var locations []string
	seen := make(map[string]bool)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		loc := DecodeProjectName(e.Name())
		if loc != "" && !seen[loc] {
			seen[loc] = true
			locations = append(locations, loc)
		}
	}
	return locations, nil
}

func CreateSessionFile(sessionsDir, path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("path is required")
	}
	if strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		path = filepath.Join(home, path[2:])
	}
	path = filepath.Clean(path)
	if !filepath.IsAbs(path) {
		return "", errors.New("path must be absolute")
	}
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := os.MkdirAll(path, 0755); err != nil {
			return "", err
		}
	}

	projectDir := filepath.Join(sessionsDir, EncodeProjectName(path))
	rel, err := filepath.Rel(sessionsDir, projectDir)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid path")
	}
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return "", err
	}

	id := randomUUID()
	timestamp := time.Now().UTC().Format("2006-01-02T15-04-05.000Z")
	filename := timestamp + "_" + id + ".jsonl"
	filePath := filepath.Join(projectDir, filename)

	header := map[string]any{
		"type":      "session",
		"version":   3,
		"id":        id,
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"cwd":       path,
	}
	data, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filePath, append(data, '\n'), 0644); err != nil {
		return "", err
	}
	return filename, nil
}

func randomUUID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
