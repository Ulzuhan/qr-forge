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
	d := s.DrenarEscaneos(5 * time.Second)
	if d.Escritos != 3 || d.Fallidos != 0 || d.Pendientes != 0 {
		t.Fatalf("drenaje: %+v", d)
	}
	e, err := almacen.Estadisticas(ctx, slug, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if e.Total != 3 {
		t.Fatalf("en la base hay %d escaneos, se encolaron 3", e.Total)
	}
	// Y drenar una cola vacía no cuesta nada ni inventa pérdidas.
	if d := s.DrenarEscaneos(time.Second); !d.Vacio() {
		t.Fatalf("drenar en vacío: %+v", d)
	}
}

// Una escritura que falla NO se cuenta como escrita.
//
// Antes el error se descartaba con `_ =` y el contador subía igual: el registro
// del apagado decía «3 escaneos escritos» con cero filas en la base, que es
// peor que no registrar nada.
func TestUnaEscrituraFallidaNoSeCuentaComoEscrita(t *testing.T) {
	almacen, servidor, _, _ := banco(t)
	// Un escaneo de un QR que no existe: la clave foránea lo rechaza. Es un
	// fallo de escritura de verdad, no simulado.
	servidor.escaneos <- escaneo{QrID: "no-existe"}
	d := servidor.DrenarEscaneos(5 * time.Second)
	if d.Escritos != 0 || d.Fallidos != 1 {
		t.Fatalf("una escritura rechazada se contó mal: %+v", d)
	}
	// Y el rechazo no deja la base tocada.
	if err := almacen.Integridad(context.Background()); err != nil {
		t.Fatalf("la base quedó tocada: %v", err)
	}
}

// Con el plazo agotado, lo que queda en la cola se cuenta como pendiente y no
// se intenta uno por uno hasta que el contenedor mate el proceso.
func TestConElPlazoAgotadoLoQueQuedaSeCuentaComoPendiente(t *testing.T) {
	_, servidor, _, _ := banco(t)
	for i := 0; i < 20; i++ {
		servidor.escaneos <- escaneo{QrID: "no-existe"}
	}
	// Plazo ya vencido al entrar: el primer intento falla, el contexto está
	// agotado y el resto se declara pendiente en vez de reintentarse.
	inicio := time.Now()
	d := servidor.DrenarEscaneos(time.Nanosecond)
	if tardanza := time.Since(inicio); tardanza > 2*time.Second {
		t.Fatalf("el drenaje no respetó el plazo global: tardó %v", tardanza)
	}
	if d.Escritos != 0 || d.Fallidos == 0 || d.Pendientes == 0 {
		t.Fatalf("con el plazo agotado: %+v", d)
	}
	if d.Fallidos+d.Pendientes != 20 {
		t.Fatalf("no cuadran los 20 encolados: %+v", d)
	}
}

func banco(t *testing.T) (*store.Store, *Server, string, string) {
	t.Helper()
	almacen, err := store.Open(t.TempDir() + "/q.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { almacen.Close() })
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
	return almacen, s, u.ID, slug
}

func puntero[T any](v T) *T { return &v }

// Una escritura del consumidor BLOQUEADA se corta al parar.
//
// El plazo de cada escritura colgaba de `context.Background()`, así que una
// arrancada justo antes de la parada seguía por su cuenta hasta cinco segundos
// —fuera del presupuesto de apagado— y la espera de trabajos de fondo se
// quedaba mirándola. Ahora cuelga del contexto del consumidor: cancelarlo la
// corta.
func TestUnaEscrituraBloqueadaSeCortaAlParar(t *testing.T) {
	_, servidor, _, slug := banco(t)

	dentro := make(chan struct{})
	// Una escritura que sólo termina cuando su contexto muere: es exactamente
	// lo que hace una consulta esperando por la única conexión de SQLite.
	servidor.escribirEscaneo = func(ctx context.Context, _ string, _, _ *string) error {
		close(dentro)
		<-ctx.Done()
		return ctx.Err()
	}
	servidor.escaneos <- escaneo{QrID: slug}

	ctx, parar := context.WithCancel(context.Background())
	salio := make(chan struct{})
	go func() { defer close(salio); servidor.AtenderEscaneos(ctx) }()

	<-dentro
	inicio := time.Now()
	parar()
	select {
	case <-salio:
	case <-time.After(2 * time.Second):
		t.Fatal("el consumidor siguió escribiendo después de la cancelación")
	}
	// Y sale enseguida, no al vencer su propio plazo de escritura.
	if tardanza := time.Since(inicio); tardanza > time.Second {
		t.Fatalf("tardó %v en salir: la escritura no heredó la cancelación", tardanza)
	}
}
