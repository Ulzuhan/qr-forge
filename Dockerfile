FROM node:22-bookworm-slim AS build
# better-sqlite3 se compila con node-gyp cuando no hay binario precompilado para
# esta versión de Node, y la imagen slim no trae ni Python ni toolchain. Solo en
# la etapa de build: al runtime viaja el .node ya compilado, dentro del standalone.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3459 QRFORGE_DB_PATH=/data/qrforge.db
WORKDIR /app
# apt upgrade: la base arrastra arreglos de seguridad de Debian (medido por el
# Trivy semanal). Y npm/npx/yarn FUERA: el runtime ejecuta el entrypoint con
# node y nada más — el npm CLI trae sus propios node_modules (tar,
# brace-expansion…) que salen en los escáneres y jamás se usarían.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && groupadd --system --gid 10001 qrforge && useradd --system --uid 10001 --gid qrforge --home /nonexistent qrforge \
    && mkdir /data && chmod 0700 /data && chown qrforge:qrforge /data
COPY --from=build --chown=qrforge:qrforge /app/.next/standalone ./
COPY --from=build --chown=qrforge:qrforge /app/public ./public
COPY --from=build --chown=qrforge:qrforge /app/scripts/init-db.mjs /app/scripts/container-entrypoint.mjs /app/scripts/esquema.sql ./scripts/
USER qrforge
EXPOSE 3459
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3459/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/container-entrypoint.mjs"]
