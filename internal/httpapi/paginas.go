package httpapi

import (
	"html/template"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/Ulzuhan/qr-forge/internal/store"
)

// datos es todo lo que la plantilla necesita. Va escapado por contexto con
// html/template: ni una variable de entorno rara ni un título con comillas
// pueden salirse de su atributo.
type datos struct {
	Pagina      string
	Titulo      string
	Descripcion string
	Canonica    string
	Imagen      string
	NoIndex     bool
	Nonce       string
	JS          string
	CSS         []string
	// Lo que el navegador necesita saber y no puede deducir: quién es, a dónde
	// apunta la cuenta, cuál es la URL impresa y qué QR se está mirando.
	Email     string
	CuentaURL string
	PublicURL string
	QrID      string
	Footer    bool
	// Intención de LinkUp, ya validada por el servidor.
	IntentURL   string
	IntentTitle string
	IntentFrom  string
}

const (
	tituloPorDefecto = "QR-Forge — dynamic QR codes you keep control of"
	descripcion      = "Print the code once and change where it points forever after. Scans counted by day and country — never IP, never referrer. Self-hosted and open source."
)

func (s *Server) documento(w http.ResponseWriter, r *http.Request, d datos) {
	politica, nonce := csp()
	if nonce == "" {
		http.Error(w, "no random available", http.StatusServiceUnavailable)
		return
	}
	h := w.Header()
	h.Set("Content-Security-Policy", politica)
	h.Set("Content-Type", "text/html; charset=utf-8")
	// El HTML es privado: enseña el correo de quien entra y sus códigos.
	h.Set("Cache-Control", "no-store")
	d.Nonce = nonce
	d.JS, d.CSS = s.recursos.JS, s.recursos.CSS
	d.CuentaURL = cuentaURL()
	d.PublicURL = s.publicURL
	d.Footer = strings.TrimSpace(os.Getenv("KAICORP_FOOTER_LINKS")) != ""
	if d.Titulo == "" {
		d.Titulo = tituloPorDefecto
	}
	if d.Descripcion == "" {
		d.Descripcion = descripcion
	}
	if s.publicURL != "" && d.Canonica != "" {
		d.Imagen = s.publicURL + "/og.jpg"
	}
	w.WriteHeader(http.StatusOK)
	_ = plantilla.Execute(w, d)
}

// cuentaURL es la página de la cuenta EN EL PROVEEDOR: correo, contraseña,
// segundo factor, sesiones. Nada de eso lo lleva esta aplicación. Sin la
// variable, el menú no enlaza a ninguna parte.
func cuentaURL() string {
	crudo := strings.TrimSpace(os.Getenv("QRFORGE_ACCOUNT_URL"))
	if crudo == "" {
		return ""
	}
	u, err := url.Parse(crudo)
	if err != nil || u.User != nil {
		return ""
	}
	loopback := u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1"
	if u.Scheme != "https" && !(loopback && u.Scheme == "http") {
		return ""
	}
	return u.String()
}

// aLogin manda a entrar conservando a dónde iba, incluida la query: es lo que
// permite que un enlace de LinkUp con `?url=…` sobreviva al login.
func aLogin(w http.ResponseWriter, r *http.Request) {
	destino := r.URL.Path
	if r.URL.RawQuery != "" {
		destino += "?" + r.URL.RawQuery
	}
	http.Redirect(w, r, "/api/auth/login?next="+url.QueryEscape(destino), http.StatusFound)
}

func (s *Server) portada(w http.ResponseWriter, r *http.Request) {
	pantalla, correo := "landing", ""
	if u := s.usuario(r); u != nil {
		pantalla, correo = "dashboard", u.Email
	}
	s.documento(w, r, datos{Pagina: pantalla, Email: correo, Canonica: s.canonica("/")})
}

func (s *Server) paginaNueva(w http.ResponseWriter, r *http.Request) {
	u := s.usuario(r)
	if u == nil {
		aLogin(w, r)
		return
	}
	d := datos{Pagina: "new", Email: u.Email, NoIndex: true, Titulo: "New QR — QR-Forge"}
	// La intención la valida el servidor. Una inválida se ignora en silencio:
	// es un enlace que llega de fuera, no una petición de quien entra.
	if intent := parseIntencion(r.URL.Query()); intent != nil {
		d.IntentURL, d.IntentTitle, d.IntentFrom = intent.URL, intent.Title, intent.From
	}
	s.documento(w, r, d)
}

func (s *Server) paginaDetalle(w http.ResponseWriter, r *http.Request) {
	s.paginaDeQR(w, r, "detail")
}

func (s *Server) paginaEditar(w http.ResponseWriter, r *http.Request) {
	s.paginaDeQR(w, r, "edit")
}

func (s *Server) paginaDeQR(w http.ResponseWriter, r *http.Request, pantalla string) {
	u := s.usuario(r)
	if u == nil {
		aLogin(w, r)
		return
	}
	id := r.PathValue("id")
	ctx, cancel := contextoBreve(r)
	defer cancel()
	qr, err := s.almacen.QRDelDueno(ctx, id, u.ID)
	if err != nil {
		// Un QR ajeno y uno inexistente son la misma pantalla: quien pregunta no
		// debe poder distinguirlos.
		s.noEncontrado(w, r, u.Email)
		return
	}
	s.documento(w, r, datos{Pagina: pantalla, Email: u.Email, QrID: qr.ID, NoIndex: true,
		Titulo: qr.Title + " — QR-Forge"})
}

func (s *Server) noEncontrado(w http.ResponseWriter, r *http.Request, correo string) {
	politica, nonce := csp()
	h := w.Header()
	h.Set("Content-Security-Policy", politica)
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNotFound)
	_ = plantilla.Execute(w, datos{Pagina: "notfound", Email: correo, Nonce: nonce,
		JS: s.recursos.JS, CSS: s.recursos.CSS, Titulo: "Not found — QR-Forge",
		Descripcion: descripcion, NoIndex: true, CuentaURL: cuentaURL(),
		PublicURL: s.publicURL, Footer: strings.TrimSpace(os.Getenv("KAICORP_FOOTER_LINKS")) != ""})
}

func (s *Server) canonica(ruta string) string {
	if s.publicURL == "" {
		return ""
	}
	return s.publicURL + ruta
}

type intencion struct{ URL, Title, From string }

// parseIntencion valida el enlace de integración. Sin URL válida no hay
// intención: el formulario se abre vacío, como si nadie hubiera pasado nada.
func parseIntencion(q url.Values) *intencion {
	crudo := q.Get("url")
	if crudo == "" || len(crudo) > 2000 || !urlDestinoValida(crudo) {
		return nil
	}
	i := &intencion{URL: crudo}
	if t := strings.TrimSpace(q.Get("title")); t != "" {
		if len([]rune(t)) > 100 {
			t = string([]rune(t)[:100])
		}
		i.Title = t
	}
	if q.Get("from") == "linkup" {
		i.From = "linkup"
	}
	return i
}

var plantilla = template.Must(template.New("doc").Parse(
	`<!doctype html><html lang="en" class="h-full antialiased dark"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{.Titulo}}</title>
<meta name="description" content="{{.Descripcion}}">
{{if .NoIndex}}<meta name="robots" content="noindex, nofollow">{{end}}
{{if .Canonica}}<link rel="canonical" href="{{.Canonica}}">
<meta property="og:url" content="{{.Canonica}}">{{end}}
<meta property="og:title" content="{{.Titulo}}">
<meta property="og:description" content="{{.Descripcion}}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="QR-Forge">
<meta property="og:locale" content="en_US">
{{if .Imagen}}<meta property="og:image" content="{{.Imagen}}">
<meta property="og:image:width" content="760">
<meta property="og:image:height" content="475">
<meta property="og:image:alt" content="QR-Forge: one printed code whose destination is being changed">
{{end}}<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/kaicorp-mark.png">
{{range .CSS}}<link rel="stylesheet" href="{{.}}">
{{end}}</head>
<body class="min-h-full flex flex-col">
<div id="app" data-page="{{.Pagina}}"{{if .Email}} data-email="{{.Email}}"{{end}}{{if .QrID}} data-qr-id="{{.QrID}}"{{end}}{{if .CuentaURL}} data-account-url="{{.CuentaURL}}"{{end}}{{if .PublicURL}} data-public-url="{{.PublicURL}}"{{end}}{{if .Footer}} data-footer-links="on"{{end}}{{if .IntentURL}} data-intent-url="{{.IntentURL}}"{{end}}{{if .IntentTitle}} data-intent-title="{{.IntentTitle}}"{{end}}{{if .IntentFrom}} data-intent-from="{{.IntentFrom}}"{{end}}></div>
{{if .JS}}<script type="module" nonce="{{.Nonce}}" src="{{.JS}}"></script>{{end}}
</body></html>
`))

// paginas resuelve `/`, `/{id}` y `/{id}/edit` partiendo la ruta a mano.
//
// Va así y no con comodines del enrutador porque `/{id}/edit` colisiona con
// `/assets/` y con `/r/{slug}`: «/assets/edit» y «/r/edit» encajan en los dos
// patrones, ninguno es más específico, y Go se niega a registrarlos. Las URL
// impresas no se tocan; sólo cambia quién las resuelve.
func (s *Server) paginas(w http.ResponseWriter, r *http.Request) {
	ruta := strings.Trim(r.URL.Path, "/")
	if ruta == "" {
		s.portada(w, r)
		return
	}
	partes := strings.Split(ruta, "/")
	if partes[0] == "new" && len(partes) == 1 {
		s.paginaNueva(w, r)
		return
	}
	// Un id tiene la forma de un slug; cualquier otra cosa no es una página.
	if !reSlug.MatchString(partes[0]) {
		s.noEncontrado(w, r, correoDe(s.usuario(r)))
		return
	}
	r.SetPathValue("id", partes[0])
	switch {
	case len(partes) == 1:
		s.paginaDetalle(w, r)
	case len(partes) == 2 && partes[1] == "edit":
		s.paginaEditar(w, r)
	default:
		s.noEncontrado(w, r, correoDe(s.usuario(r)))
	}
}

func correoDe(u *store.User) string {
	if u == nil {
		return ""
	}
	return u.Email
}
