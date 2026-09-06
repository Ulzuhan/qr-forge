package store

import "time"

type User struct {
	ID         string
	OidcSub    string
	Email      string
	Name       *string
	CreatedAt  time.Time
	LastSeenAt time.Time
}

// QR es una fila de qr_codes. Los punteros distinguen NULL de vacío, que en
// esta API son cosas distintas: la de PATCH permite poner un campo a null.
type QR struct {
	ID             string
	UserID         string
	Type           string
	DestinationURL *string
	StaticPayload  *string
	StaticKind     *string
	Title          string
	Description    *string
	Campaign       *string
	IsActive       bool
	ExpiresAt      *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// QRConCuenta es lo que necesita el panel: el QR y cuántas veces se ha escaneado.
type QRConCuenta struct {
	QR
	ScanCount int64
}

type Escaneo struct {
	ID        int64
	Country   *string
	UserAgent *string
	ScannedAt time.Time
}

type Dia struct {
	Day   string
	Count int64
}

type Pais struct {
	Country string
	Count   int64
}

// Estadisticas: el contrato unificado. El total es el histórico retenido; la
// serie son los últimos 30 días en UTC, incluidos los días sin actividad no —
// se devuelven sólo los días con escaneos, como hacía la API—; países y últimos
// escaneos, como antes.
type Estadisticas struct {
	QR        QR
	Total     int64
	Daily     []Dia
	Countries []Pais
	Recent    []Escaneo
	// Desde es el corte de la serie, expuesto para que el rótulo del gráfico y
	// el promedio usen el MISMO periodo que la consulta. La página calculaba su
	// propio recorte y decía «últimos 30 días» sobre otra cosa.
	Desde time.Time
}
