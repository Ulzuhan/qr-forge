package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"
)

// ErrNoEncontrado lo devuelven las consultas por dueño. Un QR ajeno y uno que
// no existe dan lo mismo a propósito: quien pregunta no debe poder distinguir.
var ErrNoEncontrado = errors.New("no encontrado")

// UpsertUser trae al usuario de una identidad del proveedor, creándolo la
// primera vez. La búsqueda es por `oidc_sub` y no por email: cambiar de correo
// no convierte a alguien en otra persona ni le quita sus QRs.
//
// En una transacción porque son un SELECT y un INSERT/UPDATE que tienen que
// decidirse juntos: dos entradas simultáneas del mismo sub crearían dos filas.
func (s *Store) UpsertUser(ctx context.Context, sub, email string, name *string) (User, error) {
	ahora := s.now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()

	var u User
	var creado, visto int64
	err = tx.QueryRowContext(ctx,
		`SELECT id, oidc_sub, email, name, created_at, last_seen_at FROM users WHERE oidc_sub = ?`, sub).
		Scan(&u.ID, &u.OidcSub, &u.Email, &u.Name, &creado, &visto)
	switch {
	case err == nil:
		// El email y el nombre son del proveedor: se refrescan en cada entrada.
		if _, err := tx.ExecContext(ctx,
			`UPDATE users SET email = ?, name = ?, last_seen_at = ? WHERE id = ?`,
			email, name, segundos(ahora), u.ID); err != nil {
			return User{}, err
		}
		u.Email, u.Name = email, name
		u.CreatedAt, u.LastSeenAt = deSegundos(creado), ahora
	case errors.Is(err, sql.ErrNoRows):
		u = User{ID: uuid(), OidcSub: sub, Email: email, Name: name, CreatedAt: ahora, LastSeenAt: ahora}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO users (id, oidc_sub, email, name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`,
			u.ID, u.OidcSub, u.Email, u.Name, segundos(ahora), segundos(ahora)); err != nil {
			return User{}, err
		}
	default:
		return User{}, err
	}
	return u, tx.Commit()
}

// tokenID es lo que se guarda: el SHA-256 del token, nunca el token. Quien lea
// la base no puede suplantar a nadie con lo que hay dentro.
func tokenID(token string) string {
	suma := sha256.Sum256([]byte(token))
	return hex.EncodeToString(suma[:])
}

// CrearSesion devuelve el token que va en la cookie. La fila lleva su hash.
func (s *Store) CrearSesion(ctx context.Context, userID string, ttl time.Duration) (string, error) {
	crudo := make([]byte, 32)
	if _, err := rand.Read(crudo); err != nil {
		return "", err
	}
	token := hex.EncodeToString(crudo)
	ahora := s.now().UTC()
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
		tokenID(token), userID, segundos(ahora), segundos(ahora.Add(ttl))); err != nil {
		return "", err
	}
	return token, nil
}

// UsuarioPorSesion resuelve la cookie. Una sesión caducada se borra al verla:
// la tabla no crece sola y la caducidad se aplica de verdad, no sólo se mira.
func (s *Store) UsuarioPorSesion(ctx context.Context, token string) (*User, error) {
	if token == "" {
		return nil, nil
	}
	id := tokenID(token)
	var u User
	var creado, visto, expira int64
	err := s.db.QueryRowContext(ctx,
		`SELECT u.id, u.oidc_sub, u.email, u.name, u.created_at, u.last_seen_at, s.expires_at
		 FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, id).
		Scan(&u.ID, &u.OidcSub, &u.Email, &u.Name, &creado, &visto, &expira)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if deSegundos(expira).Before(s.now().UTC()) {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id)
		return nil, nil
	}
	u.CreatedAt, u.LastSeenAt = deSegundos(creado), deSegundos(visto)
	return &u, nil
}

func (s *Store) CerrarSesion(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, tokenID(token))
	return err
}

// RevocarSesionesDe borra todas las sesiones de un `sub`. Es lo que aplica el
// aviso de cierre del proveedor: revocar es borrar filas, no anotar una marca
// en un fichero aparte.
//
// Devuelve cuántas se borraron para que quien avisa pueda distinguir «no había
// ninguna» de «se cerraron»; y para que el JTI se marque SÓLO si esto salió
// bien, que es la diferencia entre una revocación aplicada y una perdida.
func (s *Store) RevocarSesionesDe(ctx context.Context, sub string) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE oidc_sub = ?)`, sub)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// LimpiarCaducadas borra sesiones vencidas y escaneos fuera de la retención.
// Los QR no se tocan nunca: son de quien los creó y no caducan por sí solos.
func (s *Store) LimpiarCaducadas(ctx context.Context, retencion time.Duration) (sesiones, escaneos int64, err error) {
	ahora := s.now().UTC()
	res, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ?`, segundos(ahora))
	if err != nil {
		return 0, 0, err
	}
	sesiones, _ = res.RowsAffected()
	if retencion > 0 {
		res, err = s.db.ExecContext(ctx, `DELETE FROM qr_scans WHERE scanned_at < ?`, segundos(ahora.Add(-retencion)))
		if err != nil {
			return sesiones, 0, err
		}
		escaneos, _ = res.RowsAffected()
	}
	return sesiones, escaneos, nil
}

// uuid genera un identificador de usuario con la misma forma que dejó Node
// (`crypto.randomUUID`), para que las filas nuevas no se distingan de las viejas.
func uuid() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("sin aleatoriedad del sistema no se puede crear una identidad")
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
