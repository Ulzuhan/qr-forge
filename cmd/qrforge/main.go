// qrforge: un solo proceso que sirve la API, las páginas y el redirect.
//
// La inicialización de la base entra aquí: ya no hace falta un entrypoint de
// Node ni un ExecStartPre que prepare nada antes de arrancar.
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/Ulzuhan/qr-forge/internal/auth"
	"github.com/Ulzuhan/qr-forge/internal/httpapi"
	"github.com/Ulzuhan/qr-forge/internal/store"
)

func entero(nombre string, porDefecto, min, max int64) int64 {
	crudo := os.Getenv(nombre)
	if crudo == "" {
		return porDefecto
	}
	// Una variable presente pero ilegible cae al valor por omisión y no a cero:
	// `QRFORGE_SESSION_TTL_HOURS=` daría sesiones de nada.
	n, err := strconv.ParseInt(crudo, 10, 64)
	if err != nil || n <= 0 {
		return porDefecto
	}
	return min64(max64(n, min), max)
}

func min64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// urlPublica es el origen IMPRESO. Tiene que ser explícito y válido: derivarlo
// de `Host`, de Docker o de una VPN pondría en el papel una dirección que sólo
// funciona desde dentro, y el papel no se puede corregir después.
func urlPublica() (string, error) {
	crudo := strings.TrimSpace(os.Getenv("QRFORGE_PUBLIC_URL"))
	if crudo == "" {
		return "", errors.New("QRFORGE_PUBLIC_URL es obligatoria: es la dirección que va impresa en los códigos")
	}
	u, err := url.Parse(crudo)
	if err != nil || u.Host == "" {
		return "", errors.New("QRFORGE_PUBLIC_URL no es una URL")
	}
	loopback := u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1"
	if u.Scheme != "https" && !(loopback && u.Scheme == "http") {
		return "", errors.New("QRFORGE_PUBLIC_URL debe ser https (http sólo en loopback)")
	}
	if u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", errors.New("QRFORGE_PUBLIC_URL debe ser sólo un origen, sin ruta ni query")
	}
	return u.Scheme + "://" + u.Host, nil
}

// sonda es el healthcheck del contenedor, dentro del propio binario porque la
// imagen no lleva node con el que preguntar desde fuera.
//
// Pega a /api/health y NO a un QR real: visitar un código registraría un
// escaneo cada treinta segundos y ensuciaría las estadísticas de alguien.
func sonda() int {
	puerto := os.Getenv("PORT")
	if puerto == "" {
		puerto = "3459"
	}
	cliente := &http.Client{Timeout: 4 * time.Second}
	res, err := cliente.Get("http://127.0.0.1:" + puerto + "/api/health")
	if err != nil {
		return 1
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func main() {
	if len(os.Args) > 1 {
		if os.Args[1] != "health" || len(os.Args) > 2 {
			log.Fatalf("uso: %s [health]", os.Args[0])
		}
		os.Exit(sonda())
	}

	ruta := os.Getenv("QRFORGE_DB_PATH")
	if ruta == "" {
		ruta = "/data/qrforge.db"
	}
	publica, err := urlPublica()
	if err != nil {
		log.Fatal(err)
	}
	ttl := time.Duration(entero("QRFORGE_SESSION_TTL_HOURS", 12, 1, 24)) * time.Hour
	retencion := time.Duration(entero("QRFORGE_SCAN_RETENTION_DAYS", 365, 1, 3650)) * 24 * time.Hour

	almacen, err := store.Open(ruta)
	if err != nil {
		// Una base que no encaja no se sustituye por una vacía: se para y se dice.
		log.Fatalf("no se pudo preparar la base: %v", err)
	}
	defer almacen.Close()

	oidc := auth.DesdeEntorno()
	if oidc == nil {
		log.Print("aviso: sin configuración OIDC; no se podrá iniciar sesión")
	}
	servidor, err := httpapi.New(almacen, oidc, publica, ttl)
	if err != nil {
		log.Fatalf("no se pudo preparar el servidor: %v", err)
	}

	host := os.Getenv("HOSTNAME")
	if host == "" {
		host = "127.0.0.1"
	}
	puerto := os.Getenv("PORT")
	if puerto == "" {
		puerto = "3459"
	}

	http1 := &http.Server{
		Addr:              net.JoinHostPort(host, puerto),
		Handler:           servidor.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, parar := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer parar()

	// El consumidor de la cola de escaneos y el temporizador de limpieza son
	// cancelables: al parar, terminan; no quedan tareas sueltas.
	go servidor.AtenderEscaneos(ctx)
	go limpiar(ctx, almacen, retencion)

	go func() {
		<-ctx.Done()
		cierre, cancelar := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancelar()
		_ = http1.Shutdown(cierre)
	}()

	log.Printf("qrforge escuchando en %s, base %s, origen impreso %s", http1.Addr, ruta, publica)
	if err := http1.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

// limpiar retira sesiones caducadas y escaneos fuera de la retención: al
// arrancar y cada seis horas, como hacía la instrumentación de Node.
func limpiar(ctx context.Context, almacen *store.Store, retencion time.Duration) {
	hacerlo := func() {
		c, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		sesiones, escaneos, err := almacen.LimpiarCaducadas(c, retencion)
		if err != nil {
			log.Printf("limpieza: %v", err)
			return
		}
		if sesiones > 0 || escaneos > 0 {
			log.Printf("limpieza: %d sesiones y %d escaneos retirados", sesiones, escaneos)
		}
	}
	hacerlo()
	t := time.NewTicker(6 * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			hacerlo()
		}
	}
}
