#!/usr/bin/env bash
#
# El recorrido completo en un navegador de verdad, sobre HTTPS.
#
# Necesita su propio montaje: un proveedor de mentira que COMPLETA el login y un
# proxy TLS por delante, porque las cookies `Secure` no viajan por http y una
# prueba que las desactivara no probaría lo que se despliega.
#
#   npm run build:web && go build -o /tmp/qrforge ./cmd/qrforge
#   QRFORGE_TEST_LAUNCH=/tmp/qrforge npm run test:navegador
set -uo pipefail
set -m

cd "$(dirname "$0")/.."

PUERTO_APP="${PUERTO_APP:-3971}"
PUERTO_TLS="${PUERTO_TLS:-3972}"
export PUERTO_IDP="${PUERTO_IDP:-9971}"
export BASE="https://127.0.0.1:$PUERTO_TLS"
WORK="$(mktemp -d)"
export LLAVE="$WORK/llave.pem" CERT="$WORK/cert.pem"
export PUERTO_APP PUERTO_TLS
LOG="$WORK/servidor.log"
export QRFORGE_DB_PATH="$WORK/qrforge.db"

LANZAR="${QRFORGE_TEST_LAUNCH:-./qrforge}"

servidor=""
parar() {
  [ -n "$servidor" ] || return 0
  kill -- -"$servidor" 2>/dev/null || kill "$servidor" 2>/dev/null
  wait "$servidor" 2>/dev/null
  servidor=""
}
limpiar() { parar; rm -rf "$WORK"; }
trap 'limpiar; exit 130' INT TERM

openssl req -x509 -newkey rsa:2048 -nodes -keyout "$LLAVE" -out "$CERT" \
  -days 1 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" 2>/dev/null || {
  echo "no se pudo generar el certificado"; limpiar; exit 1; }

sqlite3 "$QRFORGE_DB_PATH" < scripts/esquema.sql

# El origen público es el del proxy TLS: es lo que se imprime en los QR y lo que compara el guardián de
# origen.
QRFORGE_INSECURE_COOKIES=0 PORT="$PUERTO_APP" HOSTNAME=127.0.0.1 \
  QRFORGE_DB_PATH="$QRFORGE_DB_PATH" \
  QRFORGE_PUBLIC_URL="$BASE" \
  QRFORGE_PUBLIC_HOST="127.0.0.1:$PUERTO_TLS" \
  QRFORGE_MAX_QRS_PER_USER=50 \
  QRFORGE_OIDC_CLIENT_ID=pruebas \
  QRFORGE_OIDC_CLIENT_SECRET=pruebas \
  QRFORGE_OIDC_REDIRECT_URI="$BASE/api/auth/callback" \
  QRFORGE_OIDC_ISSUER="http://127.0.0.1:$PUERTO_IDP/application/o/qr-forge" \
  QRFORGE_OIDC_INTERNAL_BASE="http://127.0.0.1:$PUERTO_IDP" \
  QRFORGE_ACCOUNT_URL="https://idp.example.invalid/if/user/" \
  KAICORP_FOOTER_LINKS=on \
  $LANZAR >"$LOG" 2>&1 &
servidor=$!

for _ in $(seq 1 90); do
  curl -sf -o /dev/null "http://127.0.0.1:$PUERTO_APP/" && break
  sleep 0.5
done
if ! curl -sf -o /dev/null "http://127.0.0.1:$PUERTO_APP/"; then
  echo "la aplicación no arrancó:"; tail -20 "$LOG"; limpiar; exit 1
fi

node "${QRFORGE_NAV_SCRIPT:-scripts/test-navegador.mjs}"
estado=$?
[ "$estado" -eq 0 ] || { echo "--- registro de la aplicación ---"; tail -20 "$LOG"; }
limpiar
exit "$estado"
