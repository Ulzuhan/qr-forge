package httpapi

import (
	"net/url"
	"strings"
	"testing"
)

func TestDestinoYSlug(t *testing.T) {
	for _, value := range []string{"https://example.com", "http://example.com/path?x=1#y", "http://192.168.1.50"} {
		if !urlDestinoValida(value) {
			t.Errorf("valid URL rejected: %s", value)
		}
	}
	for _, value := range []string{"", "   ", "not-a-url", "//example.com", "javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "ftp://example.com", "vbscript:msgbox(1)", "https://user:pass@example.com", "https://example.com/\n", "https://example.com/" + strings.Repeat("a", 2048)} {
		if urlDestinoValida(value) {
			t.Errorf("unsafe URL accepted: %q", value)
		}
	}
	for input, want := range map[string]string{"abc2345": "abc2345", "../etc": "etc", "a/b": "a-b", "a\\b": "a-b", "a b": "a-b", " A---B ": "a-b", strings.Repeat("a", 50): strings.Repeat("a", 40)} {
		if got := limpiarSlug(input); got != want {
			t.Errorf("slug(%q)=%q, want %q", input, got, want)
		}
	}
}

func TestIntencion(t *testing.T) {
	for _, q := range []url.Values{{}, {"title": {"Hello"}}, {"url": {"javascript:alert(1)"}}, {"url": {"data:text/html,<script>"}}, {"url": {"file:///etc/passwd"}}, {"url": {"ftp://x/y"}}, {"url": {"https://example.com/" + strings.Repeat("a", 2100)}}} {
		if parseIntencion(q) != nil {
			t.Errorf("invalid intent: %v", q)
		}
	}
	i := parseIntencion(url.Values{"url": {"https://one.example/", "https://two.example/"}, "title": {"  " + strings.Repeat("a", 250)}, "from": {"linkup"}})
	if i == nil || i.URL != "https://one.example/" || i.Title != strings.Repeat("a", 100) || i.From != "linkup" {
		t.Fatalf("intent: %+v", i)
	}
	i = parseIntencion(url.Values{"url": {"https://example.com/"}, "from": {"unknown"}})
	if i == nil || i.Title != "" || i.From != "" {
		t.Fatalf("defaults: %+v", i)
	}
}
