#!/usr/bin/env node
/**
 * Node 0.5.0 → Go → Node sobre la MISMA base, y nunca los dos a la vez.
 *
 * Es la prueba que decide si se puede cambiar de implementación y volver: lo
 * que una escribe, la otra lo tiene que entender, y **volver atrás no puede
 * resucitar nada** — ni un escaneo ya retirado ni una sesión ya revocada.
 *
 * Lo lanza `test-compatibilidad.sh`, que arranca y para cada implementación en
 * su turno y comprueba que el puerto queda libre en medio.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const paso = process.argv[2];
const BASE = process.env.BASE;
const DB = process.env.QRFORGE_DB_PATH;
const ESTADO = process.env.ESTADO;

let pasan = 0, fallan = 0;
const check = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`  ${ok ? "✓" : "✗"} ${nombre}${ok ? "" : `  (esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)})`}`);
  ok ? pasan++ : fallan++;
};
const resumen = () => {
  console.log(`\n${pasan} pasan, ${fallan} fallan`);
  process.exit(fallan === 0 ? 0 : 1);
};

const sql = (consulta) =>
  execFileSync("sqlite3", [DB, consulta], { encoding: "utf8" }).trim();

const leer = () => JSON.parse(readFileSync(ESTADO, "utf8"));
const guardar = (o) => writeFileSync(ESTADO, JSON.stringify(o));

// La sesión se inserta directamente: lo que se prueba aquí es el FORMATO de los
// datos, no el login, que ya tiene su propia suite. La fila lleva el sha256 del
// token, que es justo el contrato entre las dos implementaciones.
const cookieDe = (token) => `qrforge_session=${token}`;
const sembrarSesion = (token, userId, horas = 12) => {
  const id = createHash("sha256").update(token).digest("hex");
  const ahora = Math.floor(Date.now() / 1000);
  sql(`INSERT INTO sessions (id, user_id, created_at, expires_at)
       VALUES ('${id}', '${userId}', ${ahora}, ${ahora + horas * 3600})`);
  return id;
};

const api = async (ruta, opciones = {}) => {
  const r = await fetch(BASE + ruta, {
    ...opciones,
    headers: { ...(opciones.body ? { "Content-Type": "application/json" } : {}), ...opciones.headers },
  });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* no era JSON */ }
  return { status: r.status, body: cuerpo };
};

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);
const TOKEN_REVOCADO = "c".repeat(64);

if (paso === "sembrar-node") {
  console.log("Node 0.5.0 siembra");
  // Dos cuentas y sus sesiones, escritas en la base como las escribiría el login.
  const ahora = Math.floor(Date.now() / 1000);
  sql(`INSERT INTO users (id, oidc_sub, email, name, created_at, last_seen_at)
       VALUES ('user-a','sub-a','a@example.invalid','A',${ahora},${ahora}),
              ('user-b','sub-b','b@example.invalid','B',${ahora},${ahora})`);
  sembrarSesion(TOKEN_A, "user-a");
  sembrarSesion(TOKEN_B, "user-b");
  const revocada = sembrarSesion(TOKEN_REVOCADO, "user-a");

  const dinamico = await api("/api/qr", {
    method: "POST", headers: { cookie: cookieDe(TOKEN_A) },
    body: JSON.stringify({ title: "Cartel", destinationUrl: "https://example.com/uno", customSlug: "cartel" }),
  });
  check("crea un dinámico", dinamico.status, 201);
  const estatico = await api("/api/qr", {
    method: "POST", headers: { cookie: cookieDe(TOKEN_A) },
    body: JSON.stringify({ title: "WiFi", type: "static", staticKind: "wifi",
      staticPayload: "WIFI:T:WPA;S:Mi Red;P:clave;;", customSlug: "wifi" }),
  });
  check("y un estático", estatico.status, 201);
  const ajeno = await api("/api/qr", {
    method: "POST", headers: { cookie: cookieDe(TOKEN_B) },
    body: JSON.stringify({ title: "De B", destinationUrl: "https://example.com/b", customSlug: "deb" }),
  });
  check("y B tiene el suyo", ajeno.status, 201);

  // Escaneos de verdad, por la ruta pública.
  for (let i = 0; i < 3; i++) await fetch(`${BASE}/r/cartel`, { redirect: "manual" });
  check("los escaneos se registran", Number(sql("SELECT COUNT(*) FROM qr_scans")), 3);

  // Y una sesión revocada: se borra, que es como se revoca aquí.
  sql(`DELETE FROM sessions WHERE id = '${revocada}'`);
  check("la sesión revocada ya no vale", (await api("/api/qr", { headers: { cookie: cookieDe(TOKEN_REVOCADO) } })).status, 401);

  guardar({ escaneos: 3 });
  resumen();
}

if (paso === "verificar-go") {
  console.log("Go, sobre lo que dejó Node 0.5.0");
  const lista = await api("/api/qr", { headers: { cookie: cookieDe(TOKEN_A) } });
  check("la sesión de Node sirve en Go", lista.status, 200);
  check("  y ve sus dos QRs", lista.body.qrs.length, 2);
  const cartel = lista.body.qrs.find((q) => q.id === "cartel");
  check("  con el destino intacto", cartel.destinationUrl, "https://example.com/uno");
  check("  y sus escaneos contados", cartel.scanCount, leer().escaneos);
  const wifi = lista.body.qrs.find((q) => q.id === "wifi");
  check("  el estático conserva su payload", wifi.staticPayload, "WIFI:T:WPA;S:Mi Red;P:clave;;");
  check("  y su tipo", [wifi.type, wifi.staticKind], ["static", "wifi"]);
  check("A no ve lo de B", lista.body.qrs.some((q) => q.id === "deb"), false);
  check("la sesión revocada sigue revocada", (await api("/api/qr", { headers: { cookie: cookieDe(TOKEN_REVOCADO) } })).status, 401);

  // El redirect sigue funcionando y sumando sobre lo ya contado.
  const salto = await fetch(`${BASE}/r/cartel`, { redirect: "manual" });
  check("el QR impreso sigue redirigiendo", [salto.status, salto.headers.get("location")], [302, "https://example.com/uno"]);

  // Go escribe: cambia el destino —que es para lo que existe un QR dinámico— y
  // crea uno nuevo.
  check("Go cambia el destino", (await api("/api/qr/cartel", {
    method: "PATCH", headers: { cookie: cookieDe(TOKEN_A) },
    body: JSON.stringify({ destinationUrl: "https://example.com/nuevo" }),
  })).status, 200);
  const nuevo = await api("/api/qr", {
    method: "POST", headers: { cookie: cookieDe(TOKEN_A) },
    body: JSON.stringify({ title: "De Go", destinationUrl: "https://example.com/go", customSlug: "dego" }),
  });
  check("y crea uno suyo", nuevo.status, 201);
  const trasCambio = await fetch(`${BASE}/r/cartel`, { redirect: "manual" });
  check("el MISMO QR ya apunta al destino nuevo", trasCambio.headers.get("location"), "https://example.com/nuevo");

  guardar({ escaneos: Number(sql("SELECT COUNT(*) FROM qr_scans")) });
  resumen();
}

if (paso === "verificar-node") {
  console.log("Node 0.5.0 otra vez: la vuelta atrás");
  const lista = await api("/api/qr", { headers: { cookie: cookieDe(TOKEN_A) } });
  check("la sesión sigue valiendo", lista.status, 200);
  check("Node lee lo que creó Go", lista.body.qrs.some((q) => q.id === "dego"), true);
  const cartel = lista.body.qrs.find((q) => q.id === "cartel");
  check("y el destino que cambió Go", cartel.destinationUrl, "https://example.com/nuevo");
  check("los escaneos siguen ahí", cartel.scanCount, leer().escaneos);
  check("la sesión revocada NO resucita", (await api("/api/qr", { headers: { cookie: cookieDe(TOKEN_REVOCADO) } })).status, 401);
  const salto = await fetch(`${BASE}/r/dego`, { redirect: "manual" });
  check("y el QR que creó Go redirige", [salto.status, salto.headers.get("location")], [302, "https://example.com/go"]);

  // Integridad, y claves foráneas aparte: son comprobaciones distintas y la
  // segunda hay que pedirla.
  check("integridad de la base", sql("PRAGMA integrity_check"), "ok");
  check("sin filas huérfanas", sql("PRAGMA foreign_key_check"), "");
  resumen();
}
