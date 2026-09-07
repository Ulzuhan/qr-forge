// Package store es la única puerta a SQLite: esquema, ajustes por conexión,
// consultas y retención.
//
// Tres decisiones que no son de estilo:
//
//   - Las fechas se guardan en SEGUNDOS Unix, que es lo que dejó escrito Drizzle
//     con `integer({mode:"timestamp"})` y lo que da por hecho la consulta de
//     estadísticas al usar `strftime(..., 'unixepoch')`. Los milisegundos del
//     almacén de SecretDrop NO se trasladan aquí: cambiarían el significado de
//     cada fila ya escrita.
//   - Un solo escritor y una sola conexión. Es un proceso, y con SQLite eso
//     evita la mitad de los problemas antes de tenerlos. A cambio hay que no
//     dejar filas abiertas mientras se lanza otra consulta: bloquearía el pool
//     contra sí mismo.
//   - Una base que ya existe NUNCA se reinicializa. Se valida y, si no encaja,
//     se rechaza con un diagnóstico que no filtra su contenido.
package store

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var esquema string

// Tablas y columnas que una base tiene que traer para que este binario la
// acepte. No es el esquema entero: es lo que se usa.
var requeridas = map[string][]string{
	"users":    {"id", "oidc_sub", "email", "name", "created_at", "last_seen_at"},
	"sessions": {"id", "user_id", "created_at", "expires_at"},
	"qr_codes": {"id", "user_id", "type", "destination_url", "static_payload", "static_kind",
		"title", "description", "campaign", "is_active", "expires_at", "created_at", "updated_at"},
	"qr_scans": {"id", "qr_id", "ip", "user_agent", "referer", "country", "scanned_at"},
}

type Store struct {
	db  *sql.DB
	now func() time.Time
}

// Open abre la base, aplica los ajustes por conexión y la prepara. Crea el
// esquema SÓLO si la base está vacía.
func Open(ruta string) (*Store, error) {
	// Los ajustes van en el DSN para que valgan en CADA conexión: aplicarlos con
	// un Exec suelto sólo alcanza a la conexión que lo ejecute, y el pool abre
	// las que quiera. foreign_keys hay que pedirlo explícitamente: SQLite lo trae
	// apagado de fábrica y sin él las cascadas de borrado no ocurren.
	dsn := ruta + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("no se pudo abrir la base: %w", err)
	}
	// Un escritor, una conexión: simplicidad primero.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("la base no responde: %w", err)
	}
	s := &Store{db: db, now: time.Now}
	if err := s.preparar(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

// AhoraCon inyecta el reloj. Sólo para pruebas: el TTL y la retención se miden
// en horas y días, y esperarlas de verdad no prueba nada.
func (s *Store) AhoraCon(f func() time.Time) { s.now = f }

func (s *Store) preparar() error {
	// Dos cuentas, no una: cuántas tablas hay EN TOTAL y cuántas son nuestras.
	//
	// Contando sólo las nuestras, una base de otra aplicación da cero y se
	// trataba como instalación nueva: no se borraba nada, pero se le añadía el
	// esquema de QR-Forge encima, que contradice justo lo que este código
	// promete. Una base con tablas que no son suyas se rechaza.
	var propias, totales int
	err := s.db.QueryRow(
		`SELECT
		   (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('users','sessions','qr_codes','qr_scans')),
		   (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%')`).
		Scan(&propias, &totales)
	if err != nil {
		return fmt.Errorf("no se pudo inspeccionar la base: %w", err)
	}
	if totales == 0 {
		// Vacía de verdad. Es el único momento en que se escribe el esquema.
		if _, err := s.db.Exec(esquema); err != nil {
			return fmt.Errorf("no se pudo crear el esquema: %w", err)
		}
		return s.comprobarAjustes()
	}
	if propias == 0 {
		return errors.New("la base tiene tablas que no son de QR-Forge; no se escribe encima de una base ajena")
	}
	if propias != len(requeridas) {
		// Media base es peor que ninguna: no se completa a ciegas.
		return errors.New("la base existe pero le faltan tablas de QR-Forge; no se reinicializa una base con datos")
	}
	if err := s.validar(); err != nil {
		return err
	}
	return s.comprobarAjustes()
}

// validar comprueba que están las columnas que se usan. El mensaje nombra la
// tabla y la columna que falta, y nada de su contenido.
func (s *Store) validar() error {
	for tabla, columnas := range requeridas {
		filas, err := s.db.Query("SELECT name FROM pragma_table_info(?)", tabla)
		if err != nil {
			return fmt.Errorf("no se pudo leer la forma de %s: %w", tabla, err)
		}
		presentes := map[string]bool{}
		for filas.Next() {
			var nombre string
			if err := filas.Scan(&nombre); err != nil {
				filas.Close()
				return err
			}
			presentes[nombre] = true
		}
		filas.Close()
		if err := filas.Err(); err != nil {
			return err
		}
		var faltan []string
		for _, c := range columnas {
			if !presentes[c] {
				faltan = append(faltan, c)
			}
		}
		if len(faltan) > 0 {
			return fmt.Errorf("la base no es compatible: a %s le faltan %s", tabla, strings.Join(faltan, ", "))
		}
	}
	return nil
}

// comprobarAjustes verifica en la propia conexión que los pragmas quedaron
// puestos. Pedirlos en el DSN y no comprobarlos deja la puerta a un driver que
// los ignore en silencio; foreign_keys apagado no falla, simplemente deja de
// borrar en cascada.
func (s *Store) comprobarAjustes() error {
	var fk int
	if err := s.db.QueryRow("PRAGMA foreign_keys").Scan(&fk); err != nil {
		return err
	}
	if fk != 1 {
		return errors.New("foreign_keys quedó apagado: las cascadas de borrado no funcionarían")
	}
	var modo string
	if err := s.db.QueryRow("PRAGMA journal_mode").Scan(&modo); err != nil {
		return err
	}
	if !strings.EqualFold(modo, "wal") {
		return fmt.Errorf("journal_mode quedó en %q y se esperaba WAL", modo)
	}
	return nil
}

// Integridad corre las dos comprobaciones que importan tras un cambio de
// implementación: la estructural y la de claves foráneas, que es distinta y
// hay que pedir aparte.
//
// Es CARA y recorre la base entera. Va en la validación del despliegue y en
// mantenimiento —`qrforge verificar`—, nunca en el healthcheck: ahí se
// ejecutaría cada treinta segundos ocupando la única conexión que tiene toda
// la aplicación.
func (s *Store) Integridad(ctx context.Context) error {
	var resultado string
	if err := s.db.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&resultado); err != nil {
		return err
	}
	if !strings.EqualFold(resultado, "ok") {
		return fmt.Errorf("integrity_check: %s", resultado)
	}
	filas, err := s.db.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return err
	}
	defer filas.Close()
	if filas.Next() {
		return errors.New("foreign_key_check encontró filas huérfanas")
	}
	return filas.Err()
}

// Vivo es la sonda del healthcheck: barata y acotada. Toca la base de verdad
// —una tabla nuestra, no un `SELECT 1` que responde con el fichero corrupto—
// pero sin recorrerla.
func (s *Store) Vivo(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var uno int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM qr_codes LIMIT 1`).Scan(&uno)
	// Sin filas es perfectamente sano: la tabla existe y se pudo leer, que es
	// justo lo que se está preguntando.
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	return err
}

// segundos y deSegundos son la frontera con el disco. Todo lo demás en Go usa
// time.Time; en SQLite son enteros de segundos.
func segundos(t time.Time) int64 { return t.Unix() }

func deSegundos(v int64) time.Time { return time.Unix(v, 0).UTC() }
