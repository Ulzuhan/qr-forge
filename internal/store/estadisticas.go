package store

import (
	"context"
	"database/sql"
	"time"
)

// VentanaEstadisticas es el periodo de la serie diaria. Un solo sitio, para que
// la consulta, el rótulo del gráfico y el promedio no puedan discrepar.
const VentanaEstadisticas = 30 * 24 * time.Hour

// Estadisticas devuelve TODO lo que enseña la pantalla de un QR, en una sola
// capa de consultas.
//
// Antes había dos verdades: la API filtraba los últimos 30 días y la página
// consultaba el histórico entero y luego el gráfico recortaba a los últimos 30
// días *con actividad*. El mismo QR daba números distintos según por dónde se
// mirara, y el rótulo decía «últimos 30 días» encima de una serie que no lo era.
// Aquí el periodo es uno, sale del mismo sitio y viaja en la respuesta.
func (s *Store) Estadisticas(ctx context.Context, id, userID string) (*Estadisticas, error) {
	qr, err := s.QRDelDueno(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	desde := s.now().UTC().Add(-VentanaEstadisticas)
	e := &Estadisticas{QR: *qr, Desde: desde, Daily: []Dia{}, Countries: []Pais{}, Recent: []Escaneo{}}

	// Total: el histórico que quede tras la retención. No se recorta a 30 días
	// —es el acumulado del código— y por eso se rotula aparte de la serie.
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM qr_scans WHERE qr_id = ?`, id).Scan(&e.Total); err != nil {
		return nil, err
	}

	// Serie diaria en UTC. `unixepoch` porque la columna son SEGUNDOS.
	filas, err := s.db.QueryContext(ctx,
		`SELECT strftime('%Y-%m-%d', scanned_at, 'unixepoch') AS day, COUNT(*)
		 FROM qr_scans WHERE qr_id = ? AND scanned_at >= ? GROUP BY day ORDER BY day`,
		id, segundos(desde))
	if err != nil {
		return nil, err
	}
	for filas.Next() {
		var d Dia
		if err := filas.Scan(&d.Day, &d.Count); err != nil {
			filas.Close()
			return nil, err
		}
		e.Daily = append(e.Daily, d)
	}
	filas.Close()
	if err := filas.Err(); err != nil {
		return nil, err
	}

	// Top países. Los nulos se descartan en SQL y no después: filtrarlos en Go
	// después de un LIMIT 10 devolvía menos de diez países reales.
	filas, err = s.db.QueryContext(ctx,
		`SELECT country, COUNT(*) AS c FROM qr_scans
		 WHERE qr_id = ? AND country IS NOT NULL AND country <> ''
		 GROUP BY country ORDER BY c DESC LIMIT 10`, id)
	if err != nil {
		return nil, err
	}
	for filas.Next() {
		var p Pais
		if err := filas.Scan(&p.Country, &p.Count); err != nil {
			filas.Close()
			return nil, err
		}
		e.Countries = append(e.Countries, p)
	}
	filas.Close()
	if err := filas.Err(); err != nil {
		return nil, err
	}

	// Últimos 20 escaneos.
	filas, err = s.db.QueryContext(ctx,
		`SELECT id, country, user_agent, scanned_at FROM qr_scans
		 WHERE qr_id = ? ORDER BY scanned_at DESC, id DESC LIMIT 20`, id)
	if err != nil {
		return nil, err
	}
	defer filas.Close()
	for filas.Next() {
		var esc Escaneo
		var cuando int64
		var pais, ua sql.NullString
		if err := filas.Scan(&esc.ID, &pais, &ua, &cuando); err != nil {
			return nil, err
		}
		if pais.Valid {
			v := pais.String
			esc.Country = &v
		}
		if ua.Valid {
			v := ua.String
			esc.UserAgent = &v
		}
		esc.ScannedAt = deSegundos(cuando)
		e.Recent = append(e.Recent, esc)
	}
	return e, filas.Err()
}
