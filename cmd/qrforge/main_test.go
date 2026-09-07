package main

import (
	"context"
	"net"
	"net/http"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/Ulzuhan/qr-forge/internal/httpapi"
	"github.com/Ulzuhan/qr-forge/internal/store"
)

// Una petición en vuelo se termina antes de cerrar la base.
//
// Es el caso que motivó ordenar el apagado: `ListenAndServe` devuelve
// ErrServerClosed en cuanto el cierre EMPIEZA, así que sin esperar a que
// termine se cerraba SQLite con peticiones todavía consultándola.
func TestElApagadoEsperaAUnaPeticionEnVuelo(t *testing.T) {
	almacen, err := store.Open(filepath.Join(t.TempDir(), "q.db"))
	if err != nil {
		t.Fatal(err)
	}
	servidor, err := httpapi.New(almacen, nil, "https://qr.example.invalid", time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	empezada := make(chan struct{})
	respondida := make(chan error, 1)
	mux := http.NewServeMux()
	mux.HandleFunc("/lenta", func(w http.ResponseWriter, r *http.Request) {
		close(empezada)
		// Mientras duerme llega la parada. Al despertar consulta la base: si se
		// hubiera cerrado ya, esto fallaría.
		time.Sleep(300 * time.Millisecond)
		respondida <- almacen.Vivo(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	escucha, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: mux}
	go srv.Serve(escucha)

	go func() {
		_, _ = http.Get("http://" + escucha.Addr().String() + "/lenta")
	}()
	<-empezada

	ctxTareas, pararTareas := context.WithCancel(context.Background())
	var tareas sync.WaitGroup
	tareas.Add(1)
	go func() { defer tareas.Done(); <-ctxTareas.Done() }()

	apagar(srv, servidor, almacen, pararTareas, &tareas, plazosDePrueba())

	select {
	case err := <-respondida:
		if err != nil {
			t.Fatalf("la petición en vuelo encontró la base cerrada: %v", err)
		}
	default:
		t.Fatal("el apagado no esperó a la petición en vuelo")
	}
	// Y la base sí queda cerrada al final.
	if err := almacen.Vivo(context.Background()); err == nil {
		t.Fatal("la base siguió abierta después del apagado")
	}
}

// Plazos de prueba: milisegundos en vez de segundos. La secuencia es la misma;
// lo único que cambia es no tener que esperarla de verdad.
func plazosDePrueba() Plazos {
	return Plazos{
		CierreHTTP:  500 * time.Millisecond,
		Manejadores: 2 * time.Second,
		Tareas:      500 * time.Millisecond,
		Drenaje:     500 * time.Millisecond,
	}
}

// Una petición que dura MÁS que el plazo de Shutdown.
//
// `Shutdown` vence, se cierran las conexiones a la fuerza y `Close` vuelve con
// el manejador todavía dentro. Sin esperarlo, lo siguiente es cerrar SQLite —y
// el manejador sigue consultándola—. Aquí se comprueba que sale antes.
func TestUnaPeticionQueSobreviveAlPlazoDeShutdown(t *testing.T) {
	almacen, err := store.Open(filepath.Join(t.TempDir(), "q.db"))
	if err != nil {
		t.Fatal(err)
	}
	servidor, err := httpapi.New(almacen, nil, "https://qr.example.invalid", time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	empezada := make(chan struct{})
	resultado := make(chan error, 1)
	mux := http.NewServeMux()
	mux.HandleFunc("/larga", func(w http.ResponseWriter, r *http.Request) {
		close(empezada)
		// Más que el plazo de cierre: obliga a forzar.
		time.Sleep(900 * time.Millisecond)
		// Y al despertar consulta la base. Si se hubiera cerrado ya, falla.
		resultado <- almacen.Vivo(context.Background())
	})
	escucha, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	// El contador de manejadores vive en el handler del servidor, así que la
	// petición tiene que entrar por ahí.
	srv := &http.Server{Handler: servidor.Contando(mux)}
	go srv.Serve(escucha)
	go func() { _, _ = http.Get("http://" + escucha.Addr().String() + "/larga") }()
	<-empezada

	ctxTareas, pararTareas := context.WithCancel(context.Background())
	var tareas sync.WaitGroup
	tareas.Add(1)
	go func() { defer tareas.Done(); <-ctxTareas.Done() }()

	apagar(srv, servidor, almacen, pararTareas, &tareas, plazosDePrueba())

	select {
	case err := <-resultado:
		if err != nil {
			t.Fatalf("el manejador encontró la base cerrada: %v", err)
		}
	default:
		t.Fatal("se cerró la base sin esperar al manejador que seguía dentro")
	}
	if err := almacen.Vivo(context.Background()); err == nil {
		t.Fatal("la base siguió abierta al final")
	}
}

// Un trabajo de fondo que no termina no puede dejar el apagado esperando: sin
// plazo, la única salida era el SIGKILL del contenedor.
func TestUnConsumidorBloqueadoNoDejaElApagadoColgado(t *testing.T) {
	almacen, err := store.Open(filepath.Join(t.TempDir(), "q.db"))
	if err != nil {
		t.Fatal(err)
	}
	servidor, err := httpapi.New(almacen, nil, "https://qr.example.invalid", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: servidor.Handler()}

	// Una tarea que ignora la cancelación: es el caso que hay que acotar.
	_, pararTareas := context.WithCancel(context.Background())
	var tareas sync.WaitGroup
	tareas.Add(1)
	sueltala := make(chan struct{})
	go func() { defer tareas.Done(); <-sueltala }()
	defer close(sueltala)

	plazos := plazosDePrueba()
	inicio := time.Now()
	apagar(srv, servidor, almacen, pararTareas, &tareas, plazos)
	tardanza := time.Since(inicio)

	// Tiene que haber esperado su plazo y haber SEGUIDO, no colgarse.
	if tardanza < plazos.Tareas {
		t.Fatalf("no esperó a los trabajos de fondo: %v", tardanza)
	}
	if tardanza > plazos.CierreHTTP+plazos.Manejadores+plazos.Tareas+plazos.Drenaje {
		t.Fatalf("el apagado se pasó del presupuesto: %v", tardanza)
	}
	if err := almacen.Vivo(context.Background()); err == nil {
		t.Fatal("no llegó a cerrar la base")
	}
}
