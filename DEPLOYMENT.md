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

## El backend es Go desde 0.6.0

**Desplegado el 07-09-2026.** Digest en producción:
`ghcr.io/ulzuhan/qr-forge:0.6.0@sha256:d0a6a5b93aef6de10792b74f946eb2b456975f3486e3adbf345281f0a6e9a672`
(el índice, que es lo que resuelve la etiqueta; el manifiesto amd64 es
`sha256:9935238f…`). Retorno: `0.5.0@sha256:cbe1f7a1…`.

`Dockerfile` construye la imagen con el backend en Go y la interfaz React
embebida. El de Node queda en `Dockerfile.node` y **ya no se publica**: se
conserva mientras dure la observación, porque es con lo que se valida el
retorno a 0.5.0.

Cambia una sola cosa de la receta: **desaparece el entrypoint de Node**. La base
la inicializa el binario, que además nunca reinicializa una existente ni adopta
una de otra aplicación. En el compose de infraestructura eso son dos líneas —la
imagen y `exec node scripts/container-entrypoint.mjs` → `exec qrforge`— y nada
más: mismos puertos, volumen, redes, límites y variables.

### El apagado, y lo que no garantiza

Al recibir SIGTERM el binario cierra el HTTP y espera; si el plazo vence con
conexiones abiertas las cierra a la fuerza, **espera a que los manejadores
salgan**, para los trabajos de fondo, escribe lo que quede en la cola de
escaneos y sólo entonces cierra SQLite. El reparto es 5 + 1 + 1 + 1 segundos,
dentro de los 10 de `stop_grace_period`.

**Limitación conocida, y conviene tenerla escrita.** Cuando hay que forzar el
cierre, las respuestas de las peticiones que seguían abiertas se truncan: quien
estuviera descargando o esperando una respuesta la ve cortada. Es deliberado —la
alternativa es consultar una base ya cerrada, que es peor— pero significa que un
despliegue puede cortar peticiones en curso. Y si tras el plazo de manejadores
alguno sigue dentro, se cierra igualmente y se registra: quedarse esperando sólo
garantiza el SIGKILL del contenedor, que corta todo sin escribir nada. Los
escaneos que no lleguen a escribirse se cuentan y se registran; la analítica es
best-effort y no bloquea nunca una redirección.

Probada con las restricciones productivas puestas (uid 10001, raíz de sólo
lectura, tmpfs, `cap_drop: ALL`, no-new-privileges, 256 PIDs, 512 MiB, 1,5 CPU y
el fichero de entorno): pasa a `healthy`, crea la base con WAL en el volumen y
ocupa 2,8 MiB en reposo.

`qrforge verificar` corre las comprobaciones caras —`integrity_check` y
`foreign_key_check`— para validar un despliegue o hacer mantenimiento. El
healthcheck no las hace: recorrerían la base entera cada treinta segundos.

**Vuelta atrás**: la imagen 0.5.0 anterior, sobre la misma base. Está probado
—Node 0.5.0 → Go → Node sobre la misma base sintética— que lo que escribe una lo
lee la otra y que volver no resucita escaneos ni sesiones revocadas. El backup es
recuperación de desastre, no rollback: restaurarlo perdería escaneos y podría
reactivar sesiones ya cerradas.

## Datos, privacidad y retención

QR Forge persiste cuentas espejo, sesiones, códigos y escaneos. No guarda IP ni Referer de los escaneos; conserva sólo fecha, país validado y User-Agent truncado. `QRFORGE_SCAN_RETENTION_DAYS` vale 365 por defecto y la limpieza corre al arrancar y cada seis horas. Los límites son 1000 QR por cuenta y 120 creaciones por hora de identidad+IP por defecto.

Las sesiones están revocables en DB y duran 12 horas por defecto, máximo 24. Deshabilitar una cuenta en OIDC no borra automáticamente una sesión local ya emitida: elimina sus filas de `sessions` para revocarla inmediatamente.

## Backups y migraciones

No copies sólo `qrforge.db` mientras el servicio escribe en modo WAL. Usa la API de backup de SQLite, `sqlite3 /var/lib/qrforge/qrforge.db '.backup /ruta/backup.db'`, y cifra/restringe el resultado. Prueba restauraciones y conserva backups menos tiempo que los datos de escaneo.

`npm run db:reset` es destructivo y se niega salvo que se definan explícitamente `QRFORGE_DB_PATH` y `QRFORGE_ALLOW_DB_RESET=YES`. No es una herramienta de upgrade de producción. Antes de una migración: backup coherente, prueba sobre copia, parada del servicio, aplicación y `PRAGMA foreign_key_check`.

## Monitorización e incidentes

Supervisa latencia y códigos 401/403/409/413/429/500/507, tamaño de DB/WAL, espacio, fallos de backup, reinicios y errores de retención. Un crecimiento brusco de escaneos puede ser abuso; el redirect sigue funcionando pero sólo se registran 30 escaneos por minuto por slug e IP.

Antes de desplegar ejecuta `npm ci`, `npm run lint`, `npm run test:unit`, `npm run build`, `npm run test:http`, `npx tsc --noEmit`, `npm audit --omit=dev`, `docker compose config -q` y `docker build --check .`.
