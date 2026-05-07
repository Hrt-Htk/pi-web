package main

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

const tokenCookieName = "pi_token"

type authMiddleware struct {
	token string
}

func newAuth(token string) *authMiddleware {
	return &authMiddleware{token: strings.TrimSpace(token)}
}

func (a *authMiddleware) enabled() bool {
	return a.token != ""
}

// wrap returns a handler that enforces the token check when auth is enabled.
// When the token is supplied via the `token` query parameter, a cookie is set
// so subsequent requests from the same browser succeed without the parameter.
func (a *authMiddleware) wrap(h http.HandlerFunc) http.HandlerFunc {
	if !a.enabled() {
		return h
	}
	return func(w http.ResponseWriter, r *http.Request) {
		got, fromQuery := extractToken(r)
		if subtle.ConstantTimeCompare([]byte(got), []byte(a.token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if fromQuery {
			http.SetCookie(w, &http.Cookie{
				Name:     tokenCookieName,
				Value:    got,
				Path:     "/",
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
			})
		}
		h(w, r)
	}
}

// extractToken returns the candidate token and whether it came from the query
// string (in which case a cookie should be set).
func extractToken(r *http.Request) (string, bool) {
	if t := r.URL.Query().Get("token"); t != "" {
		return t, true
	}
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer "), false
	}
	if h := r.Header.Get("X-Pi-Token"); h != "" {
		return h, false
	}
	if c, err := r.Cookie(tokenCookieName); err == nil {
		return c.Value, false
	}
	return "", false
}
