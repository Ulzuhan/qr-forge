# Deployment and operations

QR-Forge runs as **one Go process** with embedded React assets and a writable
SQLite store. Do not run two application instances against the same database:
rate limits, scan queues and retention jobs are process-local.

## Docker Compose

1. Copy `.env.example` to `.env`; set the permanent HTTPS public origin and OIDC settings.
2. Keep `QRFORGE_DB_PATH=/data/qrforge.db` inside the container: `/data` is the writable volume.
3. Run `docker compose up -d --build`. The example binds only `127.0.0.1:3459`.
4. Expose the service through an HTTPS proxy. Never change the public origin casually: it is printed in existing QR codes.

The image runs as UID 10001, with a read-only root filesystem, no capabilities,
a private tmpfs and `no-new-privileges`. Go initializes a genuinely empty
SQLite database; an existing database is validated, never reset. Foreign
application databases are rejected. Node is used only in the asset build stage.

## Reverse proxy

Only trust proxy headers supplied by your controlled ingress. Replace or strip
client-supplied `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`,
`CF-Connecting-IP` and `CF-IPCountry`; they affect rate limits and country
analytics. In particular, do not pass arbitrary Cloudflare headers through a
non-Cloudflare ingress. Do not cache `/r/*`; redirects carry `no-store`.
Retain CSP, HSTS, `no-referrer` and `nosniff`. JSON bodies are capped at 64 KiB.

## Standalone / systemd

Build with `npm ci && npm run build` on a build machine. Install the resulting
`qrforge` executable in `/opt/qr-forge/qrforge`; no static directory, npm,
Node, database bootstrap script or source code is needed on the runtime host.

Create a `qrforge` system user, a writable `/var/lib/qrforge` (0700), and
`/etc/qr-forge.env` (0600) containing the public URL and OIDC settings. Set
`QRFORGE_DB_PATH=/var/lib/qrforge/qrforge.db` for this deployment, not the Docker
path. Install [deploy/qr-forge.service](deploy/qr-forge.service), reload systemd
and enable the service. Provision CA certificates for HTTPS to the IdP.

## Release verification

Before publishing: lint, typecheck, `npm test`, `go vet ./cmd/... ./internal/...`,
browser tests against the binary **and final image**, and the pinned rollback test.
Publishing is separate from deploying: pushes to main automatically publish
`:main`/`:sha-…`; version tags publish the version ladder and `:latest`.
The production compose must pin the approved registry index digest.

The publication workflow now signs build provenance and verifies the repository,
workflow, source commit and source ref. It also attaches the BuildKit SBOM and
scans the image. BuildKit metadata alone is not a signature. The initial 0.6.0
release predates this signing change; do not describe its provenance as signed.
Verify the exact new digest and successful release checks before deployment.

## Smoke and acceptance

Public: health, page rendered in a browser, processed CSS, logo/favicon/OG image,
robots/sitemap, unknown redirect 404, unauthenticated API 401 and OIDC redirect.
Authenticated with an authorized account: sign in, create, download and decode a
QR, scan without a session, change its destination, scan the **same** code,
check statistics, deactivate it, verify the redirect stops, and sign out.

Synthetic CI tests are not a substitute for this production account flow. The
repository cleanup does not claim that a previously pending authenticated smoke
was performed. Record acceptance and observation results in the deployment log.

## Shutdown

SIGTERM has a bounded budget: 5 seconds HTTP shutdown, 1 second for remaining
handlers after forced connection closure, 1 second for background tasks, then
1 second draining queued scans. Compose and systemd allow 10 seconds.

Forced shutdown can truncate responses. If handlers/tasks outlive their final
budget, the process logs it and proceeds; it does not guarantee their successful
completion. Scan analytics are best-effort: written, failed and pending counts
are logged, and analytics failure must never block a valid redirect.

`qrforge health` calls the cheap HTTP probe. Use `qrforge verificar` for
planned integrity/foreign-key checks, not every 30 seconds in the healthcheck.

## Data, backups and retention

SQLite stores users, hashed sessions, QR codes and scans. Timestamps on disk are
Unix seconds. No IP or Referer is persisted in scan rows; country is validated
and User-Agent is truncated. Scan retention defaults to 365 days; cleanup runs
at startup and every six hours. Sessions default to 12 hours (maximum 24);
valid back-channel notifications revoke them by deleting session rows.

Use a coherent SQLite backup, not a copy of only the database file while WAL is
active, for example `sqlite3 /path/qrforge.db '.backup /private/backup.db'`.
Restrict/encrypt backups and test restoration. No destructive reset command is
included. Any future schema migration requires a backup, rehearsal on a copy,
explicit authorization and integrity checks.

## Rollback

The last Node release remains available without retaining its backend source:

```text
ghcr.io/ulzuhan/qr-forge:0.5.0@sha256:cbe1f7a131443c3113b39502c27159b41969f785ab552e8de234d17adb8b53d5
```

In the infrastructure compose, restore that image and the original command
`exec node scripts/container-entrypoint.mjs` in the **qr-forge block only**,
then recreate only that service. The Node executable/entrypoint are inside the
historical image, not this source tree. Never run both writers together.

Use the current database; do **not** restore a stale backup for a normal rollback:
it would lose scans and could reactivate revoked sessions. The compatibility
suite validates Node → Go → Node against this exact image on synthetic data.
Rollback also restores that release's known behavior/limitations; it is an
emergency option, not a reason to retain two maintained backends.

## Monitoring

Watch health, restarts/OOM, response errors/latency, memory/CPU, DB/WAL growth,
free space, backup failures and retention errors. Rate-limited scan recording
must not prevent redirects. A deployment must not recreate unrelated services.
