package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
)

// ErrCuota y ErrSlugOcupado son los dos rechazos que la API traduce a 507 y 409.
var (
	ErrCuota       = errors.New("cuota de QR alcanzada")
	ErrSlugOcupado = errors.New("slug ya ocupado")
)

const alfabetoSlug = "abcdefghjkmnpqrstuvwxyz23456789"

// SlugAleatorio: sin 0/O ni 1/l/I, con aleatoriedad criptográfica.
//
// El slug es público —va impreso dentro del QR— y eso no lo hace irrelevante:
// con un generador predecible, quien cree unos cuantos QR propios puede
// adivinar los que generen otros en ese momento, ver a dónde apuntan y
// contaminarles las analíticas.
func SlugAleatorio(largo int) (string, error) {
	limite := big.NewInt(int64(len(alfabetoSlug)))
	var b strings.Builder
	for i := 0; i < largo; i++ {
		n, err := rand.Int(rand.Reader, limite)
		if err != nil {
			return "", err
		}
		b.WriteByte(alfabetoSlug[n.Int64()])
	}
	return b.String(), nil
}

// NuevoQR es lo que la API ya ha validado. El almacén no revalida formatos:
// decide cuota, slug y colisión, que es lo que necesita exclusión de verdad.
type NuevoQR struct {
	UserID         string
	Type           string
	DestinationURL *string
	StaticPayload  *string
	StaticKind     *string
	Title          string
	Description    *string
	Campaign       *string
	ExpiresAt      *time.Time
	// SlugPedido vacío significa «asigna uno aleatorio».
	SlugPedido string
}

// CrearQR resuelve cuota, slug y alta EN UNA TRANSACCIÓN.
//
// Contar antes y crear después no es una garantía: dos peticiones sobre el
// último hueco de la cuota cuentan las dos 999 y crean las dos. Aquí el conteo
// y el alta comparten transacción, así que el segundo espera y ve 1000.
func (s *Store) CrearQR(ctx context.Context, nuevo NuevoQR, maxPorUsuario int) (string, error) {
	ahora := s.now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var cuantos int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM qr_codes WHERE user_id = ?`, nuevo.UserID).Scan(&cuantos); err != nil {
		return "", err
	}
	if cuantos >= maxPorUsuario {
		return "", ErrCuota
	}

	var expira any
	if nuevo.ExpiresAt != nil {
		expira = segundos(*nuevo.ExpiresAt)
	}
	insertar := func(slug string) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO qr_codes (id, user_id, type, destination_url, static_payload, static_kind,
			 title, description, campaign, is_active, expires_at, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
			slug, nuevo.UserID, nuevo.Type, nuevo.DestinationURL, nuevo.StaticPayload, nuevo.StaticKind,
			nuevo.Title, nuevo.Description, nuevo.Campaign, expira, segundos(ahora), segundos(ahora))
		return err
	}

	if nuevo.SlugPedido != "" {
		if err := insertar(nuevo.SlugPedido); err != nil {
			if esColision(err) {
				return "", ErrSlugOcupado
			}
			return "", err
		}
		return nuevo.SlugPedido, tx.Commit()
	}

	// Aleatorio: se intenta insertar y se reintenta si choca. Preguntar antes si
	// existe y luego insertar deja una ventana entre las dos consultas; el
	// UNIQUE de la tabla no la deja.
	for intento := 0; intento < 20; intento++ {
		largo := 7
		if intento >= 10 {
			largo = 10
		}
		slug, err := SlugAleatorio(largo)
		if err != nil {
			return "", err
		}
		err = insertar(slug)
		if err == nil {
			return slug, tx.Commit()
		}
		if !esColision(err) {
			return "", err
		}
	}
	return "", errors.New("no se pudo asignar un slug libre")
}

func esColision(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "unique constraint failed")
}

const columnasQR = `id, user_id, type, destination_url, static_payload, static_kind,
	title, description, campaign, is_active, expires_at, created_at, updated_at`

func escanearQR(dst *QR, sc interface{ Scan(...any) error }) error {
	var activo int
	var expira sql.NullInt64
	var creado, actualizado int64
	if err := sc.Scan(&dst.ID, &dst.UserID, &dst.Type, &dst.DestinationURL, &dst.StaticPayload,
		&dst.StaticKind, &dst.Title, &dst.Description, &dst.Campaign, &activo, &expira,
		&creado, &actualizado); err != nil {
		return err
	}
	dst.IsActive = activo != 0
	if expira.Valid {
		t := deSegundos(expira.Int64)
		dst.ExpiresAt = &t
	}
	dst.CreatedAt, dst.UpdatedAt = deSegundos(creado), deSegundos(actualizado)
	return nil
}

// ListarQR: los del dueño, con su recuento de escaneos, más nuevos primero.
func (s *Store) ListarQR(ctx context.Context, userID string) ([]QRConCuenta, error) {
	filas, err := s.db.QueryContext(ctx,
		`SELECT q.id, q.user_id, q.type, q.destination_url, q.static_payload, q.static_kind,
		 q.title, q.description, q.campaign, q.is_active, q.expires_at, q.created_at, q.updated_at,
		 COUNT(s.id) AS scan_count
		 FROM qr_codes q LEFT JOIN qr_scans s ON s.qr_id = q.id
		 WHERE q.user_id = ? GROUP BY q.id ORDER BY q.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer filas.Close()
	// Se acumula todo aquí y no se lanza otra consulta con filas abiertas: con
	// una sola conexión en el pool, eso se bloquearía contra sí mismo.
	lista := []QRConCuenta{}
	for filas.Next() {
		var q QRConCuenta
		var activo int
		var expira sql.NullInt64
		var creado, actualizado int64
		if err := filas.Scan(&q.ID, &q.UserID, &q.Type, &q.DestinationURL, &q.StaticPayload,
			&q.StaticKind, &q.Title, &q.Description, &q.Campaign, &activo, &expira,
			&creado, &actualizado, &q.ScanCount); err != nil {
			return nil, err
		}
		q.IsActive = activo != 0
		if expira.Valid {
			t := deSegundos(expira.Int64)
			q.ExpiresAt = &t
		}
		q.CreatedAt, q.UpdatedAt = deSegundos(creado), deSegundos(actualizado)
		lista = append(lista, q)
	}
	return lista, filas.Err()
}

// QRDelDueno: un QR ajeno responde igual que uno inexistente.
func (s *Store) QRDelDueno(ctx context.Context, id, userID string) (*QR, error) {
	var q QR
	fila := s.db.QueryRowContext(ctx, `SELECT `+columnasQR+` FROM qr_codes WHERE id = ? AND user_id = ?`, id, userID)
	if err := escanearQR(&q, fila); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNoEncontrado
		}
		return nil, err
	}
	return &q, nil
}

// QRPorSlug es la consulta pública del redirect: sin dueño y sin sesión.
func (s *Store) QRPorSlug(ctx context.Context, slug string) (*QR, error) {
	var q QR
	fila := s.db.QueryRowContext(ctx, `SELECT `+columnasQR+` FROM qr_codes WHERE id = ?`, slug)
	if err := escanearQR(&q, fila); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNoEncontrado
		}
		return nil, err
	}
	return &q, nil
}

// Cambios son los campos que PATCH puede tocar. Un puntero nil significa «no
// venía en el cuerpo»; un puntero a nil interior, «ponlo a null».
type Cambios struct {
	Title          *string
	Description    **string
	Campaign       **string
	IsActive       *bool
	ExpiresAt      **time.Time
	DestinationURL *string
	StaticPayload  *string
}

func (s *Store) ActualizarQR(ctx context.Context, id, userID string, c Cambios) error {
	sets := []string{"updated_at = ?"}
	args := []any{segundos(s.now().UTC())}
	if c.Title != nil {
		sets = append(sets, "title = ?")
		args = append(args, *c.Title)
	}
	if c.Description != nil {
		sets = append(sets, "description = ?")
		args = append(args, *c.Description)
	}
	if c.Campaign != nil {
		sets = append(sets, "campaign = ?")
		args = append(args, *c.Campaign)
	}
	if c.IsActive != nil {
		sets = append(sets, "is_active = ?")
		args = append(args, boolAEntero(*c.IsActive))
	}
	if c.ExpiresAt != nil {
		sets = append(sets, "expires_at = ?")
		if *c.ExpiresAt == nil {
			args = append(args, nil)
		} else {
			args = append(args, segundos(**c.ExpiresAt))
		}
	}
	if c.DestinationURL != nil {
		sets = append(sets, "destination_url = ?")
		args = append(args, *c.DestinationURL)
	}
	if c.StaticPayload != nil {
		sets = append(sets, "static_payload = ?")
		args = append(args, *c.StaticPayload)
	}
	args = append(args, id, userID)
	res, err := s.db.ExecContext(ctx,
		fmt.Sprintf(`UPDATE qr_codes SET %s WHERE id = ? AND user_id = ?`, strings.Join(sets, ", ")), args...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNoEncontrado
	}
	return nil
}

func (s *Store) BorrarQR(ctx context.Context, id, userID string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM qr_codes WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNoEncontrado
	}
	return nil
}

func boolAEntero(b bool) int {
	if b {
		return 1
	}
	return 0
}

// RegistrarEscaneo anota un escaneo. No guarda IP ni Referer: el destino no
// necesita saberlos y guardarlos convertiría la analítica en un registro de
// visitas de personas concretas.
func (s *Store) RegistrarEscaneo(ctx context.Context, qrID string, userAgent, pais *string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO qr_scans (qr_id, ip, user_agent, referer, country, scanned_at)
		 VALUES (?, NULL, ?, NULL, ?, ?)`,
		qrID, userAgent, pais, segundos(s.now().UTC()))
	return err
}
