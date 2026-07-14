package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pi-web/internal/ui"
)

const (
	TokenCookieName     = "pi_token"
	cookieMaxAgeSeconds = 3600
)

type Middleware struct {
	token string
	now   func() int64
}

func New(token string) *Middleware {
	return &Middleware{
		token: strings.TrimSpace(token),
		now:   func() int64 { return time.Now().Unix() },
	}
}

func (a *Middleware) Enabled() bool {
	return a.token != ""
}

// signAuthCookie returns a signed cookie value in the format "<issuedAtUnix>.<hexHMAC>".
func signAuthCookie(token string, issuedAt int64) string {
	ts := strconv.FormatInt(issuedAt, 10)
	mac := hmac.New(sha256.New, []byte(token))
	mac.Write([]byte(ts))
	return ts + "." + hex.EncodeToString(mac.Sum(nil))
}

// validAuthCookie checks whether a signed cookie value is authentic and not expired.
func validAuthCookie(token, value string, now int64) bool {
	parts := strings.SplitN(value, ".", 2)
	if len(parts) != 2 {
		return false
	}
	issuedAt, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(token))
	mac.Write([]byte(parts[0]))
	expectedHex := hex.EncodeToString(mac.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(parts[1]), []byte(expectedHex)) != 1 {
		return false
	}
	elapsed := now - issuedAt
	return elapsed >= 0 && elapsed <= cookieMaxAgeSeconds
}

// Wrap returns a handler that enforces the token check when auth is enabled.
//
// Token sources (checked in order): for browser POSTs, form body first;
// otherwise query parameter, Authorization header, X-Pi-Token header.
// The cookie is checked separately as a signed, timestamped value.
// When the token arrives via query or POST, a signed cookie is set and the
// browser is redirected to the same URL without the token, so the secret never
// appears in the address bar or browser history.
//
// When auth fails and the request appears to come from a browser (Accept
// header includes text/html), the middleware serves an HTML token prompt
// instead of a bare 401. API clients (no text/html in Accept) still receive
// a plain 401.
func (a *Middleware) Wrap(h http.HandlerFunc) http.HandlerFunc {
	if !a.Enabled() {
		return h
	}
	return func(w http.ResponseWriter, r *http.Request) {
		got := ""
		fromQuery := false
		fromPost := false

		// Browser login form submissions should prefer the submitted token over
		// any stale token that may still be present in the URL query string.
		if r.Method == http.MethodPost && strings.Contains(r.Header.Get("Accept"), "text/html") {
			// ParseForm is idempotent; safe to call even if already parsed.
			r.ParseForm()
			if t := r.PostFormValue("token"); t != "" {
				got = t
				fromPost = true
			}
		}

		if got == "" {
			got, fromQuery = ExtractToken(r)
		}

		authenticated := false

		// Check raw token sources (POST form, query, Authorization, X-Pi-Token).
		if subtle.ConstantTimeCompare([]byte(got), []byte(a.token)) == 1 {
			authenticated = true
		}

		// If not authenticated via raw token, try signed cookie.
		if !authenticated {
			if c, err := r.Cookie(TokenCookieName); err == nil {
				if validAuthCookie(a.token, c.Value, a.now()) {
					authenticated = true
				}
			}
		}

		if !authenticated {
			if strings.Contains(r.Header.Get("Accept"), "text/html") {
				// Invalid login attempt — redirect with error flag so
				// the prompt shows "Invalid token".
				if fromPost {
					target := cleanURL(r)
					if strings.Contains(target, "?") {
						target += "&error=1"
					} else {
						target += "?error=1"
					}
					http.Redirect(w, r, target, http.StatusFound)
					return
				}
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusUnauthorized)
				themeCookie := ""
				if c, err := r.Cookie("pi-web-theme"); err == nil {
					themeCookie = c.Value
				}
				ui.RenderAuthPrompt(w, themeCookie)
				return
			}
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Token is valid. Set a signed cookie if it came from query or POST so
		// subsequent requests authenticate automatically.
		if fromQuery || fromPost {
			http.SetCookie(w, &http.Cookie{
				Name:     TokenCookieName,
				Value:    signAuthCookie(a.token, a.now()),
				Path:     "/",
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
				MaxAge:   cookieMaxAgeSeconds,
			})
		}

		// Redirect to a clean URL (no token in query or error flag) when
		// the token arrived via query or POST. This keeps the secret out
		// of the address bar and browser history.
		if fromQuery || fromPost {
			http.Redirect(w, r, cleanURL(r), http.StatusFound)
			return
		}

		h(w, r)
	}
}

// cleanURL returns r.URL.Path with query string intact except for "token" and
// "error" parameters, which are stripped.
func cleanURL(r *http.Request) string {
	q := r.URL.Query()
	q.Del("token")
	q.Del("error")
	if len(q) == 0 {
		return r.URL.Path
	}
	return r.URL.Path + "?" + q.Encode()
}

// ExtractToken returns the candidate token and whether it came from the query
// string (in which case a cookie should be set). Only checks query,
// Authorization header, and X-Pi-Token header — not the cookie.
func ExtractToken(r *http.Request) (string, bool) {
	if t := r.URL.Query().Get("token"); t != "" {
		return t, true
	}
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer "), false
	}
	if h := r.Header.Get("X-Pi-Token"); h != "" {
		return h, false
	}
	return "", false
}
