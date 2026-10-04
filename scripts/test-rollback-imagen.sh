#!/usr/bin/env bash
#
# Go 0.7.0 firmado → Go → Go previo sobre la MISMA base, y nunca los dos a la vez.
#
# Lo que decide si se puede cambiar de implementación y volver. Cada turno para
# de verdad antes de que empiece el siguiente: dos escritores sobre la misma
# base no es un escenario soportado y no se va a probar como si lo fuera.
#
# La referencia es la IMAGEN publicada, no el árbol de la rama: la rama lleva
# arreglos que esa imagen no tiene, así que probarla no probaría el retorno.
#
#   go build -o /tmp/qrforge ./cmd/qrforge
#   QRFORGE_COMPAT_GO=/tmp/qrforge npm run test:compatibilidad
set -uo pipefail
: "${QRFORGE_TEST_IMAGE:?exact verified OCI runtime ID required}"
[[ "$QRFORGE_TEST_IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 2
CANDIDATE="$QRFORGE_TEST_IMAGE"
set -m

cd "$(dirname "$0")/.."

PUERTO="${PORT:-3991}"
export BASE="http://127.0.0.1:$PUERTO"
IMAGEN_NODE=$(python3 scripts/rollback-baseline.py image)
docker pull "$IMAGEN_NODE"
GO_LANZAR="env QRFORGE_TEST_IMAGE=$CANDIDATE bash scripts/lanzar-imagen.sh"
[ -n "$GO_LANZAR" ] || { echo "hace falta QRFORGE_COMPAT_GO con el binario Go"; exit 2; }

WORK="$(mktemp -d -t qrforge-rollback-XXXXXXXX)"
mkdir "$WORK/store"
export QRFORGE_DB_PATH="$WORK/store/qrforge.db"
export ESTADO="$WORK/estado.json"
LOG="$WORK/servidor.log"
chmod 777 "$WORK" "$WORK/store"

servidor=""
parar() {
  [ -n "$servidor" ] || return 0
  kill -- -"$servidor" 2>/dev/null || kill "$servidor" 2>/dev/null
  wait "$servidor" 2>/dev/null
  servidor=""
  # Que el puerto quede libre no es cosmético: es la prueba de que no quedan
  # dos escritores sobre la misma base.
  for _ in $(seq 1 40); do
    ss -tln 2>/dev/null | grep -qE ":$PUERTO " || return 0
    sleep 0.25
  done
  echo "aviso: el puerto $PUERTO sigue ocupado"; return 1
}
limpiar() { parar; rm -rf "$WORK"; }
trap 'limpiar; exit 130' INT TERM

arrancar() { # $1 = etiqueta, $2 = orden
  ss -tln 2>/dev/null | grep -qE ":$PUERTO " && { echo "el puerto $PUERTO ya está ocupado"; return 1; }
  echo "--- arranca $1" >>"$LOG"
  PORT="$PUERTO" HOSTNAME=127.0.0.1 NODE_ENV=production \
    QRFORGE_DB_PATH="$QRFORGE_DB_PATH" \
    QRFORGE_PUBLIC_URL="$BASE" \
    QRFORGE_INSECURE_COOKIES=1 \
    QRFORGE_MAX_QRS_PER_USER=50 \
    QRFORGE_OIDC_CLIENT_ID=pruebas \
    QRFORGE_OIDC_CLIENT_SECRET=pruebas \
    QRFORGE_OIDC_REDIRECT_URI="$BASE/api/auth/callback" \
    QRFORGE_OIDC_ISSUER="http://127.0.0.1:9999/application/o/qr-forge/" \
    QRFORGE_OIDC_INTERNAL_BASE="http://127.0.0.1:9999" \
    $2 >>"$LOG" 2>&1 &
  servidor=$!
  for _ in $(seq 1 90); do
    curl -sf -o /dev/null "$BASE/api/health" && return 0
    curl -sf -o /dev/null "$BASE/" && return 0
    sleep 0.5
  done
  echo "$1 no arrancó:"; tail -20 "$LOG"; return 1
}

# La base la crea el esquema, igual que en producción: Go tiene que ACEPTAR una
# base existente, no reinicializarla.
sqlite3 "$QRFORGE_DB_PATH" < scripts/esquema.sql
chmod 666 "$QRFORGE_DB_PATH"

export QRFORGE_TEST_IMAGE="$IMAGEN_NODE"
NODE_LANZAR="bash scripts/lanzar-imagen.sh"

fallo=0
arrancar "Go 0.7.0 firmado" "$NODE_LANZAR" || fallo=1
[ "$fallo" -eq 0 ] && { QRFORGE_COMPAT_LABEL="Go 0.7.0 firmado" node scripts/test-compatibilidad.mjs sembrar-node || fallo=1; }
parar || fallo=1
[ "$fallo" -eq 0 ] && { python3 scripts/sqlite-rehearsal.py baseline "$WORK" || fallo=1; }

echo
[ "$fallo" -eq 0 ] && { arrancar Go "$GO_LANZAR" || fallo=1; }
[ "$fallo" -eq 0 ] && { QRFORGE_COMPAT_LABEL="Go 0.7.0 firmado" node scripts/test-compatibilidad.mjs verificar-go || fallo=1; }
parar || fallo=1
[ "$fallo" -eq 0 ] && { python3 scripts/sqlite-rehearsal.py candidate "$WORK" || fallo=1; }

echo
[ "$fallo" -eq 0 ] && { arrancar "Go 0.7.0 firmado (vuelta atrás)" "$NODE_LANZAR" || fallo=1; }
[ "$fallo" -eq 0 ] && { QRFORGE_COMPAT_LABEL="Go 0.7.0 firmado" node scripts/test-compatibilidad.mjs verificar-node || fallo=1; }

parar || fallo=1
[ "$fallo" -eq 0 ] && { python3 scripts/sqlite-rehearsal.py returned "$WORK" || fallo=1; }

[ "$fallo" -ne 0 ] && { echo "--- registro ---"; tail -30 "$LOG"; }
limpiar
[ "$fallo" -eq 0 ] && echo && echo "todo verde"
exit "$fallo"
