package chat

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"
)

type testUpload struct{ name, body string }

func multipartRequest(t *testing.T, message string, files map[string]testUpload) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if message != "" {
		if err := mw.WriteField("message", message); err != nil {
			t.Fatal(err)
		}
	}
	for field, file := range files {
		part, err := mw.CreateFormFile(field, file.name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = part.Write([]byte(file.body))
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, "/api/chat?id=session.jsonl", &buf)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return req
}

func TestParseChatRequestAcceptsTextOnly(t *testing.T) {
	chat, err := ParseRequest(multipartRequest(t, "hello", nil), 1024, 4096)
	if err != nil {
		t.Fatalf("ParseRequest error: %v", err)
	}
	if chat.Message != "hello" || len(chat.Images) != 0 {
		t.Fatalf("chat = %#v", chat)
	}
}

func TestParseChatRequestAcceptsImage(t *testing.T) {
	chat, err := ParseRequest(multipartRequest(t, "describe", map[string]testUpload{"images": {"a.png", "\x89PNG\r\n\x1a\nimage"}}), 1024, 4096)
	if err != nil {
		t.Fatalf("ParseRequest error: %v", err)
	}
	if len(chat.Images) != 1 || chat.Images[0].MimeType != "image/png" {
		t.Fatalf("images = %#v", chat.Images)
	}
}

func TestParseChatRequestRejectsEmpty(t *testing.T) {
	_, err := ParseRequest(multipartRequest(t, "", nil), 1024, 4096)
	if err != ErrEmptyRequest {
		t.Fatalf("err = %v, want ErrEmptyRequest", err)
	}
}

func TestParseChatRequestAcceptsNonImageFile(t *testing.T) {
	chat, err := ParseRequest(multipartRequest(t, "see file", map[string]testUpload{"images": {"a.txt", "plain text"}}), 1024, 4096)
	if err != nil {
		t.Fatalf("ParseRequest error: %v", err)
	}
	if len(chat.Files) != 1 {
		t.Fatalf("Files = %d, want 1", len(chat.Files))
	}
	if chat.Files[0].Name != "a.txt" {
		t.Fatalf("Files[0].Name = %q, want a.txt", chat.Files[0].Name)
	}
	if len(chat.Images) != 0 {
		t.Fatalf("Images = %d, want 0 (non-image should not be in Images)", len(chat.Images))
	}
}

func TestParseChatRequestBmpNotInImages(t *testing.T) {
	// BMP bytes: magic number 0x42 0x4D
	bmpData := "\x42\x4D" + strings.Repeat("x", 100)
	chat, err := ParseRequest(multipartRequest(t, "bmp", map[string]testUpload{"images": {"pic.bmp", bmpData}}), 1024, 4096)
	if err != nil {
		t.Fatalf("ParseRequest error: %v", err)
	}
	// BMP is detected as image/bmp by DetectContentType, but it's not in the
	// inline whitelist, so it should be in Files but NOT in Images.
	if len(chat.Files) != 1 {
		t.Fatalf("Files = %d, want 1", len(chat.Files))
	}
	if len(chat.Images) != 0 {
		t.Fatalf("Images = %d, want 0 (bmp not in inline whitelist)", len(chat.Images))
	}
}

func TestParseChatRequestPngInBothImagesAndFiles(t *testing.T) {
	chat, err := ParseRequest(multipartRequest(t, "png", map[string]testUpload{"images": {"pic.png", "\x89PNG\r\n\x1a\nimage data"}}), 1024, 4096)
	if err != nil {
		t.Fatalf("ParseRequest error: %v", err)
	}
	if len(chat.Images) != 1 {
		t.Fatalf("Images = %d, want 1", len(chat.Images))
	}
	if len(chat.Files) != 1 {
		t.Fatalf("Files = %d, want 1", len(chat.Files))
	}
}

func TestParseChatRequestFilesOnlyNoMessage(t *testing.T) {
	// A request with files but empty typed message is valid
	chat, err := ParseRequest(multipartRequest(t, "", map[string]testUpload{"images": {"a.txt", "content"}}), 1024, 4096)
	if err != nil {
		t.Fatalf("ParseRequest error: %v", err)
	}
	if len(chat.Files) != 1 {
		t.Fatalf("Files = %d, want 1", len(chat.Files))
	}
}

func TestParseChatRequestRejectsOversizedImage(t *testing.T) {
	_, err := ParseRequest(multipartRequest(t, "big", map[string]testUpload{"images": {"a.png", "\x89PNG\r\n\x1a\n" + strings.Repeat("x", 20)}}), 8, 4096)
	if err != ErrImageTooLarge {
		t.Fatalf("err = %v, want ErrImageTooLarge", err)
	}
}
