#!/usr/bin/env bash
#
# Las suites HTTP, cada una contra un servidor levantado aquí mismo y una base
# NUEVA, nunca la de producción: las pruebas siembran usuarios y sesiones, y eso
# no tiene por qué acabar mezclado con las cuentas de verdad.
#
#   ./scripts/run-suites.sh            # todas
#   ./scripts/run-suites.sh codigos    # una
#
# Necesita un build antes (`npm run build`).
set -uo pipefail
set -m

cd "$(dirname "$0")/.."

PUERTO="${PORT:-3996}"
export BASE="http://127.0.0.1:$PUERTO"
RAIZ="$(mktemp -d)"
export QRFORGE_DB_PATH="$RAIZ/pruebas.db"
LOG="$(mktemp)"

TODAS=(codigos)
SUITES=("${@:-${TODAS[@]}}")
[ $# -gt 0 ] && SUITES=("$@")

servidor=""

parar() {
  [ -n "$servidor" ] || return 0
  # El grupo entero: `next start` levanta un trabajador aparte, y matar sólo al
  # padre deja el puerto ocupado. La siguiente suite encontraría un servidor en
  # pie, decidiría que ya ha arrancado, y mediría el de antes.
  kill -- -"$servidor" 2>/dev/null || kill "$servidor" 2>/dev/null
  wait "$servidor" 2>/dev/null
  servidor=""
  for _ in $(seq 1 40); do
    ss -tln 2>/dev/null | grep -qE ":$PUERTO " || return 0
    sleep 0.25
  done
  echo "aviso: el puerto $PUERTO sigue ocupado"
}
trap 'parar; rm -rf "$RAIZ"; exit 130' INT TERM

arrancar() {
  ss -tln 2>/dev/null | grep -qE ":$PUERTO " && { echo "el puerto $PUERTO ya está ocupado"; return 1; }

  rm -f "$QRFORGE_DB_PATH" "$QRFORGE_DB_PATH"-shm "$QRFORGE_DB_PATH"-wal
  sqlite3 "$QRFORGE_DB_PATH" < scripts/esquema.sql

  # Los valores de OIDC son de mentira a propósito: ninguna suite completa un
  # inicio de sesión contra el proveedor.
  QRFORGE_DB_PATH="$QRFORGE_DB_PATH" \
    QRFORGE_OIDC_CLIENT_ID=pruebas \
    QRFORGE_OIDC_CLIENT_SECRET=pruebas \
    QRFORGE_OIDC_REDIRECT_URI="$BASE/api/auth/callback" \
    QRFORGE_OIDC_PUBLIC_BASE="http://127.0.0.1:9999" \
    QRFORGE_OIDC_INTERNAL_BASE="http://127.0.0.1:9999" \
    QRFORGE_OIDC_APP_SLUG=qrforge \
    QRFORGE_PUBLIC_URL="$BASE" \
    ./node_modules/.bin/next start -p "$PUERTO" >"$LOG" 2>&1 &
  servidor=$!

  for _ in $(seq 1 90); do
    curl -sf -o /dev/null "$BASE/" && break
    sleep 0.5
  done

  # La precondición, afirmada: quien escucha tiene que ser este proceso, con esta
  # base. Sin esto se mide un servidor de otra tirada y nada lo dice.
  local escucha
  escucha=$(ss -tlnp 2>/dev/null | grep ":$PUERTO " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | head -1)
  if [ -z "$escucha" ]; then
    echo "el servidor no arrancó:"
    tail -20 "$LOG"
    return 1
  fi
  local suya
  suya=$(tr '\0' '\n' < "/proc/$escucha/environ" 2>/dev/null | grep '^QRFORGE_DB_PATH=' | cut -d= -f2-)
  if [ "$suya" != "$QRFORGE_DB_PATH" ]; then
    echo "en $PUERTO escucha otro servidor, no el de esta tirada"
    return 1
  fi
  if [ "$(stat -c %Y "/proc/$escucha")" -lt "$(stat -c %Y .next/BUILD_ID)" ]; then
    echo "el build es más nuevo que el servidor: falta un 'npm run build'"
    return 1
  fi
  return 0
}

fallo=0
for suite in "${SUITES[@]}"; do
  arrancar || { fallo=1; continue; }
  printf "%-10s " "$suite"
  salida=$(node "scripts/test-$suite.mjs" 2>&1)
  estado=$?
  echo "$salida" | tail -1
  if [ $estado -ne 0 ]; then
    echo "$salida" | grep -E "✗" | head -10
    # Y si la suite se cayó en vez de terminar contando, decirlo: un script que
    # muere a mitad deja comprobaciones sin ejecutar, y en el resumen eso se
    # parece demasiado a un fallo pequeño.
    if ! echo "$salida" | grep -qE "^[0-9]+ pasan, [0-9]+ fallan$"; then
      echo "  ⚠ la suite '$suite' se cayó antes de terminar; lo que sigue no llegó a ejecutarse:"
      echo "$salida" | tail -6 | sed 's/^/     /'
    fi
    fallo=1
  fi
  parar
done

rm -f "$LOG"
rm -rf "$RAIZ"
if [ $fallo -ne 0 ]; then
  echo
  echo "HAY FALLOS"
  exit 1
fi
echo
echo "todo verde"
