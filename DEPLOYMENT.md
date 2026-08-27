# Despliegue y operación

QR Forge está expuesto públicamente por `/r/<slug>` y conserva datos duraderos en SQLite. Debe ejecutarse como **una sola instancia** detrás de un proxy HTTPS: SQLite, el rate limit y las tareas de retención son locales al proceso.

## Docker Compose

1. Copia `.env.example` a `.env`, configura OIDC y fija `QRFORGE_PUBLIC_URL` al origen HTTPS definitivo. Ese origen queda impreso físicamente en cada QR dinámico.
2. Ejecuta `docker compose up -d --build`.
3. Publica únicamente el proxy TLS; Compose enlaza la aplicación a `127.0.0.1:3459`.

El contenedor corre como UID 10001, sin capacidades, con raíz de solo lectura y un volumen escribible exclusivamente para SQLite. Si el fichero no existe, `init-db.mjs` crea el esquema; nunca reinicializa una base existente.

## Proxy inverso

El proxy debe reemplazar —no anexar desde el cliente— `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `CF-Connecting-IP` y `CF-IPCountry`. La aplicación usa esas cabeceras para rate limit y país; confiar en valores enviados directamente por internet permite falsearlos. No caches `/r/*`: cada respuesta incluye `no-store`, pero el borde debe respetarla.

Ejemplo nginx básico:

```nginx
location / {
  client_max_body_size 64k;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://127.0.0.1:3459;
}
```

La aplicación limita también el JSON en streaming a 64 KiB. Mantén `Referrer-Policy: no-referrer`, CSP, HSTS y `X-Content-Type-Options` tal como se sirven.

## systemd

Instala el standalone en `/opt/qr-forge`, incluidos `public`, `.next/static` y `scripts/{init-db.mjs,esquema.sql}`. Crea el usuario `qrforge`, `/var/lib/qrforge` con modo `0700` y `/etc/qr-forge.env` con modo `0600`. Copia `deploy/qr-forge.service`, ejecuta `systemctl daemon-reload` y habilita la unidad. El servidor debe tener Node en `/usr/bin/node` o debe ajustarse esa ruta.

## Datos, privacidad y retención

QR Forge persiste cuentas espejo, sesiones, códigos y escaneos. No guarda IP ni Referer de los escaneos; conserva sólo fecha, país validado y User-Agent truncado. `QRFORGE_SCAN_RETENTION_DAYS` vale 365 por defecto y la limpieza corre al arrancar y cada seis horas. Los límites son 1000 QR por cuenta y 120 creaciones por hora de identidad+IP por defecto.

Las sesiones están revocables en DB y duran 12 horas por defecto, máximo 24. Deshabilitar una cuenta en OIDC no borra automáticamente una sesión local ya emitida: elimina sus filas de `sessions` para revocarla inmediatamente.

## Backups y migraciones

No copies sólo `qrforge.db` mientras el servicio escribe en modo WAL. Usa la API de backup de SQLite, `sqlite3 /var/lib/qrforge/qrforge.db '.backup /ruta/backup.db'`, y cifra/restringe el resultado. Prueba restauraciones y conserva backups menos tiempo que los datos de escaneo.

`npm run db:reset` es destructivo y se niega salvo que se definan explícitamente `QRFORGE_DB_PATH` y `QRFORGE_ALLOW_DB_RESET=YES`. No es una herramienta de upgrade de producción. Antes de una migración: backup coherente, prueba sobre copia, parada del servicio, aplicación y `PRAGMA foreign_key_check`.

## Monitorización e incidentes

Supervisa latencia y códigos 401/403/409/413/429/500/507, tamaño de DB/WAL, espacio, fallos de backup, reinicios y errores de retención. Un crecimiento brusco de escaneos puede ser abuso; el redirect sigue funcionando pero sólo se registran 30 escaneos por minuto por slug e IP.

Antes de desplegar ejecuta `npm ci`, `npm run lint`, `npm run test:unit`, `npm run build`, `npm run test:http`, `npx tsc --noEmit`, `npm audit --omit=dev`, `docker compose config -q` y `docker build --check .`.
