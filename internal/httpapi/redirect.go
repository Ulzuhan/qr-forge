package httpapi

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/Ulzuhan/qr-forge/internal/store"
)

var rePais = regexp.MustCompile(`^[A-Z]{2}$`)

// redirigir es lo que codifican los QR impresos. Tiene que funcionar para
// cualquiera, siempre y sin sesión.
func (s *Server) redirigir(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !reSlug.MatchString(slug) {
		s.textoPlano(w, http.StatusNotFound, "404 — QR not found")
		return
	}
	ctx, cancel := contextoBreve(r)
	defer cancel()
	qr, err := s.almacen.QRPorSlug(ctx, slug)
	if err != nil {
		if errors.Is(err, store.ErrNoEncontrado) {
			s.textoPlano(w, http.StatusNotFound, "404 — QR not found")
			return
		}
		s.textoPlano(w, http.StatusInternalServerError, "500 — Internal error")
		return
	}
	if qr.Type != "dynamic" {
		s.textoPlano(w, http.StatusBadRequest, "400 — This QR is not a redirect URL")
		return
	}
	if !qr.IsActive {
		s.textoPlano(w, http.StatusGone, "410 — This QR has been disabled")
		return
	}
	if qr.ExpiresAt != nil && qr.ExpiresAt.Before(s.ahora().UTC()) {
		s.textoPlano(w, http.StatusGone, "410 — This QR has expired")
		return
	}
	if qr.DestinationURL == nil {
		s.textoPlano(w, http.StatusInternalServerError, "500 — Internal error")
		return
	}

	// El límite es SOBRE EL REGISTRO, nunca sobre la redirección.
	//
	// Poner el límite arriba y devolver 429 sería tentador y sería un error:
	// esta ruta es la que un cartel impreso necesita que funcione. Una oficina
	// entera tras el mismo NAT y de pronto el código "no va", y quien lo imprimió
	// no puede arreglarlo. Lo que sí conviene acotar es la analítica, porque sin
	// límite cualquiera puede inflar las cifras de un código ajeno en bucle.
	if s.limitador.permitir("scan:"+slug+":"+ipCliente(r), 30, time.Minute).Permitido {
		s.anotarEscaneo(qr.ID, r)
	}

	h := w.Header()
	h.Set("Location", *qr.DestinationURL)
	// Sin `no-store`, un 302 cacheado deja el QR clavado en el destino viejo
	// —justo lo que un dinámico existe para evitar— y además deja de contar
	// escaneos, porque el navegador ya no vuelve a pedirlo.
	h.Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	h.Set("Pragma", "no-cache")
	h.Set("Expires", "0")
	w.WriteHeader(http.StatusFound)
}

// anotarEscaneo registra en segundo plano y ACOTADO.
//
// La analítica es best-effort: que falle no puede romper un destino válido. Pero
// tampoco se lanza una goroutine por petición sin techo — un pico de escaneos
// abriría tantas como peticiones. Hay una cola pequeña y, si se llena, se
// pierde el escaneo antes que la redirección.
func (s *Server) anotarEscaneo(qrID string, r *http.Request) {
	var ua, pais *string
	if v := r.Header.Get("User-Agent"); v != "" {
		if len(v) > 256 {
			v = v[:256]
		}
		ua = &v
	}
	if v := r.Header.Get("CF-IPCountry"); rePais.MatchString(v) {
		pais = &v
	}
	select {
	case s.escaneos <- escaneo{QrID: qrID, UserAgent: ua, Pais: pais}:
	default:
		// Cola llena: se descarta el registro, no la redirección.
	}
}

type escaneo struct {
	QrID      string
	UserAgent *string
	Pais      *string
}

// AtenderEscaneos consume la cola hasta que se cancele el contexto. Un solo
// consumidor: el almacén tiene una conexión y no gana nada con más.
func (s *Server) AtenderEscaneos(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case e := <-s.escaneos:
			registrar, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = s.almacen.RegistrarEscaneo(registrar, e.QrID, e.UserAgent, e.Pais)
			cancel()
		}
	}
}

func (s *Server) textoPlano(w http.ResponseWriter, estado int, cuerpo string) {
	h := w.Header()
	h.Set("Content-Type", "text/plain; charset=utf-8")
	h.Set("Cache-Control", "no-store")
	w.WriteHeader(estado)
	_, _ = w.Write([]byte(cuerpo))
}
