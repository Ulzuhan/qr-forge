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

	apagar(srv, servidor, almacen, pararTareas, &tareas)

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
