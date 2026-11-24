package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Ulzuhan/qr-forge/internal/auth"
	"github.com/Ulzuhan/qr-forge/internal/store"
)

func setupTestServer(t *testing.T, oidc *auth.Config) (*Server, *store.Store, string) {
	t.Helper()
	almacen, err := store.Open(t.TempDir() + "/q.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = almacen.Close() })

	ctx := context.Background()
	u, err := almacen.UpsertUser(ctx, "sub-test", "tester@example.invalid", nil)
	if err != nil {
		t.Fatal(err)
	}
	token, err := almacen.CrearSesion(ctx, u.ID, time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	srv, err := New(almacen, oidc, "https://qr.example.invalid", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return srv, almacen, token
}

func TestSSOAndSessionURL(t *testing.T) {
	t.Setenv("QRFORGE_ACCOUNT_SESSION_URL", "https://account.example.invalid/api/session")
	oidc := &auth.Config{
		Issuer:         "https://idp.example.invalid",
		PublicOrigin:   "https://idp.example.invalid",
		InternalOrigin: "https://idp.example.invalid",
		ClientID:       "cid",
		ClientSecret:   "csec",
		RedirectURI:    "https://qr.example.invalid/api/auth/callback",
		Timeout:        5 * time.Second,
	}
	srv, _, token := setupTestServer(t, oidc)
	h := srv.Handler()

	// Unauthenticated /?sso=1 redirects to /api/auth/login.
	req := httptest.NewRequest(http.MethodGet, "/?sso=1", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != "/api/auth/login" {
		t.Fatalf("/?sso=1 anon: code=%d loc=%q", rec.Code, rec.Header().Get("Location"))
	}

	// Authenticated /?sso=1 short-circuits to /.
	req = httptest.NewRequest(http.MethodGet, "/?sso=1", nil)
	req.AddCookie(&http.Cookie{Name: cookieSesion, Value: token})
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != "/" {
		t.Fatalf("/?sso=1 authed: code=%d loc=%q", rec.Code, rec.Header().Get("Location"))
	}

	// Authenticated /api/auth/login short-circuits cleanly preserving safe next.
	req = httptest.NewRequest(http.MethodGet, "/api/auth/login?next=/new", nil)
	req.AddCookie(&http.Cookie{Name: cookieSesion, Value: token})
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != "/new" {
		t.Fatalf("/api/auth/login authed: code=%d loc=%q", rec.Code, rec.Header().Get("Location"))
	}

	// Unauthenticated landing injects data-session-url and connect-src origin.
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /: code=%d", rec.Code)
	}
	cspHeader := rec.Header().Get("Content-Security-Policy")
	if !strings.Contains(cspHeader, "connect-src 'self' https://account.example.invalid") {
		t.Fatalf("CSP missing session origin: %s", cspHeader)
	}
	if !strings.Contains(rec.Body.String(), `data-session-url="https://account.example.invalid/api/session"`) {
		t.Fatalf("HTML missing data-session-url: %s", rec.Body.String())
	}

	// Invalid http:// session URL is ignored even with OIDC.
	t.Setenv("QRFORGE_ACCOUNT_SESSION_URL", "http://account.example.invalid/api/session")
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if strings.Contains(rec.Body.String(), "data-session-url") {
		t.Fatalf("http session URL should be ignored")
	}
}

func TestLogoutSignedOutFallback(t *testing.T) {
	srv, _, token := setupTestServer(t, nil)
	h := srv.Handler()

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.Host = "qr.example.invalid"
	req.AddCookie(&http.Cookie{Name: cookieSesion, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("logout code=%d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["next"] != "/?signed_out=1" {
		t.Fatalf("expected next=/?signed_out=1, got %v", body["next"])
	}
}

func TestErrorsAndAPI404(t *testing.T) {
	srv, _, _ := setupTestServer(t, nil)
	h := srv.Handler()

	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
		req := httptest.NewRequest(method, "/api/__nonexistent__", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s /api/__nonexistent__: code=%d", method, rec.Code)
		}
		if !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
			t.Fatalf("%s /api/__nonexistent__: ct=%s", method, rec.Header().Get("Content-Type"))
		}
		var body map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body["error"] == "" {
			t.Fatalf("%s /api/__nonexistent__: invalid json %q", method, rec.Body.String())
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/does/not/exist", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("web 404: code=%d ct=%s", rec.Code, rec.Header().Get("Content-Type"))
	}

	req = httptest.NewRequest(http.MethodGet, "/r/doesnotexist", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Header().Get("Content-Type"), "text/html") || !strings.Contains(rec.Body.String(), "QR code not found") {
		t.Fatalf("redirect 404: code=%d ct=%s", rec.Code, rec.Header().Get("Content-Type"))
	}

	// Panic recoverer returns 500 JSON for /api/* and 500 HTML for web.
	panicMux := http.NewServeMux()
	panicMux.HandleFunc("/", func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})
	wrapped := srv.conRecuperacion(panicMux)

	req = httptest.NewRequest(http.MethodGet, "/api/boom", nil)
	rec = httptest.NewRecorder()
	wrapped.ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError || !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("api panic: code=%d ct=%s", rec.Code, rec.Header().Get("Content-Type"))
	}

	req = httptest.NewRequest(http.MethodGet, "/web/boom", nil)
	rec = httptest.NewRecorder()
	wrapped.ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError || !strings.Contains(rec.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("web panic: code=%d ct=%s", rec.Code, rec.Header().Get("Content-Type"))
	}
}
