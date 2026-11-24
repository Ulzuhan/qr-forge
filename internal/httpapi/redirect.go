package httpapi

import (
	"context"
	"errors"
	"log"
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
		s.errorHTML(w, r, http.StatusNotFound, "QR code not found", "This short QR link does not exist or may have been removed.")
		return
	}
	ctx, cancel := contextoBreve(r)
	defer cancel()
	qr, err := s.almacen.QRPorSlug(ctx, slug)
	if err != nil {
		if errors.Is(err, store.ErrNoEncontrado) {
			s.errorHTML(w, r, http.StatusNotFound, "QR code not found", "This short QR link does not exist or may have been removed.")
			return
		}
		s.errorHTML(w, r, http.StatusInternalServerError, "Something went wrong", "We could not resolve this QR code right now. Try again in a moment.")
		return
	}
	if qr.Type != "dynamic" {
		s.errorHTML(w, r, http.StatusBadRequest, "Not a redirect code", "This QR code does not carry a redirect link.")
		return
	}
	if !qr.IsActive {
		s.errorHTML(w, r, http.StatusGone, "QR code paused", "This QR code has been disabled by its owner.")
		return
	}
	if qr.ExpiresAt != nil && qr.ExpiresAt.Before(s.ahora().UTC()) {
		s.errorHTML(w, r, http.StatusGone, "QR code expired", "This QR code has reached its expiration date.")
		return
	}
	if qr.DestinationURL == nil {
		s.errorHTML(w, r, http.StatusInternalServerError, "Something went wrong", "We could not resolve this QR code right now. Try again in a moment.")
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
			// El plazo de la escritura CUELGA del contexto del consumidor, no de
			// Background. Con uno desligado, una escritura arrancada justo antes
			// de la parada seguía hasta cinco segundos por su cuenta, fuera del
			// presupuesto de apagado y con `tareas.Wait()` esperándola.
			registrar, cancel := context.WithTimeout(ctx, s.plazoEscritura)
			err := s.escribirEscaneo(registrar, e.QrID, e.UserAgent, e.Pais)
			cancel()
			if err != nil {
				// La analítica es best-effort, pero un fallo silencioso no deja
				// forma de saber que se están perdiendo escaneos.
				log.Printf("no se pudo registrar un escaneo: %v", err)
			}
		}
	}
}

// Drenaje es el resultado real de vaciar la cola al parar. Los tres números son
// distintos y hay que distinguirlos: escrito no es lo mismo que intentado.
type Drenaje struct {
	// Escritos son los que están EN LA BASE.
	Escritos int
	// Fallidos se intentaron y la escritura devolvió error.
	Fallidos int
	// Pendientes seguían en la cola cuando se acabó el plazo.
	Pendientes int
}

func (d Drenaje) Vacio() bool { return d.Escritos == 0 && d.Fallidos == 0 && d.Pendientes == 0 }

// DrenarEscaneos escribe lo que quede en la cola. Se llama al parar, DESPUÉS de
// que el consumidor haya terminado y ANTES de cerrar la base.
//
// Sin esto, un despliegue perdía los escaneos encolados: se cancela el
// consumidor, el proceso se va y las filas nunca se escriben. Son pocas y son
// best-effort, pero perderlas en CADA despliegue es una pérdida sistemática.
//
// El plazo es GLOBAL, no por escaneo. Con un plazo por escritura, una cola de
// doscientos podía tardar doscientas veces más que el presupuesto de parada, y
// el contenedor mata el proceso a la mitad — que es exactamente lo que se
// estaba intentando evitar.
func (s *Server) DrenarEscaneos(plazo time.Duration) Drenaje {
	ctx, cancel := context.WithTimeout(context.Background(), plazo)
	defer cancel()
	var d Drenaje
	for {
		select {
		case e := <-s.escaneos:
			if err := s.escribirEscaneo(ctx, e.QrID, e.UserAgent, e.Pais); err != nil {
				d.Fallidos++
				// Si se acabó el plazo, lo que queda ya no se va a escribir: se
				// cuenta y se sale, en vez de intentarlo doscientas veces más.
				if ctx.Err() != nil {
					d.Pendientes = len(s.escaneos)
					return d
				}
			} else {
				d.Escritos++
			}
		default:
			return d
		}
	}
}
