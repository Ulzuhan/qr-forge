package httpapi

import (
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

var reSlug = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)
var reNoSlug = regexp.MustCompile(`[^a-z0-9-]`)
var reGuiones = regexp.MustCompile(`-+`)

// urlDestinoValida acepta http(s) sin credenciales y sin caracteres de control.
//
// Las direcciones privadas son válidas a propósito: **redirige el navegador**,
// no este servidor. Un QR que apunta a una intranet funciona para quien está
// dentro, y aquí no se hace fetch ni previsualización del destino, así que
// tampoco es una puerta para sondear la red desde el servidor.
func urlDestinoValida(crudo string) bool {
	if crudo == "" || len(crudo) > 2048 {
		return false
	}
	for _, r := range crudo {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	u, err := url.Parse(crudo)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return false
	}
	if u.User != nil {
		return false
	}
	return true
}

// limpiarSlug normaliza un slug personalizado igual que hoy: minúsculas,
// separadores colapsados y recorte a 40. No se toca a los ya existentes.
func limpiarSlug(entrada string) string {
	limpio := strings.ToLower(strings.TrimSpace(entrada))
	limpio = reNoSlug.ReplaceAllString(limpio, "-")
	limpio = reGuiones.ReplaceAllString(limpio, "-")
	limpio = strings.Trim(limpio, "-")
	if len(limpio) > 40 {
		limpio = limpio[:40]
	}
	return limpio
}

var tiposEstaticos = map[string]bool{"url": true, "wifi": true, "email": true, "text": true}

// validarEstatico comprueba el payload literal que se va a imprimir. El QR
// estático no redirige: lo que se guarda es exactamente lo que codifica.
func validarEstatico(tipo, payload string) string {
	if strings.TrimSpace(payload) == "" {
		return "Empty payload"
	}
	if utf8.RuneCountInString(payload) > 2000 {
		return "Payload too long (max 2000 chars)"
	}
	switch tipo {
	case "url":
		if !urlDestinoValida(payload) {
			return "Invalid URL"
		}
	case "email":
		if !strings.HasPrefix(strings.ToLower(payload), "mailto:") || len(payload) <= len("mailto:") {
			return "Invalid email payload"
		}
	case "wifi":
		if !strings.HasPrefix(payload, "WIFI:") {
			return "Invalid WiFi payload"
		}
	}
	return ""
}

// textoOpcional distingue las tres cosas que la API trata distinto: ausente
// (no tocar), null o vacío (poner a null), y un texto (guardarlo recortado).
type opcional struct {
	Presente bool
	Valor    *string
	Invalido bool
}

func textoOpcional(v any, hay bool, max int) opcional {
	if !hay {
		return opcional{}
	}
	if v == nil {
		return opcional{Presente: true}
	}
	s, ok := v.(string)
	if !ok {
		return opcional{Presente: true, Invalido: true}
	}
	if s == "" {
		return opcional{Presente: true}
	}
	if utf8.RuneCountInString(s) > max {
		return opcional{Presente: true, Invalido: true}
	}
	limpio := strings.TrimSpace(s)
	if limpio == "" {
		return opcional{Presente: true}
	}
	return opcional{Presente: true, Valor: &limpio}
}
