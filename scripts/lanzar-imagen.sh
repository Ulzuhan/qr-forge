#!/usr/bin/env bash
# Arranca una imagen de QR-Forge como si fuera un binario más, para poder
# apuntarle las mismas suites sin tocarlas:
#
#   QRFORGE_TEST_LAUNCH="bash scripts/lanzar-imagen.sh" \
#   QRFORGE_TEST_IMAGE=ghcr.io/ulzuhan/qr-forge:0.5.0@sha256:… npm run test:...
#
# `--network host` porque el proveedor sintético de las pruebas escucha en el
# loopback del anfitrión.
#
# Si QRFORGE_DB_PATH apunta a un fichero del anfitrión, se monta su directorio
# dentro con la misma ruta: es lo que permite que dos implementaciones se turnen
# SOBRE LA MISMA base. En ese modo el contenedor corre con el uid de quien
# lanza, para que los ficheros que escriba se puedan leer después desde fuera.
# Es una prueba del FORMATO de los datos; el perfil de seguridad productivo se
# verifica aparte.
set -uo pipefail

IMAGEN="${QRFORGE_TEST_IMAGE:?hace falta QRFORGE_TEST_IMAGE}"
NOMBRE="qrforge-prueba-$$"

limpiar() { docker rm -f "$NOMBRE" >/dev/null 2>&1 || true; }
trap limpiar EXIT INT TERM

MONTAJE=()
if [ -n "${QRFORGE_DB_PATH:-}" ]; then
  DIR="$(cd "$(dirname "$QRFORGE_DB_PATH")" && pwd)"
  MONTAJE=(-v "$DIR:$DIR" -e "QRFORGE_DB_PATH=$QRFORGE_DB_PATH" --user "$(id -u):$(id -g)")
fi

# Sin `exec`: reemplazaría a esta shell y el trap no llegaría a correr, dejando
# un contenedor sujetando el puerto para la siguiente tirada.
docker run --rm --network host --name "$NOMBRE" \
  -e PORT -e HOSTNAME -e NODE_ENV \
  -e KAICORP_FOOTER_LINKS \
  -e QRFORGE_PUBLIC_URL -e QRFORGE_PUBLIC_HOST \
  -e QRFORGE_ACCOUNT_URL -e QRFORGE_INSECURE_COOKIES \
  -e QRFORGE_MAX_QRS_PER_USER -e QRFORGE_MAX_CREATES_PER_HOUR \
  -e QRFORGE_SESSION_TTL_HOURS -e QRFORGE_SCAN_RETENTION_DAYS \
  -e QRFORGE_OIDC_CLIENT_ID -e QRFORGE_OIDC_CLIENT_SECRET \
  -e QRFORGE_OIDC_ISSUER -e QRFORGE_OIDC_INTERNAL_BASE -e QRFORGE_OIDC_REDIRECT_URI \
  "${MONTAJE[@]}" \
  "$IMAGEN" &
wait $!
