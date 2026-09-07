package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Ulzuhan/qr-forge/internal/store"
)

// La API habla en fechas ISO, como la de Node: Drizzle devolvía objetos Date y
// JSON.stringify los escribe así. Cambiarlo rompería a cualquier cliente.
func iso(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

func isoPtr(t *time.Time) any {
	if t == nil {
		return nil
	}
	return iso(*t)
}

func qrJSON(q store.QR) map[string]any {
	return map[string]any{
		"id": q.ID, "userId": q.UserID, "type": q.Type,
		"destinationUrl": q.DestinationURL, "staticPayload": q.StaticPayload,
		"staticKind": q.StaticKind, "title": q.Title, "description": q.Description,
		"campaign": q.Campaign, "isActive": q.IsActive, "expiresAt": isoPtr(q.ExpiresAt),
		"createdAt": iso(q.CreatedAt), "updatedAt": iso(q.UpdatedAt),
	}
}

func (s *Server) listarQR(w http.ResponseWriter, r *http.Request) {
	u := s.exigirUsuario(w, r)
	if u == nil {
		return
	}
	ctx, cancel := contextoBreve(r)
	defer cancel()
	filas, err := s.almacen.ListarQR(ctx, u.ID)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "Failed to list QRs")
		return
	}
	lista := make([]map[string]any, 0, len(filas))
	for _, f := range filas {
		fila := qrJSON(f.QR)
		fila["scanCount"] = f.ScanCount
		lista = append(lista, fila)
	}
	escribirJSON(w, http.StatusOK, map[string]any{"qrs": lista})
}

// fechaEntrada acepta lo mismo que Node: una cadena ISO o un número de
// MILISEGUNDOS. Los milisegundos son de la entrada; en disco van segundos.
func fechaEntrada(v any) (*time.Time, bool) {
	switch x := v.(type) {
	case string:
		if x == "" {
			return nil, true
		}
		for _, formato := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02"} {
			if t, err := time.Parse(formato, x); err == nil {
				t = t.UTC()
				return &t, true
			}
		}
		return nil, false
	case float64:
		if x != x {
			return nil, false
		}
		t := time.UnixMilli(int64(x)).UTC()
		return &t, true
	case nil:
		return nil, true
	}
	return nil, false
}

func (s *Server) crearQR(w http.ResponseWriter, r *http.Request) {
	u := s.exigirUsuario(w, r)
	if u == nil {
		return
	}
	if !s.exigirOrigen(w, r) {
		return
	}
	limite := s.limitador.permitir("create:"+u.ID+":"+ipCliente(r),
		entero("QRFORGE_MAX_CREATES_PER_HOUR", 120, 10000), time.Hour)
	if !limite.Permitido {
		w.Header().Set("Retry-After", strconv.Itoa(limite.Espera))
		errorJSON(w, http.StatusTooManyRequests, "Too many attempts. Try again in a moment.")
		return
	}
	var cuerpo map[string]any
	if err := leerJSON(r, &cuerpo); err != nil {
		if errors.Is(err, errCuerpoGrande) {
			errorJSON(w, http.StatusRequestEntityTooLarge, "Request body too large")
			return
		}
		errorJSON(w, http.StatusBadRequest, "Malformed request body")
		return
	}

	titulo, _ := cuerpo["title"].(string)
	if strings.TrimSpace(titulo) == "" || len([]rune(titulo)) > 100 {
		errorJSON(w, http.StatusBadRequest, "Title is required (max 100)")
		return
	}
	desc := textoOpcional(cuerpo["description"], tiene(cuerpo, "description"), 1000)
	camp := textoOpcional(cuerpo["campaign"], tiene(cuerpo, "campaign"), 200)
	if desc.Invalido || camp.Invalido {
		errorJSON(w, http.StatusBadRequest, "Invalid description or campaign")
		return
	}

	tipo := "dynamic"
	if v, hay := cuerpo["type"]; hay {
		s, ok := v.(string)
		if !ok || (s != "dynamic" && s != "static") {
			errorJSON(w, http.StatusBadRequest, "Invalid type")
			return
		}
		tipo = s
	}

	nuevo := store.NuevoQR{UserID: u.ID, Type: tipo, Title: strings.TrimSpace(titulo),
		Description: desc.Valor, Campaign: camp.Valor}

	if tipo == "dynamic" {
		destino, _ := cuerpo["destinationUrl"].(string)
		if !urlDestinoValida(destino) {
			errorJSON(w, http.StatusBadRequest, "Valid destination URL required (http/https)")
			return
		}
		nuevo.DestinationURL = &destino
	} else {
		kind, _ := cuerpo["staticKind"].(string)
		if !tiposEstaticos[kind] {
			errorJSON(w, http.StatusBadRequest, "Invalid staticKind")
			return
		}
		payload, ok := cuerpo["staticPayload"].(string)
		if !ok {
			errorJSON(w, http.StatusBadRequest, "staticPayload required")
			return
		}
		if msg := validarEstatico(kind, payload); msg != "" {
			errorJSON(w, http.StatusBadRequest, msg)
			return
		}
		nuevo.StaticPayload, nuevo.StaticKind = &payload, &kind
	}

	if v, hay := cuerpo["customSlug"]; hay && v != nil && v != "" {
		s, ok := v.(string)
		if !ok || len(s) > 40 {
			errorJSON(w, http.StatusBadRequest, "Invalid custom slug")
			return
		}
		limpio := limpiarSlug(s)
		if limpio == "" {
			errorJSON(w, http.StatusBadRequest, "Invalid custom slug")
			return
		}
		nuevo.SlugPedido = limpio
	}

	if v, hay := cuerpo["expiresAt"]; hay && v != nil && v != "" {
		t, ok := fechaEntrada(v)
		if !ok {
			errorJSON(w, http.StatusBadRequest, "Invalid expiresAt")
			return
		}
		nuevo.ExpiresAt = t
	}

	ctx, cancel := contextoBreve(r)
	defer cancel()
	slug, err := s.almacen.CrearQR(ctx, nuevo, entero("QRFORGE_MAX_QRS_PER_USER", 1000, 100000))
	switch {
	case errors.Is(err, store.ErrCuota):
		errorJSON(w, http.StatusInsufficientStorage, "QR quota reached")
	case errors.Is(err, store.ErrSlugOcupado):
		errorJSON(w, http.StatusConflict, "Custom slug already taken")
	case err != nil:
		errorJSON(w, http.StatusInternalServerError, "Failed to create QR")
	default:
		escribirJSON(w, http.StatusCreated, map[string]any{"id": slug})
	}
}

func tiene(m map[string]any, k string) bool { _, hay := m[k]; return hay }

func (s *Server) verQR(w http.ResponseWriter, r *http.Request) {
	u := s.exigirUsuario(w, r)
	if u == nil {
		return
	}
	ctx, cancel := contextoBreve(r)
	defer cancel()
	qr, err := s.almacen.QRDelDueno(ctx, r.PathValue("id"), u.ID)
	if err != nil {
		s.noEncontradoJSON(w, err)
		return
	}
	escribirJSON(w, http.StatusOK, map[string]any{"qr": qrJSON(*qr)})
}

func (s *Server) noEncontradoJSON(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNoEncontrado) {
		errorJSON(w, http.StatusNotFound, "QR not found")
		return
	}
	errorJSON(w, http.StatusInternalServerError, "Failed to fetch QR")
}

func (s *Server) editarQR(w http.ResponseWriter, r *http.Request) {
	u := s.exigirUsuario(w, r)
	if u == nil {
		return
	}
	if !s.exigirOrigen(w, r) {
		return
	}
	var cuerpo map[string]any
	if err := leerJSON(r, &cuerpo); err != nil {
		if errors.Is(err, errCuerpoGrande) {
			errorJSON(w, http.StatusRequestEntityTooLarge, "Request body too large")
			return
		}
		errorJSON(w, http.StatusBadRequest, "Malformed request body")
		return
	}
	ctx, cancel := contextoBreve(r)
	defer cancel()
	id := r.PathValue("id")
	// Se lee primero para saber el tipo: el destino sólo se toca en dinámicos y
	// el payload sólo en estáticos. Cambiar el tipo por accidente no es posible
	// porque `type` no se acepta aquí.
	existente, err := s.almacen.QRDelDueno(ctx, id, u.ID)
	if err != nil {
		s.noEncontradoJSON(w, err)
		return
	}

	var c store.Cambios
	if v, hay := cuerpo["title"]; hay {
		t, ok := v.(string)
		if !ok || strings.TrimSpace(t) == "" || len([]rune(t)) > 100 {
			errorJSON(w, http.StatusBadRequest, "Invalid title")
			return
		}
		limpio := strings.TrimSpace(t)
		c.Title = &limpio
	}
	for _, campo := range []struct {
		nombre string
		max    int
		set    func(**string)
	}{
		{"description", 1000, func(p **string) { c.Description = p }},
		{"campaign", 200, func(p **string) { c.Campaign = p }},
	} {
		o := textoOpcional(cuerpo[campo.nombre], tiene(cuerpo, campo.nombre), campo.max)
		if o.Invalido {
			errorJSON(w, http.StatusBadRequest, "Invalid "+campo.nombre)
			return
		}
		if o.Presente {
			valor := o.Valor
			campo.set(&valor)
		}
	}
	if v, hay := cuerpo["isActive"]; hay {
		b, ok := v.(bool)
		if !ok {
			errorJSON(w, http.StatusBadRequest, "Invalid isActive")
			return
		}
		c.IsActive = &b
	}
	if v, hay := cuerpo["expiresAt"]; hay {
		if v == nil || v == "" {
			var nada *time.Time
			c.ExpiresAt = &nada
		} else {
			t, ok := fechaEntrada(v)
			if !ok || t == nil {
				errorJSON(w, http.StatusBadRequest, "Invalid expiresAt")
				return
			}
			c.ExpiresAt = &t
		}
	}
	if v, hay := cuerpo["destinationUrl"]; hay && existente.Type == "dynamic" {
		destino, ok := v.(string)
		if !ok || !urlDestinoValida(destino) {
			errorJSON(w, http.StatusBadRequest, "Invalid destination URL")
			return
		}
		c.DestinationURL = &destino
	}
	if v, hay := cuerpo["staticPayload"]; hay && existente.Type == "static" {
		payload, ok := v.(string)
		if !ok {
			errorJSON(w, http.StatusBadRequest, "Invalid static payload")
			return
		}
		kind := ""
		if existente.StaticKind != nil {
			kind = *existente.StaticKind
		}
		if msg := validarEstatico(kind, payload); msg != "" {
			errorJSON(w, http.StatusBadRequest, msg)
			return
		}
		c.StaticPayload = &payload
	}

	if err := s.almacen.ActualizarQR(ctx, id, u.ID, c); err != nil {
		if errors.Is(err, store.ErrNoEncontrado) {
			errorJSON(w, http.StatusNotFound, "QR not found")
			return
		}
		errorJSON(w, http.StatusInternalServerError, "Failed to update QR")
		return
	}
	escribirJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) borrarQR(w http.ResponseWriter, r *http.Request) {
	u := s.exigirUsuario(w, r)
	if u == nil {
		return
	}
	if !s.exigirOrigen(w, r) {
		return
	}
	ctx, cancel := contextoBreve(r)
	defer cancel()
	if err := s.almacen.BorrarQR(ctx, r.PathValue("id"), u.ID); err != nil {
		if errors.Is(err, store.ErrNoEncontrado) {
			errorJSON(w, http.StatusNotFound, "QR not found")
			return
		}
		errorJSON(w, http.StatusInternalServerError, "Failed to delete QR")
		return
	}
	escribirJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) estadisticas(w http.ResponseWriter, r *http.Request) {
	u := s.exigirUsuario(w, r)
	if u == nil {
		return
	}
	ctx, cancel := contextoBreve(r)
	defer cancel()
	e, err := s.almacen.Estadisticas(ctx, r.PathValue("id"), u.ID)
	if err != nil {
		if errors.Is(err, store.ErrNoEncontrado) {
			errorJSON(w, http.StatusNotFound, "QR not found")
			return
		}
		errorJSON(w, http.StatusInternalServerError, "Failed to fetch stats")
		return
	}
	dias := make([]map[string]any, 0, len(e.Daily))
	for _, d := range e.Daily {
		dias = append(dias, map[string]any{"day": d.Day, "count": d.Count})
	}
	paises := make([]map[string]any, 0, len(e.Countries))
	for _, p := range e.Countries {
		paises = append(paises, map[string]any{"country": p.Country, "count": p.Count})
	}
	recientes := make([]map[string]any, 0, len(e.Recent))
	for _, x := range e.Recent {
		recientes = append(recientes, map[string]any{"id": x.ID, "country": x.Country,
			"userAgent": x.UserAgent, "scannedAt": iso(x.ScannedAt)})
	}
	escribirJSON(w, http.StatusOK, map[string]any{
		"qr": qrJSON(e.QR), "total": e.Total, "daily": dias,
		"countries": paises, "recent": recientes,
		// El periodo de la serie viaja con ella: el rótulo y el promedio del
		// gráfico usan ESTE dato y no su propio recorte.
		"dailySince": iso(e.Desde), "dailyDays": int(store.VentanaEstadisticas.Hours() / 24),
	})
}
