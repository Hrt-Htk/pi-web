package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func okHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func TestAuthDisabledPassesThrough(t *testing.T) {
	a := newAuth("")
	if a.enabled() {
		t.Fatal("expected enabled()=false when token empty")
	}
	rec := httptest.NewRecorder()
	a.wrap(okHandler)(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestAuthRejectsMissingToken(t *testing.T) {
	a := newAuth("secret")
	rec := httptest.NewRecorder()
	a.wrap(okHandler)(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestAuthRejectsWrongToken(t *testing.T) {
	a := newAuth("secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/?token=nope", nil)
	a.wrap(okHandler)(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestAuthAcceptsQueryAndSetsCookie(t *testing.T) {
	a := newAuth("secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/?token=secret", nil)
	a.wrap(okHandler)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	cookies := rec.Result().Cookies()
	var found *http.Cookie
	for _, c := range cookies {
		if c.Name == tokenCookieName {
			found = c
			break
		}
	}
	if found == nil {
		t.Fatalf("expected %s cookie to be set", tokenCookieName)
	}
	if found.Value != "secret" {
		t.Fatalf("cookie value = %q", found.Value)
	}
	if !found.HttpOnly {
		t.Fatal("expected HttpOnly cookie")
	}
}

func TestAuthAcceptsCookie(t *testing.T) {
	a := newAuth("secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: tokenCookieName, Value: "secret"})
	a.wrap(okHandler)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	// Cookie was already present; we should not re-set it.
	for _, c := range rec.Result().Cookies() {
		if c.Name == tokenCookieName {
			t.Fatal("did not expect cookie to be re-set when request already had it")
		}
	}
}

func TestAuthAcceptsBearerHeader(t *testing.T) {
	a := newAuth("secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer secret")
	a.wrap(okHandler)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestAuthAcceptsXPiTokenHeader(t *testing.T) {
	a := newAuth("secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Pi-Token", "secret")
	a.wrap(okHandler)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestAuthEmptyTokenSubmittedWhenAuthEnabled(t *testing.T) {
	// Empty submitted value must not match an empty stored value
	// (which can't happen since enabled() requires non-empty, but check
	// constant-time compare doesn't accept "").
	a := newAuth("secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/?token=", nil)
	a.wrap(okHandler)(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}
