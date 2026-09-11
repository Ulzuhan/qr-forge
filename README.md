# QR-Forge

Dynamic and static QR codes, self-hosted. The printed QR never changes: you change where it points.

**React in the browser, Go on the server.** Since 0.6.0, a single Go process
serves the API, authentication, redirects and embedded Vite assets. QR previews
and PNG/SVG generation stay in the browser. The production image has no Node,
npm or browser runtime; Node is needed only to build the frontend and run tests.

[![CI](https://github.com/Ulzuhan/qr-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/Ulzuhan/qr-forge/actions/workflows/ci.yml)
[![Container image](https://github.com/Ulzuhan/qr-forge/actions/workflows/docker.yml/badge.svg)](https://github.com/Ulzuhan/qr-forge/pkgs/container/qr-forge)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![One printed QR, its destination changed from the summer menu to the autumn menu without reprinting anything](assets/screenshot.jpg)

- **Dynamic**: the QR encodes `<public URL>/r/<slug>`, which redirects to the destination and records a minimized scan (date, country, truncated user-agent; never IP or Referer). Edit the destination whenever you like without reprinting anything.
- **Static**: the QR encodes the content directly (URL, WiFi, email, text). It never touches the app, so there are no statistics — and it keeps working even when the server is down.

## Access

Accounts live in the configured **OIDC provider**, not in a local password
database: any standard OIDC provider works, and none of their paths are written
into the code. The active integration is in `internal/auth/` and
`internal/httpapi/identidad.go`. Without OIDC
configuration nobody can sign in or create codes. SQLite keeps an identity
mirror (`users.oidc_sub`) and revocable sessions identified by a SHA-256 hash of
the cookie token; the raw token is not stored in the database.

Each account sees and manages **only its own QR codes**.

**`/r/<slug>` is public**: printed dynamic codes must work without a session.
The landing page, static assets, robots/sitemap, healthcheck and OIDC entrypoints
are also public. The management pages and QR APIs require a session and check
ownership; requesting another account's QR returns 404 rather than confirming
that it exists.

## Prefilling from another tool

`/new` accepts a preloaded form, so a tool that already has a URL can hand it
over instead of asking someone to copy and paste it.

```
GET /new?url=<url-encoded>&title=<text>&from=linkup
```

| Parameter | Required | Notes |
|---|---|---|
| `url` | yes | `http` or `https` only, up to 2000 characters. Without it there is no prefill. |
| `title` | no | Trimmed to 100 characters, the API's own limit. |
| `from` | no | Only `linkup` today. It selects the explanatory note, nothing else. |

Anything invalid is ignored in silence and the form opens as usual — a broken
URL is not the visitor's fault and an empty form is a perfectly useful answer.
**Nothing is created until save is pressed.** If you arrive without a session,
the intent survives the trip through the identity provider.


## Environment variables

| Variable | Purpose |
|---|---|
| `QRFORGE_PUBLIC_URL` | **Required by Go at startup.** Public HTTPS origin, without a path, query or fragment; HTTP is accepted only on loopback for development. This origin is printed into dynamic codes and is never inferred from the request. |
| `QRFORGE_OIDC_CLIENT_ID` / `_SECRET` | OIDC client credentials. Without them nobody can sign in. |
| `QRFORGE_OIDC_REDIRECT_URI` | Must match one of the URIs registered in the provider. |
| `QRFORGE_OIDC_ISSUER` | The provider's issuer URL. Every endpoint (authorize, token, userinfo, end-session, JWKS) is read from its `/.well-known/openid-configuration`, so no provider-specific paths are baked in |
| `QRFORGE_OIDC_INTERNAL_BASE` | The provider as this server sees it — redeeming the authorization code never leaves the internal network. Defaults to the issuer origin. |
| `QRFORGE_ACCOUNT_URL` | The provider's own account page — email, password, second factor, sessions. None of that belongs to this app, and without it the account menu simply does not link anywhere. Authentik serves it at `/if/user/`. |
| `QRFORGE_DB_PATH` | SQLite path; the Go default is `/data/qrforge.db`. Set a writable development path when running outside Docker. |
| `QRFORGE_INSECURE_COOKIES` | Set to `1` only for local HTTP development. Cookies are Secure by default; do not disable this in production. |
| `QRFORGE_PUBLIC_HOST` | Public hostname the origin check compares against. Unset, the incoming `Host` is used, which is right behind a tunnel that preserves it — verified. Only needed behind a proxy that rewrites `Host` with an internal name. |
| `QRFORGE_SESSION_TTL_HOURS` | Session lifetime, default 12 h and clamped to 1–24 h. |
| `QRFORGE_MAX_QRS_PER_USER` | Per-account quota; default 1000. |
| `QRFORGE_MAX_CREATES_PER_HOUR` | Creation rate per identity and IP; default 120. |
| `QRFORGE_SCAN_RETENTION_DAYS` | Scan retention; default 365 days. |

**A valid back-channel notification revokes existing sessions.** `POST /api/auth/backchannel-logout`
implements OIDC Back-Channel Logout, so the provider can end somebody's sessions
here the moment it ends its own — point it at that URL in the client's *Logout
URI*. Sessions also expire on their own after `QRFORGE_SESSION_TTL_HOURS` (12 by
default, 24 maximum), which is the bound that holds even when no notification
arrives: the provider only notifies clients whose access token is still alive.

## Build and run

Prerequisites: Node 22/npm (build and tests only), the Go toolchain in
[go.mod](go.mod), and a configured OIDC provider for authenticated use.

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:13459**. This compiles React assets, embeds them in Go,
and runs the Go server using an isolated `.local/qrforge.db`. Restart the command
after source changes; it does not run a second server or offer hot reload.
Without OIDC settings the public page works, but sign-in is unavailable.
Export settings before starting; the binary does not automatically load `.env`.
Insecure cookies are enabled only by this local HTTP development launcher.

To build a deployable executable:

```bash
npm run build
# Set QRFORGE_PUBLIC_URL, QRFORGE_DB_PATH and OIDC settings for your environment.
npm start
```

After building, `./qrforge` runs independently of Node and the source tree.
For Docker, copy [.env.example](.env.example) to `.env`, configure your public
origin/OIDC, then use `docker compose up -d --build`. See
[DEPLOYMENT.md](DEPLOYMENT.md) for HTTPS, persistent storage and rollback.

## Architecture

| Location | Responsibility |
|---|---|
| `cmd/qrforge` | Startup, health/integrity commands and bounded shutdown |
| `internal/httpapi` | HTTP API, authorization, HTML, redirects and bounded scan queue |
| `internal/auth` | OIDC discovery, PKCE and back-channel logout |
| `internal/store` | Explicit SQL, transactions, sessions and retention |
| `web/src` | React interface, QR rendering and PNG/SVG downloads |
| `internal/web` | Embedded Vite assets; generated output is not versioned |
| `scripts` | Isolated HTTP, browser and historical compatibility tests |

Go resolves sessions and serves each page; React handles interaction in the
browser. Client navigation uses normal links, so direct URLs and reloads follow
the same server authorization path. The shared KaiCorp theme keeps its design;
only explicitly public server data reaches the page.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:navegador
npm run test:compatibilidad
```

HTTP tests require Bash, curl, sqlite3 and Linux `ss`; browser tests also use
OpenSSL. Compatibility tests require Docker and pull the pinned historical
0.5.0 image. All fixtures use temporary synthetic databases, never production.

`npm test` builds the app and runs frontend unit tests, Go tests with the race
detector, HTTP contracts and signed synthetic back-channel notifications. CI also
runs `go vet`, tests the browser against the final image, and checks rollback
on the same synthetic database, with only one application writer at a time.

The test commands select Go by default. `QRFORGE_TEST_LAUNCH` and
`QRFORGE_TEST_BUILD_STAMP` can target another built artifact. The historical
Node image is solely a rollback fixture: there is no Next.js server, Drizzle
migration tool or alternative Node Dockerfile in the active source tree.
See [CONTRATOS.md](CONTRATOS.md) for behavior and regression coverage.

## Database

SQLite through Go's `database/sql` and `modernc.org/sqlite`, with explicit SQL
in `internal/store/`. No Node or Drizzle is required at runtime. The existing
schema is preserved: `users`, `sessions`, `qr_codes` and `qr_scans`; timestamps
on disk remain Unix seconds.

The application enables WAL and foreign keys. A separate `sqlite3` session must
enable foreign keys itself before maintenance; otherwise cascading deletes do
not apply. Use `qrforge health` for the lightweight healthcheck and
`qrforge verificar` for the expensive integrity/foreign-key checks during
planned maintenance. Never run two application writers against the same data.

## Project history

Version 0.6.0 replaced the Node backend with Go without changing printed URLs or
the SQLite format. The previous implementation remains in Git history and its
pinned release image; it is not needed to build or run this tree. Migration and
cleanup decisions are recorded in [docs/MIGRATION.md](docs/MIGRATION.md).

MIT licensed. Contributions should preserve the documented HTTP/data contracts;
run the checks above before opening a pull request.
