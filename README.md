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

Cada cuenta ve y gestiona **solo sus propios QR**. Hay registro abierto
(`/register`) y login (`/login`); las contraseñas se guardan con scrypt y la
sesión es una cookie cuyo hash vive en la base de datos, así que se puede
revocar. Ver `lib/auth.ts`.

Lo único público es **`/r/<slug>`**: es lo que codifican los QR impresos y tiene
que funcionar para cualquiera, siempre, sin sesión. Todo lo demás exige sesión y
además comprueba el dueño; pedir un QR ajeno responde 404, no 403, para no
confirmar que ese slug existe.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `QRFORGE_PUBLIC_URL` | URL pública desde la que se sirve (ej. `https://qr.kaicorplabs.com`). **Es lo que se imprime en los QR**: fíjala en producción, o un QR generado desde localhost o desde la VPN llevará esa URL privada al papel. Sin ella se deduce de la petición. |
| `QRFORGE_REGISTRATION` | `open` (por defecto) o `closed` para no admitir cuentas nuevas. |
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

SQLite con Drizzle. `users` · `sessions` · `qr_codes` (con `user_id`) ·
`qr_scans`. Las claves foráneas van en cascada, pero SQLite solo las aplica si
la conexión activa `PRAGMA foreign_keys = ON` — la app lo hace (`db/index.ts`);
el CLI `sqlite3` **no**, así que un `DELETE FROM users` a mano deja huérfanos.
