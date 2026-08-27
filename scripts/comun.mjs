/**
 * Lo que comparten las suites HTTP.
 *
 * La identidad la lleva Authentik entera, así que las pruebas abren sesión como
 * la abre la aplicación: el token va en la cookie y en la base se guarda su
 * SHA-256, nunca el token. Por eso hay que replicar el hash aquí — un volcado de
 * la base no da sesiones usables, que es justamente lo que se quiere.
 */
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

export const BASE = process.env.BASE || "http://127.0.0.1:3996";
const BD = process.env.QRFORGE_DB_PATH || "./qrforge.db";

let pasan = 0;
let fallan = 0;

export function check(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(
    `  ${ok ? "✓" : "✗"} ${nombre}${ok ? "" : `  (esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)})`}`
  );
  if (ok) pasan++;
  else fallan++;
}

export function nota(nombre, valor) {
  console.log(`  · ${nombre}: ${typeof valor === "string" ? valor : JSON.stringify(valor)}`);
}

export function resumen() {
  console.log(`\n${pasan} pasan, ${fallan} fallan`);
  process.exit(fallan === 0 ? 0 : 1);
}

export const consulta = (q) => execFileSync("sqlite3", [BD, q], { encoding: "utf8" }).trim();

export function sesion(uid) {
  const ahora = Date.now();
  consulta(
    `INSERT OR REPLACE INTO users (id, oidc_sub, email, name, created_at, last_seen_at) ` +
      `VALUES ('${uid}','sub-${uid}','${uid}@example.invalid','${uid}',${ahora},${ahora});`
  );
  const token = randomBytes(32).toString("hex");
  consulta(
    `INSERT INTO sessions (id, user_id, created_at, expires_at) ` +
      `VALUES ('${createHash("sha256").update(token).digest("hex")}','${uid}',${ahora},${ahora + 86_400_000});`
  );
  return `qrforge_session=${token}`;
}

export async function api(ruta, { cookie, metodo = "GET", cuerpo, tipo = "application/json", cabeceras = {} } = {}) {
  const res = await fetch(BASE + ruta, {
    method: metodo,
    redirect: "manual",
    headers: { ...(cuerpo !== undefined ? { "Content-Type": tipo } : {}), ...(cookie ? { cookie } : {}), ...cabeceras },
    ...(cuerpo !== undefined ? { body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) } : {}),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body, location: res.headers.get("location") };
}

export const crear = (cookie, campos = {}) =>
  api("/api/qr", {
    cookie,
    metodo: "POST",
    cuerpo: { title: "prueba", type: "dynamic", destinationUrl: "https://ejemplo.example/x", ...campos },
  });
