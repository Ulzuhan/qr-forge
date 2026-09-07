package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Ulzuhan/qr-forge/internal/auth"
)

// cookieSegura: `Secure` POR DEFECTO, y se apaga a mano.
//
// Node lo ataba a NODE_ENV === "production", que su imagen traía de fábrica. Un
// binario Go no tiene esa variable, así que copiar la condición habría emitido
// cookies sin `Secure` en producción el día del despliegue sin que fallara
// ninguna prueba. Para servir por http en local está QRFORGE_INSECURE_COOKIES=1.
func cookieSegura() bool {
	return os.Getenv("QRFORGE_INSECURE_COOKIES") != "1"
}

type estadoOidc struct {
	Verifier string `json:"verifier"`
	State    string `json:"state"`
	Next     string `json:"next"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if s.oidc == nil {
		errorJSON(w, http.StatusServiceUnavailable, "Sign-in is not configured on this instance")
		return
	}
	verificador, err1 := auth.Aleatorio()
	estado, err2 := auth.Aleatorio()
	if err1 != nil || err2 != nil {
		errorJSON(w, http.StatusServiceUnavailable, "no random available")
		return
	}
	destino, err := s.discovery.URLAutorizacion(r.Context(), s.oidc, estado, auth.Desafio(verificador))
	if err != nil {
		errorJSON(w, http.StatusServiceUnavailable, "Sign-in is unavailable")
		return
	}
	guardado, _ := json.Marshal(estadoOidc{Verifier: verificador, State: estado,
		Next: auth.SafeNext(r.URL.Query().Get("next"))})
	// URL-encoded: el valor es JSON, y `{`, `"` y `,` no son bytes válidos de
	// cookie. http.SetCookie los borra en silencio y lo que vuelve ya no es JSON.
	http.SetCookie(w, &http.Cookie{Name: cookieOidc, Value: url.QueryEscape(string(guardado)),
		Path: "/", HttpOnly: true, Secure: cookieSegura(), SameSite: http.SameSiteLaxMode, MaxAge: 600})
	http.Redirect(w, r, destino, http.StatusFound)
}

func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	fallo := func() {
		s.borrarCookie(w, cookieOidc)
		http.Redirect(w, r, "/?error=signin", http.StatusFound)
	}
	if s.oidc == nil {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	var guardado estadoOidc
	if c, err := r.Cookie(cookieOidc); err == nil {
		crudo, err := url.QueryUnescape(c.Value)
		if err == nil {
			_ = json.Unmarshal([]byte(crudo), &guardado)
		}
	}
	codigo := r.URL.Query().Get("code")
	estado := r.URL.Query().Get("state")
	if codigo == "" || estado == "" || guardado.State == "" || guardado.Verifier == "" || estado != guardado.State {
		fallo()
		return
	}
	limite := s.limitador.permitir("oidc-callback:"+ipCliente(r), 30, 15*time.Minute)
	if !limite.Permitido {
		w.Header().Set("Retry-After", strconv.Itoa(limite.Espera))
		errorJSON(w, http.StatusTooManyRequests, "Too many attempts. Try again in a moment.")
		return
	}
	identidad, err := s.discovery.Canjear(r.Context(), s.oidc, codigo, guardado.Verifier)
	if err != nil {
		fallo()
		return
	}
	u, err := s.almacen.UpsertUser(r.Context(), identidad.Sub, identidad.Email, identidad.Name)
	if err != nil {
		fallo()
		return
	}
	token, err := s.almacen.CrearSesion(r.Context(), u.ID, s.ttlSesion)
	if err != nil {
		fallo()
		return
	}
	http.SetCookie(w, &http.Cookie{Name: cookieSesion, Value: token, Path: "/",
		HttpOnly: true, Secure: cookieSegura(), SameSite: http.SameSiteLaxMode,
		MaxAge: int(s.ttlSesion.Seconds())})
	s.borrarCookie(w, cookieOidc)
	http.Redirect(w, r, auth.SafeNext(guardado.Next), http.StatusFound)
}

func (s *Server) borrarCookie(w http.ResponseWriter, nombre string) {
	http.SetCookie(w, &http.Cookie{Name: nombre, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: cookieSegura(), SameSite: http.SameSiteLaxMode})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if !s.exigirOrigen(w, r) {
		return
	}
	if c, err := r.Cookie(cookieSesion); err == nil {
		_ = s.almacen.CerrarSesion(r.Context(), c.Value)
	}
	s.borrarCookie(w, cookieSesion)
	siguiente := "/"
	if s.oidc != nil {
		if e, err := s.discovery.Endpoints(r.Context(), s.oidc); err == nil && e.EndSession != "" {
			siguiente = e.EndSession
		}
	}
	escribirJSON(w, http.StatusOK, map[string]any{"ok": true, "next": siguiente})
}

// avisoCierre aplica el back-channel logout del proveedor.
//
// El orden importa y es lo que corrige 0.5.0: primero se verifica, después se
// REVOCA, y sólo si la revocación salió bien se marca el JTI. Marcarlo antes
// convierte un fallo de base de datos en una revocación perdida para siempre,
// porque el reintento del proveedor se descartaría como repetido.
func (s *Server) avisoCierre(w http.ResponseWriter, r *http.Request) {
	if s.oidc == nil {
		errorJSON(w, http.StatusNotFound, "not_configured")
		return
	}
	if !strings.Contains(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded") {
		errorJSON(w, http.StatusBadRequest, "unsupported_media_type")
		return
	}
	if n, err := strconv.Atoi(r.Header.Get("Content-Length")); err == nil && n > maxBackchannel {
		errorJSON(w, http.StatusRequestEntityTooLarge, "payload_too_large")
		return
	}
	crudo, err := io.ReadAll(io.LimitReader(r.Body, maxBackchannel+1))
	if err != nil || len(crudo) > maxBackchannel {
		errorJSON(w, http.StatusRequestEntityTooLarge, "payload_too_large")
		return
	}
	valores, err := url.ParseQuery(string(crudo))
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid logout_token")
		return
	}
	token := valores.Get("logout_token")
	if token == "" {
		errorJSON(w, http.StatusBadRequest, "missing logout_token")
		return
	}
	endpoints, err := s.discovery.Endpoints(r.Context(), s.oidc)
	if err != nil {
		errorJSON(w, http.StatusServiceUnavailable, "verification unavailable")
		return
	}
	aviso, err := s.verif.Verificar(r.Context(), token, s.oidc, endpoints)
	switch {
	case errors.Is(err, auth.ErrNoVerificable):
		errorJSON(w, http.StatusServiceUnavailable, "verification unavailable")
		return
	case errors.Is(err, auth.ErrSoloSid):
		// 0.5.0 respondía 200 aquí sin hacer nada. Decirle que sí al proveedor
		// cuando no se ha cerrado ninguna sesión es peor que decirle que no: deja
		// de reintentar y la sesión sigue viva.
		errorJSON(w, http.StatusBadRequest, "sid-only logout is not supported")
		return
	case errors.Is(err, auth.ErrAvisoRepetido):
		// Un JTI repetido se rechaza, que es para lo que está el JTI. Se conserva
		// el 400 de 0.5.0: no es uno de los fallos que había que corregir, y
		// cambiarlo sería una diferencia de contrato que nadie pidió.
		errorJSON(w, http.StatusBadRequest, "invalid logout_token")
		return
	case err != nil:
		errorJSON(w, http.StatusBadRequest, "invalid logout_token")
		return
	}
	if _, err := s.almacen.RevocarSesionesDe(r.Context(), aviso.Sub); err != nil {
		// Sin marcar el JTI: el proveedor reintentará y esta vez se aplicará.
		errorJSON(w, http.StatusServiceUnavailable, "revocation failed")
		return
	}
	s.verif.Anotar(aviso.JTI)
	escribirJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
