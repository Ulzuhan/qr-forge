package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func abrir(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "qrforge.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func usuario(t *testing.T, s *Store, sub string) User {
	t.Helper()
	u, err := s.UpsertUser(context.Background(), sub, sub+"@example.invalid", nil)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// Lo que se guarda en disco son SEGUNDOS Unix, como dejó escrito Drizzle. Con
// milisegundos —los del almacén de SecretDrop— cada fecha ya escrita pasaría a
// significar otra cosa, y `strftime(..., 'unixepoch')` daría el año 56000.
func TestLasFechasSeGuardanEnSegundos(t *testing.T) {
	s := abrir(t)
	fijo := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	s.AhoraCon(func() time.Time { return fijo })
	u := usuario(t, s, "sub-fechas")
	if _, err := s.CrearQR(context.Background(), NuevoQR{
		UserID: u.ID, Type: "dynamic", DestinationURL: ptr("https://example.com"),
		Title: "uno", SlugPedido: "fechas",
	}, 10); err != nil {
		t.Fatal(err)
	}
	var creado int64
	if err := s.db.QueryRow(`SELECT created_at FROM qr_codes WHERE id = 'fechas'`).Scan(&creado); err != nil {
		t.Fatal(err)
	}
	if creado != fijo.Unix() {
		t.Fatalf("en disco %d, se esperaban %d segundos", creado, fijo.Unix())
	}
	// Y la consulta de estadísticas tiene que poder leerla como fecha.
	var dia string
	if err := s.db.QueryRow(`SELECT strftime('%Y-%m-%d', ?, 'unixepoch')`, creado).Scan(&dia); err != nil {
		t.Fatal(err)
	}
	if dia != "2026-09-06" {
		t.Fatalf("SQLite la lee como %s", dia)
	}
}

// Dos creaciones sobre el último hueco de la cuota. Contar antes y crear
// después no basta: las dos cuentan 1 y las dos crean.
func TestLaCuotaNoSeEscapaPorElUltimoHueco(t *testing.T) {
	s := abrir(t)
	u := usuario(t, s, "sub-cuota")
	ctx := context.Background()
	if _, err := s.CrearQR(ctx, NuevoQR{UserID: u.ID, Type: "dynamic",
		DestinationURL: ptr("https://example.com"), Title: "primero"}, 2); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	resultados := make([]error, 4)
	for i := range resultados {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, resultados[i] = s.CrearQR(ctx, NuevoQR{UserID: u.ID, Type: "dynamic",
				DestinationURL: ptr("https://example.com"), Title: "a la vez"}, 2)
		}(i)
	}
	wg.Wait()
	buenos := 0
	for _, err := range resultados {
		if err == nil {
			buenos++
		} else if err != ErrCuota {
			t.Fatalf("error inesperado: %v", err)
		}
	}
	if buenos != 1 {
		t.Fatalf("%d creaciones pasaron con un solo hueco", buenos)
	}
	var total int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM qr_codes WHERE user_id = ?`, u.ID).Scan(&total); err != nil {
		t.Fatal(err)
	}
	if total != 2 {
		t.Fatalf("quedaron %d QR con cuota 2", total)
	}
}

func TestSlugPersonalizadoOcupadoDa409(t *testing.T) {
	s := abrir(t)
	ctx := context.Background()
	a := usuario(t, s, "sub-a")
	b := usuario(t, s, "sub-b")
	base := NuevoQR{Type: "dynamic", DestinationURL: ptr("https://example.com"), Title: "x", SlugPedido: "compartido"}
	base.UserID = a.ID
	if _, err := s.CrearQR(ctx, base, 10); err != nil {
		t.Fatal(err)
	}
	base.UserID = b.ID
	if _, err := s.CrearQR(ctx, base, 10); err != ErrSlugOcupado {
		t.Fatalf("un slug ocupado dio %v", err)
	}
}

// Borrar un QR se lleva sus escaneos; borrar un usuario, sus QR y sus sesiones.
// Sin foreign_keys puesto esto no ocurre y nadie se entera.
func TestLasCascadasFuncionan(t *testing.T) {
	s := abrir(t)
	ctx := context.Background()
	u := usuario(t, s, "sub-cascada")
	slug, err := s.CrearQR(ctx, NuevoQR{UserID: u.ID, Type: "dynamic",
		DestinationURL: ptr("https://example.com"), Title: "con escaneos"}, 10)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RegistrarEscaneo(ctx, slug, ptr("agente"), ptr("ES")); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CrearSesion(ctx, u.ID, time.Hour); err != nil {
		t.Fatal(err)
	}
	if err := s.BorrarQR(ctx, slug, u.ID); err != nil {
		t.Fatal(err)
	}
	if n := cuenta(t, s, "SELECT COUNT(*) FROM qr_scans"); n != 0 {
		t.Fatalf("quedaron %d escaneos de un QR borrado", n)
	}
	if _, err := s.db.Exec(`DELETE FROM users WHERE id = ?`, u.ID); err != nil {
		t.Fatal(err)
	}
	if n := cuenta(t, s, "SELECT COUNT(*) FROM sessions"); n != 0 {
		t.Fatalf("quedaron %d sesiones de un usuario borrado", n)
	}
	if err := s.Integridad(ctx); err != nil {
		t.Fatalf("integridad tras las cascadas: %v", err)
	}
}

// La serie son los últimos 30 días; el total, el histórico retenido. Un escaneo
// al otro lado del día 30 cuenta para uno y no para la otra.
func TestLaSerieYElTotalNoSonLoMismo(t *testing.T) {
	s := abrir(t)
	ctx := context.Background()
	ahora := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	s.AhoraCon(func() time.Time { return ahora })
	u := usuario(t, s, "sub-stats")
	slug, err := s.CrearQR(ctx, NuevoQR{UserID: u.ID, Type: "dynamic",
		DestinationURL: ptr("https://example.com"), Title: "stats"}, 10)
	if err != nil {
		t.Fatal(err)
	}
	// Uno dentro de la ventana, uno fuera por un día.
	insertarEscaneo(t, s, slug, ahora.Add(-2*24*time.Hour), "ES")
	insertarEscaneo(t, s, slug, ahora.Add(-31*24*time.Hour), "PT")
	e, err := s.Estadisticas(ctx, slug, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if e.Total != 2 {
		t.Fatalf("total %d, se esperaban 2 (histórico)", e.Total)
	}
	if len(e.Daily) != 1 || e.Daily[0].Day != "2026-09-04" {
		t.Fatalf("serie %+v: debía traer sólo el de dentro de la ventana", e.Daily)
	}
	if len(e.Countries) != 2 {
		t.Fatalf("países %+v: el top es del histórico, como el total", e.Countries)
	}
	if !e.Desde.Equal(ahora.Add(-VentanaEstadisticas)) {
		t.Fatalf("el periodo de la serie no viaja en la respuesta: %v", e.Desde)
	}
}

// Un QR ajeno responde igual que uno que no existe.
func TestUnQRAjenoNoSeDistingueDeUnoInexistente(t *testing.T) {
	s := abrir(t)
	ctx := context.Background()
	a := usuario(t, s, "sub-dueno")
	b := usuario(t, s, "sub-ajeno")
	slug, err := s.CrearQR(ctx, NuevoQR{UserID: a.ID, Type: "dynamic",
		DestinationURL: ptr("https://example.com"), Title: "mío"}, 10)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.QRDelDueno(ctx, slug, b.ID); err != ErrNoEncontrado {
		t.Fatalf("el ajeno dio %v", err)
	}
	if _, err := s.Estadisticas(ctx, slug, b.ID); err != ErrNoEncontrado {
		t.Fatalf("las estadísticas ajenas dieron %v", err)
	}
	if err := s.ActualizarQR(ctx, slug, b.ID, Cambios{Title: ptr("robado")}); err != ErrNoEncontrado {
		t.Fatalf("editar el ajeno dio %v", err)
	}
	if err := s.BorrarQR(ctx, slug, b.ID); err != ErrNoEncontrado {
		t.Fatalf("borrar el ajeno dio %v", err)
	}
}

// Una base que ya tiene datos no se reinicializa jamás.
func TestUnaBaseAjenaNoSeSustituyePorUnaVacia(t *testing.T) {
	ruta := filepath.Join(t.TempDir(), "ajena.db")
	db, err := sql.Open("sqlite", ruta)
	if err != nil {
		t.Fatal(err)
	}
	// Una base con las tablas pero a la que le falta una columna que usamos.
	if _, err := db.Exec(`CREATE TABLE users (id text primary key);
		CREATE TABLE sessions (id text primary key);
		CREATE TABLE qr_codes (id text primary key);
		CREATE TABLE qr_scans (id integer primary key)`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	s, err := Open(ruta)
	if err == nil {
		s.Close()
		t.Fatal("aceptó una base incompatible")
	}
	// Y no la ha tocado.
	db, _ = sql.Open("sqlite", ruta)
	defer db.Close()
	var columnas int
	if err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('users')`).Scan(&columnas); err != nil {
		t.Fatal(err)
	}
	if columnas != 1 {
		t.Fatalf("la base ajena tiene ahora %d columnas en users: se reescribió", columnas)
	}
}

func TestSesionesCaducanYSeRevocan(t *testing.T) {
	s := abrir(t)
	ctx := context.Background()
	ahora := time.Now().UTC()
	s.AhoraCon(func() time.Time { return ahora })
	u := usuario(t, s, "sub-sesion")
	token, err := s.CrearSesion(ctx, u.ID, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	// El token NO está en la base: lo que hay es su hash.
	if n := cuenta(t, s, "SELECT COUNT(*) FROM sessions WHERE id = '"+token+"'"); n != 0 {
		t.Fatal("la base guarda el token en claro")
	}
	if got, err := s.UsuarioPorSesion(ctx, token); err != nil || got == nil || got.ID != u.ID {
		t.Fatalf("la sesión recién creada no vale: %v %v", got, err)
	}
	// Caducada: deja de valer y además se borra.
	s.AhoraCon(func() time.Time { return ahora.Add(2 * time.Hour) })
	if got, _ := s.UsuarioPorSesion(ctx, token); got != nil {
		t.Fatal("una sesión caducada siguió valiendo")
	}
	if n := cuenta(t, s, "SELECT COUNT(*) FROM sessions"); n != 0 {
		t.Fatal("la sesión caducada no se retiró")
	}
	// Revocación por sub: borra las que haya y dice cuántas.
	s.AhoraCon(func() time.Time { return ahora })
	if _, err := s.CrearSesion(ctx, u.ID, time.Hour); err != nil {
		t.Fatal(err)
	}
	n, err := s.RevocarSesionesDe(ctx, "sub-sesion")
	if err != nil || n != 1 {
		t.Fatalf("revocación: %d %v", n, err)
	}
	if n, _ := s.RevocarSesionesDe(ctx, "sub-que-no-existe"); n != 0 {
		t.Fatal("revocar un sub desconocido dijo que revocó algo")
	}
}

func ptr[T any](v T) *T { return &v }

func cuenta(t *testing.T, s *Store, q string) int {
	t.Helper()
	var n int
	if err := s.db.QueryRow(q).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func insertarEscaneo(t *testing.T, s *Store, qrID string, cuando time.Time, pais string) {
	t.Helper()
	if _, err := s.db.Exec(`INSERT INTO qr_scans (qr_id, country, scanned_at) VALUES (?, ?, ?)`,
		qrID, pais, cuando.Unix()); err != nil {
		t.Fatal(err)
	}
}
