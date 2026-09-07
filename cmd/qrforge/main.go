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
	"sync"
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

// verificar corre las comprobaciones CARAS de la base: la estructural y la de
// claves foráneas, que es distinta y hay que pedir aparte.
//
// Va aquí y no en el healthcheck: ahí se ejecutarían cada treinta segundos
// recorriendo la base entera y ocupando la única conexión de la aplicación.
// Esto es para la validación de un despliegue y para mantenimiento, con el
// servicio parado o sabiendo que va a costar.
func verificar() int {
	ruta := os.Getenv("QRFORGE_DB_PATH")
	if ruta == "" {
		ruta = "/data/qrforge.db"
	}
	almacen, err := store.Open(ruta)
	if err != nil {
		log.Printf("no se pudo abrir la base: %v", err)
		return 1
	}
	defer almacen.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	if err := almacen.Integridad(ctx); err != nil {
		log.Printf("la base NO está íntegra: %v", err)
		return 1
	}
	log.Print("integridad y claves foráneas: correctas")
	return 0
}

func main() {
	if len(os.Args) > 1 {
		switch {
		case os.Args[1] == "health" && len(os.Args) == 2:
			os.Exit(sonda())
		case os.Args[1] == "verificar" && len(os.Args) == 2:
			os.Exit(verificar())
		default:
			log.Fatalf("uso: %s [health|verificar]", os.Args[0])
		}
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

	// El consumidor de escaneos vive en su PROPIO contexto, que se cancela más
	// tarde que el HTTP: mientras se drenan las conexiones abiertas todavía
	// pueden llegar escaneos, y cancelarlo a la vez los perdería.
	ctxTareas, pararTareas := context.WithCancel(context.Background())
	var tareas sync.WaitGroup
	tareas.Add(2)
	go func() { defer tareas.Done(); servidor.AtenderEscaneos(ctxTareas) }()
	go func() { defer tareas.Done(); limpiar(ctxTareas, almacen, retencion) }()

	// El cierre se ESPERA. Antes iba en una goroutine suelta y `ListenAndServe`
	// devolvía ErrServerClosed en cuanto empezaba el apagado: main seguía, y
	// cerraba SQLite mientras las peticiones en vuelo todavía la usaban.
	cerrado := make(chan struct{})
	go func() {
		defer close(cerrado)
		<-ctx.Done()
		apagar(http1, servidor, almacen, pararTareas, &tareas, plazosPorDefecto())
	}()

	log.Printf("qrforge escuchando en %s, base %s, origen impreso %s", http1.Addr, ruta, publica)
	if err := http1.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	<-cerrado
	log.Print("qrforge parado")
}

// Plazos reparte el presupuesto de parada. Se inyecta para poder probar la
// secuencia en milisegundos en vez de esperar segundos de verdad.
type Plazos struct {
	// CierreHTTP es lo que se le da a `Shutdown` para drenar por las buenas.
	CierreHTTP time.Duration
	// Manejadores es lo que se espera DESPUÉS de cerrar a la fuerza, porque
	// `Close` devuelve con los manejadores todavía dentro.
	Manejadores time.Duration
	// Tareas acota la espera de los trabajos de fondo. Sin plazo, uno colgado
	// deja el apagado esperando hasta que el contenedor mate el proceso.
	Tareas time.Duration
	// Drenaje es lo que se le da a vaciar la cola de escaneos.
	Drenaje time.Duration
}

// El presupuesto de parada, y de dónde sale ese número.
//
// El contenedor no declara `stop_grace_period`, así que Docker manda SIGTERM y
// SIGKILL **10 segundos** después. Todo el apagado tiene que caber ahí dentro:
// con los 15 s de cierre HTTP y 5 s de drenaje que había antes, el proceso
// moría a mitad del drenaje y se perdía justo lo que se quería salvar.
//
// 5 + 1 + 1 + 1 son ocho en el peor caso, con dos de margen. Si alguna vez hace
// falta más, se sube `stop_grace_period` primero y estos números después, en
// ese orden.
func plazosPorDefecto() Plazos {
	return Plazos{
		CierreHTTP:  5 * time.Second,
		Manejadores: time.Second,
		Tareas:      time.Second,
		Drenaje:     time.Second,
	}
}

// apagar es la secuencia de parada, y cada paso depende del anterior:
//
//  1. que no queden peticiones en vuelo —o forzarlas y ESPERAR a que los
//     manejadores salgan, porque `Close` no los espera—,
//  2. que los trabajos de fondo hayan terminado, con plazo,
//  3. escribir lo que quedara en la cola de escaneos,
//  4. y sólo entonces cerrar la base.
func apagar(http1 *http.Server, servidor *httpapi.Server, almacen *store.Store,
	pararTareas context.CancelFunc, tareas *sync.WaitGroup, plazos Plazos) {
	cierre, cancelar := context.WithTimeout(context.Background(), plazos.CierreHTTP)
	defer cancelar()
	if err := http1.Shutdown(cierre); err != nil {
		// El plazo se agotó con conexiones todavía abiertas. Se cortan a la
		// fuerza —una respuesta truncada es mala, y una consulta contra una base
		// cerrada es peor— y después se ESPERA a que los manejadores salgan:
		// `Close` cierra las conexiones y vuelve, con el manejador todavía
		// dentro y todavía consultando SQLite.
		log.Printf("el cierre HTTP no terminó en %s (%v): se cierran las conexiones a la fuerza", plazos.CierreHTTP, err)
		if err := http1.Close(); err != nil {
			log.Printf("al forzar el cierre de conexiones: %v", err)
		}
		if !servidor.EsperarManejadores(plazos.Manejadores) {
			// Se dice y se sigue: quedarse aquí sólo garantiza el SIGKILL.
			log.Printf("quedaron manejadores sin terminar tras %s; se cierra igualmente", plazos.Manejadores)
		}
	}

	pararTareas()
	if !esperarCon(tareas, plazos.Tareas) {
		log.Printf("los trabajos de fondo no terminaron en %s; se cierra igualmente", plazos.Tareas)
	}

	if d := servidor.DrenarEscaneos(plazos.Drenaje); !d.Vacio() {
		log.Printf("al cerrar: %d escaneos escritos, %d con error de escritura, %d sin escribir por plazo",
			d.Escritos, d.Fallidos, d.Pendientes)
	}
	if err := almacen.Close(); err != nil {
		log.Printf("al cerrar la base: %v", err)
	}
}

// esperarCon espera a un WaitGroup con plazo. Devuelve false si venció.
func esperarCon(wg *sync.WaitGroup, plazo time.Duration) bool {
	listo := make(chan struct{})
	go func() {
		wg.Wait()
		close(listo)
	}()
	select {
	case <-listo:
		return true
	case <-time.After(plazo):
		return false
	}
}

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
