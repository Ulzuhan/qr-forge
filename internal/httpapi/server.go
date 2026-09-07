// Package httpapi sirve la API, las páginas y el redirect público.
package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/Ulzuhan/qr-forge/internal/auth"
	"github.com/Ulzuhan/qr-forge/internal/store"
	"github.com/Ulzuhan/qr-forge/internal/web"
)

const cookieSesion = "qrforge_session"
const cookieOidc = "qrforge_oidc"

type Server struct {
	almacen   *store.Store
	oidc      *auth.Config
	discovery *auth.Discovery
	verif     *auth.Verificador
	recursos  web.Recursos
	publicURL string
	limitador *limitador
	ttlSesion time.Duration
	ahora     func() time.Time
	// Cola acotada de escaneos: la analítica no puede tumbar un redirect ni
	// abrir una goroutine por petición.
	escaneos chan escaneo
}

func New(almacen *store.Store, oidc *auth.Config, publicURL string, ttl time.Duration) (*Server, error) {
	recursos, err := web.Cargar()
	if err != nil {
		return nil, err
	}
	return &Server{almacen: almacen, oidc: oidc, discovery: auth.NuevoDiscovery(),
		verif: auth.NuevoVerificador(), recursos: recursos, publicURL: publicURL,
		limitador: nuevoLimitador(), ttlSesion: ttl, ahora: time.Now,
		escaneos: make(chan escaneo, 256)}, nil
}

// AhoraCon inyecta el reloj en el servidor y en su limitador. Sólo pruebas.
func (s *Server) AhoraCon(f func() time.Time) {
	s.ahora = f
	s.limitador.Ahora = f
	s.verif.Ahora = f
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// Público, sin sesión: es lo que codifican los QR impresos.
	mux.HandleFunc("GET /r/{slug}", s.redirigir)
	mux.HandleFunc("HEAD /r/{slug}", s.redirigir)

	mux.HandleFunc("GET /api/health", s.salud)
	mux.HandleFunc("GET /api/qr", s.listarQR)
	mux.HandleFunc("POST /api/qr", s.crearQR)
	mux.HandleFunc("GET /api/qr/{id}", s.verQR)
	mux.HandleFunc("PATCH /api/qr/{id}", s.editarQR)
	mux.HandleFunc("DELETE /api/qr/{id}", s.borrarQR)
	mux.HandleFunc("GET /api/qr/{id}/stats", s.estadisticas)

	mux.HandleFunc("GET /api/auth/login", s.login)
	mux.HandleFunc("GET /api/auth/callback", s.callback)
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	mux.HandleFunc("POST /api/auth/backchannel-logout", s.avisoCierre)

	mux.HandleFunc("GET /robots.txt", s.robots)
	mux.HandleFunc("GET /sitemap.xml", s.sitemap)

	// Las páginas van por un SOLO manejador que parte la ruta a mano.
	//
	// Con comodines no se puede: `/{id}/edit` choca con `/assets/` y con
	// `/r/{slug}` —«/assets/edit» y «/r/edit» encajan en los dos patrones y
	// ninguno es más específico—, y el enrutador de Go entra en pánico al
	// registrarlos. Las URL son las que están impresas: se conservan, y lo que
	// cambia es quién las resuelve.
	mux.HandleFunc("GET /", s.paginas)

	// Los estáticos se atienden ANTES del enrutador, no dentro, para que no
	// compitan por el mismo prefijo con las rutas de página.
	estaticos, sueltos, err := web.Estaticos()
	raiz := http.Handler(mux)
	if err == nil {
		conjunto := map[string]bool{}
		for _, n := range sueltos {
			conjunto[n] = true
		}
		raiz = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet && (strings.HasPrefix(r.URL.Path, "/assets/") || conjunto[r.URL.Path]) {
				estaticos.ServeHTTP(w, r)
				return
			}
			mux.ServeHTTP(w, r)
		})
	}
	return conCabeceras(raiz)
}

func conCabeceras(siguiente http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Strict-Transport-Security", "max-age=31536000")
		siguiente.ServeHTTP(w, r)
	})
}

// csp devuelve la política y el nonce de ESTA respuesta. Un nonce reutilizado
// entre respuestas deja de servir para nada.
func csp() (string, string) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Sin aleatoriedad no se sirve una página con scripts.
		return "", ""
	}
	nonce := base64.RawStdEncoding.EncodeToString(b)
	politica := strings.Join([]string{
		"default-src 'self'",
		"script-src 'self' 'nonce-" + nonce + "'",
		// El QR se dibuja en un <canvas> y se descarga como data: URL.
		"img-src 'self' data: blob:",
		"style-src 'self' 'unsafe-inline'",
		"font-src 'self'",
		"connect-src 'self'",
		"base-uri 'none'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		"object-src 'none'",
	}, "; ")
	return politica, nonce
}

func escribirJSON(w http.ResponseWriter, estado int, v any) {
	h := w.Header()
	h.Set("Content-Type", "application/json; charset=utf-8")
	// La API nunca se cachea: lista QRs de una persona y sus estadísticas.
	h.Set("Cache-Control", "no-store")
	w.WriteHeader(estado)
	_ = json.NewEncoder(w).Encode(v)
}

func errorJSON(w http.ResponseWriter, estado int, mensaje string) {
	escribirJSON(w, estado, map[string]string{"error": mensaje})
}

func (s *Server) salud(w http.ResponseWriter, r *http.Request) {
	// El healthcheck NO visita un QR real: crearía escaneos y ensuciaría las
	// estadísticas de alguien cada treinta segundos.
	//
	// Y es BARATO. Antes corría `integrity_check` y `foreign_key_check`, que
	// recorren la base entera: cada treinta segundos por Docker, ocupando la
	// única conexión que tiene toda la aplicación, y accesible sin sesión — o
	// sea, un botón gratis para dejar el servicio de rodillas. Las
	// comprobaciones completas están en `qrforge verificar`, para la validación
	// del despliegue y el mantenimiento.
	if err := s.almacen.Vivo(r.Context()); err != nil {
		errorJSON(w, http.StatusServiceUnavailable, "unhealthy")
		return
	}
	escribirJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// usuario resuelve la sesión de la petición.
func (s *Server) usuario(r *http.Request) *store.User {
	c, err := r.Cookie(cookieSesion)
	if err != nil || c.Value == "" {
		return nil
	}
	u, err := s.almacen.UsuarioPorSesion(r.Context(), c.Value)
	if err != nil {
		return nil
	}
	return u
}

// exigirUsuario es el patrón de la API: el usuario, o el 401 ya escrito.
func (s *Server) exigirUsuario(w http.ResponseWriter, r *http.Request) *store.User {
	u := s.usuario(r)
	if u == nil {
		errorJSON(w, http.StatusUnauthorized, "Not authenticated")
		return nil
	}
	return u
}

// mismoOrigen rechaza las escrituras que vienen de otro sitio.
//
// Se compara contra `Host` y no contra `X-Forwarded-Host`: la segunda la escribe
// quien llama y este despliegue no la reemplaza, así que preferirla dejaría la
// comprobación saltable. QRFORGE_PUBLIC_HOST queda para un proxy que sí
// reescriba Host.
func mismoOrigen(r *http.Request) bool {
	sitio := r.Header.Get("Sec-Fetch-Site")
	if sitio != "" && sitio != "same-origin" && sitio != "none" {
		return false
	}
	origen := r.Header.Get("Origin")
	if origen == "" {
		return true
	}
	esperado := strings.TrimSpace(os.Getenv("QRFORGE_PUBLIC_HOST"))
	if esperado == "" {
		esperado = r.Host
	}
	u, err := url.Parse(origen)
	if err != nil || esperado == "" {
		return false
	}
	esquema := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		esquema = "https"
	}
	return u.Scheme+"://"+u.Host == esquema+"://"+esperado
}

func (s *Server) exigirOrigen(w http.ResponseWriter, r *http.Request) bool {
	if !mismoOrigen(r) {
		errorJSON(w, http.StatusForbidden, "Cross-origin request rejected")
		return false
	}
	return true
}

func (s *Server) robots(w http.ResponseWriter, r *http.Request) {
	// Las tres exclusiones de 0.5.0, y `/r/` es la que más importa: son las
	// redirecciones impresas en papel. Tienen que funcionar para cualquiera,
	// siempre, pero no son contenido —son fontanería— y cada una indexada es un
	// escaneo atribuido a un rastreador en vez de a una persona.
	cuerpo := "User-Agent: *\nAllow: /\nDisallow: /r/\nDisallow: /api/\nDisallow: /new\n\n"
	if s.publicURL != "" {
		cuerpo += "Host: " + s.publicURL + "\nSitemap: " + s.publicURL + "/sitemap.xml\n"
	}
	s.texto(w, "text/plain", cuerpo)
}

func (s *Server) sitemap(w http.ResponseWriter, r *http.Request) {
	cuerpo := "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
		"<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
	if s.publicURL != "" {
		var loc strings.Builder
		_ = template.HTMLEscape
		xmlEscapar(&loc, s.publicURL+"/")
		cuerpo += "<url>\n<loc>" + loc.String() + "</loc>\n<changefreq>monthly</changefreq>\n<priority>1</priority>\n</url>\n"
	}
	s.texto(w, "application/xml", cuerpo+"</urlset>\n")
}

func xmlEscapar(w io.Writer, v string) {
	_ = template.HTMLEscape
	_, _ = io.WriteString(w, template.HTMLEscapeString(v))
}

func (s *Server) texto(w http.ResponseWriter, tipo, cuerpo string) {
	h := w.Header()
	h.Set("Content-Type", tipo)
	h.Set("Cache-Control", "public, max-age=0, must-revalidate")
	_, _ = io.WriteString(w, cuerpo)
}

// contextoBreve acota lo que puede tardar una consulta de página.
func contextoBreve(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), 10*time.Second)
}
