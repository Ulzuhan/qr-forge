package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Las tres correcciones del plan §5, cada una con su caso. Describen el
// comportamiento CORREGIDO, así que viven aquí y no en la suite compartida:
// contra 0.5.0 fallarían, y esa diferencia es intencionada y está documentada.

type banco struct {
	clave *rsa.PrivateKey
	cfg   *Config
	e     *Endpoints
	v     *Verificador
	ahora time.Time
}

func montar(t *testing.T) *banco {
	t.Helper()
	clave, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	pub := clave.Public().(*rsa.PublicKey)
	_ = x509.MarshalPKCS1PublicKey(pub)
	jwks := map[string]any{"keys": []map[string]string{{
		"kty": "RSA", "kid": "prueba", "alg": "RS256", "use": "sig",
		"n": base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
		"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
	}}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(jwks)
	}))
	t.Cleanup(srv.Close)
	b := &banco{clave: clave, ahora: time.Now().UTC(),
		cfg: &Config{ClientID: "qrforge", Timeout: 5 * time.Second},
		e:   &Endpoints{JWKS: srv.URL, Emisores: []string{"https://idp.example"}},
		v:   NuevoVerificador()}
	b.v.Ahora = func() time.Time { return b.ahora }
	return b
}

func (b *banco) token(t *testing.T, cambios map[string]any) string {
	t.Helper()
	ahora := b.ahora.Unix()
	carga := map[string]any{
		"iss": "https://idp.example", "aud": "qrforge",
		"iat": float64(ahora), "exp": float64(ahora + 300),
		"jti": "jti-" + t.Name(), "sub": "sub-de-pruebas",
		"events": map[string]any{eventoBackchannel: map[string]any{}},
	}
	for k, v := range cambios {
		if v == nil {
			delete(carga, k)
			continue
		}
		carga[k] = v
	}
	b64 := func(v any) string {
		crudo, _ := json.Marshal(v)
		return base64.RawURLEncoding.EncodeToString(crudo)
	}
	firmado := b64(map[string]string{"alg": "RS256", "kid": "prueba", "typ": "logout+jwt"}) + "." + b64(carga)
	suma := sha256.Sum256([]byte(firmado))
	firma, err := rsa.SignPKCS1v15(rand.Reader, b.clave, 5, suma[:])
	if err != nil {
		t.Fatal(err)
	}
	return firmado + "." + base64.RawURLEncoding.EncodeToString(firma)
}

// §5.2 — `exp` es obligatorio y finito. En 0.5.0 sólo se validaba «si venía y
// era numérico», así que un token SIN exp pasaba: un aviso de cierre que no
// caduca nunca se puede reutilizar siempre.
func TestElAvisoSinExpiracionSeRechaza(t *testing.T) {
	b := montar(t)
	for nombre, exp := range map[string]any{
		"ausente":     nil,
		"cadena":      "9999999999",
		"cero":        float64(0),
		"pasado":      float64(b.ahora.Add(-time.Hour).Unix()),
		"disparatado": 1e18,
	} {
		t.Run(nombre, func(t *testing.T) {
			_, err := b.v.Verificar(context.Background(), b.token(t, map[string]any{"exp": exp}), b.cfg, b.e)
			if err == nil {
				t.Fatal("se aceptó un aviso con esa expiración")
			}
		})
	}
	// Y el bueno sigue pasando.
	if _, err := b.v.Verificar(context.Background(), b.token(t, nil), b.cfg, b.e); err != nil {
		t.Fatalf("un aviso correcto se rechazó: %v", err)
	}
}

// §5.2 — un aviso con `sid` y sin `sub` se RECHAZA. En 0.5.0 respondía 200 sin
// hacer nada: estas sesiones no guardan el sid del proveedor, así que no hay
// forma de aplicarlo, y decirle que sí es peor que decirle que no — deja de
// reintentar y la sesión sigue viva.
func TestElAvisoSoloConSidSeRechazaEnVezDeFingir(t *testing.T) {
	b := montar(t)
	_, err := b.v.Verificar(context.Background(),
		b.token(t, map[string]any{"sub": nil, "sid": "sesion-del-proveedor"}), b.cfg, b.e)
	if err != ErrSoloSid {
		t.Fatalf("dio %v, y tiene que ser un rechazo explícito", err)
	}
}

// §5.2 — el JTI se marca DESPUÉS de revocar, no antes. Verificar no lo marca:
// si lo hiciera, un fallo de base de datos convertiría la revocación en una
// pérdida definitiva, porque el reintento del proveedor se descartaría.
func TestElJtiSeMarcaDespuesDeRevocarYNoAntes(t *testing.T) {
	b := montar(t)
	tok := b.token(t, nil)
	aviso, err := b.v.Verificar(context.Background(), tok, b.cfg, b.e)
	if err != nil {
		t.Fatal(err)
	}
	// Verificar no ha marcado nada: el mismo aviso se puede volver a verificar,
	// que es lo que permite reintentar cuando la revocación falló.
	if b.v.YaVisto(aviso.JTI) {
		t.Fatal("el JTI quedó marcado antes de revocar")
	}
	if _, err := b.v.Verificar(context.Background(), tok, b.cfg, b.e); err != nil {
		t.Fatalf("el reintento tras un fallo de revocación no pasó: %v", err)
	}
	// Y una vez aplicada la revocación, el repetido ya no cuela.
	b.v.Anotar(aviso.JTI)
	if _, err := b.v.Verificar(context.Background(), tok, b.cfg, b.e); err != ErrAvisoRepetido {
		t.Fatalf("el repetido tras revocar dio %v", err)
	}
}

// Un `iat` muy viejo o del futuro no vale: sin esto, un aviso capturado hace
// meses seguiría sirviendo mientras su exp aguante.
func TestElAvisoConIatImposibleSeRechaza(t *testing.T) {
	b := montar(t)
	for nombre, iat := range map[string]any{
		"del futuro": float64(b.ahora.Add(time.Hour).Unix()),
		"muy viejo":  float64(b.ahora.Add(-time.Hour).Unix()),
		"ausente":    nil,
	} {
		t.Run(nombre, func(t *testing.T) {
			if _, err := b.v.Verificar(context.Background(),
				b.token(t, map[string]any{"iat": iat}), b.cfg, b.e); err == nil {
				t.Fatal("aceptado")
			}
		})
	}
}
