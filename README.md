# QR-Forge

Dynamic and static QR codes, self-hosted. The printed QR never changes: you change where it points.

[![CI](https://github.com/Ulzuhan/qr-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/Ulzuhan/qr-forge/actions/workflows/ci.yml)

- **Dynamic**: the QR encodes `<public URL>/r/<slug>`, which redirects to the destination and records the scan (date, country, user-agent). Edit the destination whenever you like without reprinting anything.
- **Static**: the QR encodes the content directly (URL, WiFi, email, text). It never touches the app, so there are no statistics — and it keeps working even when the server is down.

## Access

Accounts live in **Authentik** (`auth.kaicorplabs.com`), not here: signing in is an OIDC flow (`lib/oidc.ts`), and who gets in is decided by the provider, which only issues tokens for members of the `qr-forge` group. Requesting an account and getting it approved happens there. This application only keeps a mirror of the identity (`users.oidc_sub`) so it can tell who owns each QR, plus its own session — a cookie whose hash lives in the database, revocable. See `lib/auth.ts`.

Each account sees and manages **only its own QR codes**.

The only public route is **`/r/<slug>`**: it is what printed QR codes encode, and it has to work for anyone, always, without a session. Everything else requires a session and also checks ownership; requesting someone else's QR returns 404, not 403, so the response does not confirm that the slug exists.

## Environment variables

| Variable | Purpose |
|---|---|
| `QRFORGE_PUBLIC_URL` | Public URL the app is served from (e.g. `https://qr.kaicorplabs.com`). **This is what gets printed into the QR codes**: pin it in production, or a QR generated from localhost or from inside the VPN will carry that private URL onto paper. If unset, it is derived from the request. |
| `QRFORGE_OIDC_CLIENT_ID` / `_SECRET` | OIDC client credentials in Authentik. Without them nobody can sign in. |
| `QRFORGE_OIDC_REDIRECT_URI` | Must match one of the URIs registered in the provider. |
| `QRFORGE_OIDC_PUBLIC_BASE` | Authentik as the browser sees it (`https://auth.kaicorplabs.com`). |
| `QRFORGE_OIDC_INTERNAL_BASE` | Authentik as this server sees it (`http://127.0.0.1:9100`): redeeming the authorization code never has to round-trip through the internet. |
| `QRFORGE_DB_PATH` | SQLite path (default `./qrforge.db`). |

## Development

```bash
npm run dev          # http://localhost:3000
npm run db:reset     # WIPES the DB and reapplies drizzle/*.sql
npm run build && npm start
```

In production it runs as a systemd user service (`qr-forge.service`, port 3459) behind a Cloudflare tunnel.

## Database

SQLite with Drizzle. `users` (mirror of the Authentik identity) · `sessions` · `qr_codes` (with `user_id`) · `qr_scans`. Foreign keys cascade, but SQLite only enforces them when the connection enables `PRAGMA foreign_keys = ON` — the app does (`db/index.ts`); the `sqlite3` CLI does **not**, so a manual `DELETE FROM users` leaves orphans behind.
