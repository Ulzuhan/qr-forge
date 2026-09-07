package httpapi

import (
	"context"
	"testing"
	"time"

	"github.com/Ulzuhan/qr-forge/internal/store"
)

// Al parar, lo que quede en la cola de escaneos se escribe.
//
// Antes no: el consumidor se cancelaba con el mismo contexto que el HTTP y el
// proceso se iba con la cola llena. Son pocos escaneos y son best-effort, pero
// perderlos en CADA despliegue es una pérdida sistemática, no un accidente.
func TestAlPararSeEscribeLoQueQuedabaEnLaCola(t *testing.T) {
	almacen, err := store.Open(t.TempDir() + "/q.db")
	if err != nil {
		t.Fatal(err)
	}
	defer almacen.Close()
	ctx := context.Background()
	u, err := almacen.UpsertUser(ctx, "sub", "s@example.invalid", nil)
	if err != nil {
		t.Fatal(err)
	}
	slug, err := almacen.CrearQR(ctx, store.NuevoQR{UserID: u.ID, Type: "dynamic",
		DestinationURL: puntero("https://example.com"), Title: "t"}, 10)
	if err != nil {
		t.Fatal(err)
	}

	s, err := New(almacen, nil, "https://qr.example.invalid", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	// Tres escaneos encolados y NADIE consumiendo: es el estado en el que queda
	// el proceso cuando llega la señal de parada.
	for i := 0; i < 3; i++ {
		s.escaneos <- escaneo{QrID: slug}
	}
	escritos, perdidos := s.DrenarEscaneos(5 * time.Second)
	if escritos != 3 || perdidos != 0 {
		t.Fatalf("drenaje: %d escritos, %d perdidos", escritos, perdidos)
	}
	e, err := almacen.Estadisticas(ctx, slug, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if e.Total != 3 {
		t.Fatalf("en la base hay %d escaneos, se encolaron 3", e.Total)
	}
	// Y drenar una cola vacía no cuesta nada ni inventa pérdidas.
	if escritos, perdidos := s.DrenarEscaneos(time.Second); escritos != 0 || perdidos != 0 {
		t.Fatalf("drenar en vacío: %d/%d", escritos, perdidos)
	}
}

func puntero[T any](v T) *T { return &v }
