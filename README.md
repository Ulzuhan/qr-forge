# QR-Forge

QR dinámicos y estáticos, autoalojados. El QR impreso nunca cambia: cambias a
dónde apunta.

- **Dinámico**: el QR codifica `<URL pública>/r/<slug>`, que redirige al destino
  y anota el escaneo (fecha, país, user-agent). El destino se edita cuando
  quieras sin reimprimir nada.
- **Estático**: el QR codifica el contenido directamente (URL, WiFi, email,
  texto). No pasa por la app, así que no hay estadísticas — y sigue funcionando
  aunque el servidor esté caído.

## Acceso

Las cuentas viven en **Authentik** (`auth.kaicorplabs.com`), no aquí: entrar es
un flujo OIDC (`lib/oidc.ts`), y quién puede entrar lo decide el proveedor, que
solo emite tokens para quien esté en el grupo `qr-forge`. Pedir cuenta y que la
aprueben ocurre allí. Esta aplicación solo guarda un espejo de la identidad
(`users.oidc_sub`) para poder decir de quién es cada QR, y su propia sesión —
una cookie cuyo hash vive en la base de datos, revocable. Ver `lib/auth.ts`.

Cada cuenta ve y gestiona **solo sus propios QR**.

Lo único público es **`/r/<slug>`**: es lo que codifican los QR impresos y tiene
que funcionar para cualquiera, siempre, sin sesión. Todo lo demás exige sesión y
además comprueba el dueño; pedir un QR ajeno responde 404, no 403, para no
confirmar que ese slug existe.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `QRFORGE_PUBLIC_URL` | URL pública desde la que se sirve (ej. `https://qr.kaicorplabs.com`). **Es lo que se imprime en los QR**: fíjala en producción, o un QR generado desde localhost o desde la VPN llevará esa URL privada al papel. Sin ella se deduce de la petición. |
| `QRFORGE_OIDC_CLIENT_ID` / `_SECRET` | Credenciales del cliente OIDC en Authentik. Sin ellas nadie puede entrar. |
| `QRFORGE_OIDC_REDIRECT_URI` | Debe coincidir con una de las registradas en el proveedor. |
| `QRFORGE_OIDC_PUBLIC_BASE` | Authentik tal como lo ve el navegador (`https://auth.kaicorplabs.com`). |
| `QRFORGE_OIDC_INTERNAL_BASE` | Authentik tal como lo ve este servidor (`http://127.0.0.1:9100`): canjear el código no necesita dar la vuelta por internet. |
| `QRFORGE_DB_PATH` | Ruta del SQLite (por defecto `./qrforge.db`). |

## Desarrollo

```bash
npm run dev          # http://localhost:3000
npm run db:reset     # BORRA la DB y reaplica drizzle/*.sql
npm run build && npm start
```

En producción corre como servicio de usuario systemd (`qr-forge.service`, puerto
3459) detrás de un túnel de Cloudflare.

## Base de datos

SQLite con Drizzle. `users` (espejo de la identidad de Authentik) · `sessions` ·
`qr_codes` (con `user_id`) · `qr_scans`. Las claves foráneas van en cascada, pero SQLite solo las aplica si
la conexión activa `PRAGMA foreign_keys = ON` — la app lo hace (`db/index.ts`);
el CLI `sqlite3` **no**, así que un `DELETE FROM users` a mano deja huérfanos.
