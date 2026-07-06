package chat

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

// UploadedFile is a file uploaded through the chat multipart form.
type UploadedFile struct {
	Name     string
	MimeType string
	Data     []byte
}

// SavedUpload describes a file that has been written to disk.
type SavedUpload struct {
	Path     string
	MimeType string
	Size     int64
}

// SanitizeFilename produces a safe filename from an arbitrary user-supplied
// name. It strips directory components, path separators, Windows reserved
// device names, illegal characters, and trailing whitespace/dots.
func SanitizeFilename(name string) string {
	// Strip directory components (platform-independent — filepath.Base doesn't
	// treat \ as a separator on Linux)
	if idx := strings.LastIndexAny(name, `/\`); idx >= 0 {
		name = name[idx+1:]
	}

	// Remove ".." from the filename as a safety measure
	name = strings.ReplaceAll(name, "..", "")

	// Remove control characters and Windows-illegal characters
	var b strings.Builder
	for _, r := range name {
		if r == '<' || r == '>' || r == ':' || r == '"' || r == '|' || r == '?' || r == '*' || r == '/' || r == '\\' || unicode.IsControl(r) {
			continue
		}
		b.WriteRune(r)
	}
	name = b.String()

	// Neutralize Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
	baseNoExt := name
	if idx := strings.LastIndex(name, "."); idx > 0 {
		baseNoExt = name[:idx]
	}
	upperBase := strings.ToUpper(baseNoExt)
	if isReservedName(upperBase) {
		name = "_" + name
	}

	// Trim trailing dots and spaces (Windows disallows them)
	name = strings.TrimRight(name, " .")

	// Fallback
	if name == "" {
		name = "file"
	}

	return name
}

func isReservedName(s string) bool {
	switch s {
	case "CON", "PRN", "AUX", "NUL":
		return true
	}
	if len(s) == 4 && s[:3] == "COM" {
		if c := s[3]; c >= '1' && c <= '9' {
			return true
		}
	}
	if len(s) == 4 && s[:3] == "LPT" {
		if c := s[3]; c >= '1' && c <= '9' {
			return true
		}
	}
	return false
}

// SaveUploads writes each uploaded file to disk under the given directory.
// On name collision it uses a unix-millis prefix; if that also collides it
// appends -1, -2, etc. Returns absolute paths.
func SaveUploads(dir string, files []UploadedFile) ([]SavedUpload, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	absDir, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}

	var result []SavedUpload
	for _, f := range files {
		sanitized := SanitizeFilename(f.Name)
		target := filepath.Join(absDir, sanitized)
		if _, err := os.Stat(target); err == nil {
			// Collision — use timestamp prefix
			ts := fmt.Sprintf("%d", time.Now().UnixMilli())
			target = filepath.Join(absDir, ts+"-"+sanitized)
			suffix := 0
			for {
				if _, err := os.Stat(target); err != nil {
					break
				}
				suffix++
				target = filepath.Join(absDir, fmt.Sprintf("%d-%s-%d", time.Now().UnixMilli(), sanitized, suffix))
			}
		}
		if err := os.WriteFile(target, f.Data, 0644); err != nil {
			return nil, err
		}
		result = append(result, SavedUpload{
			Path:     target,
			MimeType: f.MimeType,
			Size:     int64(len(f.Data)),
		})
	}
	return result, nil
}

// AttachmentLine formats a saved upload as a reference line for the message text.
func AttachmentLine(s SavedUpload) string {
	return fmt.Sprintf("[Attached file: %s (%s, %d bytes)]", s.Path, s.MimeType, s.Size)
}
