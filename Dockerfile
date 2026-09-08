# React assets are built separately; the runtime contains Go and CA certificates.

FROM node:22-bookworm-slim AS assets
WORKDIR /app
# Playwright es dependencia de desarrollo y su instalación baja navegadores.
# Aquí no se usan y no deben aparecer ni en esta capa intermedia.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
# `npm ci` completo: vite, Tailwind y PostCSS son dependencias de desarrollo, y
# sin ellas no hay nada que compilar. Nada de esto llega al runtime.
RUN npm ci
COPY vite.config.mts postcss.config.mjs ./
COPY web ./web
COPY public ./public
RUN npx vite build

FROM golang:1.27.1-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
# Los assets vienen de la etapa anterior y NUNCA del host: `internal/web/dist`
# está en .dockerignore para que un `vite build` local no decida qué se embebe.
COPY --from=assets /app/internal/web/dist ./internal/web/dist
# CGO fuera: el driver de SQLite es Go puro (modernc.org/sqlite), así que el
# binario sale estático y no hay que arrastrar toolchain de C al runtime.
# -trimpath deja las rutas de compilación fuera, que es lo que permite
# reconstruirlo igual desde otro directorio.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/qrforge ./cmd/qrforge

FROM alpine:3.24 AS runtime
ENV HOSTNAME=0.0.0.0 PORT=3459 QRFORGE_DB_PATH=/data/qrforge.db
# Alpine con CA y shell: la shell la usa el `command` del compose para cargar el
# fichero de entorno, y las CA hacen falta para hablar con el proveedor por
# HTTPS. uid 10001 fijo, como el resto de imágenes propias.
RUN apk -U upgrade --no-cache \
 && apk add --no-cache ca-certificates \
 && addgroup -S -g 10001 qrforge && adduser -S -u 10001 -G qrforge qrforge \
 && mkdir /data && chmod 0700 /data && chown qrforge:qrforge /data
# El binario y nada más. La interfaz va embebida con go:embed, así que aquí no
# hay node, ni npm, ni node_modules, ni Playwright, ni navegadores: no queda
# nada que retirar después, al revés que en la imagen de Node.
COPY --from=build /out/qrforge /usr/local/bin/qrforge
USER qrforge
EXPOSE 3459
VOLUME ["/data"]

# La sonda va dentro del binario porque aquí no hay node con el que preguntar.
# Pega a /api/health y NO a un QR real: visitar un código registraría un escaneo
# cada treinta segundos y ensuciaría las estadísticas de alguien.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["qrforge", "health"]

# Sin ExecStartPre ni entrypoint de Node: el binario inicializa la base él mismo.
CMD ["qrforge"]
