FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3459 QRFORGE_DB_PATH=/data/qrforge.db
WORKDIR /app
RUN groupadd --system --gid 10001 qrforge && useradd --system --uid 10001 --gid qrforge --home /nonexistent qrforge \
    && mkdir /data && chmod 0700 /data && chown qrforge:qrforge /data
COPY --from=build --chown=qrforge:qrforge /app/.next/standalone ./
COPY --from=build --chown=qrforge:qrforge /app/public ./public
COPY --from=build --chown=qrforge:qrforge /app/scripts/init-db.mjs /app/scripts/container-entrypoint.mjs /app/scripts/esquema.sql ./scripts/
USER qrforge
EXPOSE 3459
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3459/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/container-entrypoint.mjs"]
