package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const maxJSON = 64 * 1024        // cuerpo de la API
const maxBackchannel = 16 * 1024 // aviso de cierre

var errCuerpoGrande = errors.New("cuerpo demasiado grande")

// leerJSON lee un objeto pequeño sin dejar que una petición troceada crezca sin
// límite. Se comprueba en streaming y no sólo por Content-Length, que lo escribe
// quien llama.
func leerJSON(r *http.Request, destino *map[string]any) error {
	tipo := strings.TrimSpace(r.Header.Get("Content-Type"))
	if !strings.HasPrefix(strings.ToLower(tipo), "application/json") {
		return errors.New("tipo no admitido")
	}
	if n, err := strconv.Atoi(r.Header.Get("Content-Length")); err == nil && n > maxJSON {
		return errCuerpoGrande
	}
	crudo, err := io.ReadAll(io.LimitReader(r.Body, maxJSON+1))
	if err != nil {
		return err
	}
	if len(crudo) > maxJSON {
		return errCuerpoGrande
	}
	var m map[string]any
	if err := json.Unmarshal(crudo, &m); err != nil {
		return errors.New("cuerpo mal formado")
	}
	// `null`, `[]`, `"texto"` y `3` son JSON válido y NO son un objeto. Sin esta
	// comprobación, `null` deja un mapa nil, la petición sigue adelante sin
	// campos y un PATCH responde 200 habiendo mandado basura.
	if m == nil {
		return errors.New("cuerpo mal formado")
	}
	*destino = m
	return nil
}

// entero lee un entero positivo del entorno, con tope. Un valor absurdo cae al
// valor por omisión en vez de convertirse en cero.
func entero(nombre string, porDefecto, maximo int) int {
	v, err := strconv.Atoi(os.Getenv(nombre))
	if err != nil || v <= 0 || v > maximo {
		return porDefecto
	}
	return v
}

// ─── Limitador ──────────────────────────────────────────────────────
//
// En memoria y por proceso, como el de Node: es un solo proceso detrás del
// túnel. Con varias instancias haría falta un almacén compartido, y conviene
// que eso siga escrito aquí y no se descubra el día que se escale.
//
// Es un contador con vencimiento desde la PRIMERA petición de la ventana, no un
// cubo con goteo: permite una ráfaga y luego corta hasta que la ventana pase.
// Se conserva ese comportamiento a propósito, porque es el que ya tienen los
// clientes; no se inventa una espera de un minuto que antes no existía.

type cubo struct {
	cuenta int
	hasta  time.Time
}

type limitador struct {
	mu      sync.Mutex
	cubos   map[string]cubo
	barrido time.Time
	Ahora   func() time.Time
}

func nuevoLimitador() *limitador {
	return &limitador{cubos: map[string]cubo{}, Ahora: time.Now}
}

type resultado struct {
	Permitido bool
	Espera    int
}

func (l *limitador) permitir(clave string, maximo int, ventana time.Duration) resultado {
	l.mu.Lock()
	defer l.mu.Unlock()
	ahora := l.Ahora()
	if ahora.Sub(l.barrido) > ventana {
		l.barrido = ahora
		for k, c := range l.cubos {
			if c.hasta.Before(ahora) {
				delete(l.cubos, k)
			}
		}
	}
	c, hay := l.cubos[clave]
	if !hay || c.hasta.Before(ahora) {
		l.cubos[clave] = cubo{cuenta: 1, hasta: ahora.Add(ventana)}
		return resultado{Permitido: true}
	}
	c.cuenta++
	l.cubos[clave] = c
	if c.cuenta > maximo {
		espera := int(c.hasta.Sub(ahora).Seconds())
		if espera < 1 {
			espera = 1
		}
		return resultado{Espera: espera}
	}
	return resultado{Permitido: true}
}

// ipCliente: detrás de Cloudflare la buena es cf-connecting-ip; si no, el
// ÚLTIMO salto de x-forwarded-for. Los anteriores los escribe quien llama.
func ipCliente(r *http.Request) string {
	if cf := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); cf != "" {
		return cf
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		partes := strings.Split(xff, ",")
		ultimo := strings.TrimSpace(partes[len(partes)-1])
		if ultimo != "" {
			return ultimo
		}
	}
	return "direct"
}
