#!/usr/bin/env node
/**
 * El recorrido completo en un navegador de verdad.
 *
 * Lo que sólo se ve así: que el QR descargado DECODIFICA al valor esperado, que
 * cambiar el destino mueve el MISMO código impreso, que los estilos están
 * aplicados, y que la consola no escupe errores.
 *
 * Lo lanza `test-navegador.sh`, que levanta la aplicación, un proveedor que
 * completa el login y un proxy TLS —las cookies `Secure` no viajan por http, y
 * desactivarlas no probaría lo que se despliega—.
 */
import { chromium } from "@playwright/test";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import QRCode from "qrcode";

const BASE = process.env.BASE;
const PUERTO_APP = Number(process.env.PUERTO_APP);
const PUERTO_TLS = Number(process.env.PUERTO_TLS);
const PUERTO_IDP = Number(process.env.PUERTO_IDP);

let pasan = 0, fallan = 0;
const check = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`  ${ok ? "✓" : "✗"} ${nombre}${ok ? "" : `  (esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)})`}`);
  ok ? pasan++ : fallan++;
};

// ── El proveedor de mentira, que sí completa el inicio de sesión ─────
const codigos = new Map();
const idp = createHttpServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PUERTO_IDP}`);
  const json = (o) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(o));
  const emisor = `http://127.0.0.1:${PUERTO_IDP}/application/o/qr-forge`;
  if (u.pathname.endsWith("/.well-known/openid-configuration")) {
    return json({
      issuer: emisor,
      authorization_endpoint: `${emisor}/authorize`,
      token_endpoint: `${emisor}/token`,
      userinfo_endpoint: `${emisor}/userinfo`,
      end_session_endpoint: `${emisor}/logout`,
      jwks_uri: `${emisor}/jwks`,
    });
  }
  if (u.pathname.endsWith("/authorize")) {
    const codigo = randomUUID();
    codigos.set(codigo, true);
    const vuelta = new URL(u.searchParams.get("redirect_uri"));
    vuelta.searchParams.set("code", codigo);
    vuelta.searchParams.set("state", u.searchParams.get("state"));
    return res.writeHead(302, { Location: vuelta.toString() }).end();
  }
  if (u.pathname.endsWith("/token")) return json({ access_token: "de-pruebas", token_type: "Bearer" });
  if (u.pathname.endsWith("/userinfo")) {
    return json({ sub: "sub-navegador", email: "persona@example.invalid", name: "Persona" });
  }
  if (u.pathname.endsWith("/jwks")) return json({ keys: [] });
  // El cierre de sesión del proveedor: la aplicación manda aquí al salir, y sin
  // esto el recorrido acababa con un 404 en consola que no era del producto.
  if (u.pathname.endsWith("/logout")) {
    return res.writeHead(302, { Location: `https://127.0.0.1:${PUERTO_TLS}/` }).end();
  }
  res.writeHead(404).end();
});
await new Promise((listo) => idp.listen(PUERTO_IDP, "127.0.0.1", listo));

// ── El proxy TLS, para que las cookies Secure viajen ─────────────────
const proxy = createHttpsServer(
  { key: readFileSync(process.env.LLAVE), cert: readFileSync(process.env.CERT) },
  (req, res) => {
    const salida = httpRequest(
      { host: "127.0.0.1", port: PUERTO_APP, path: req.url, method: req.method,
        headers: { ...req.headers, "x-forwarded-proto": "https" } },
      (respuesta) => {
        res.writeHead(respuesta.statusCode ?? 502, respuesta.headers);
        respuesta.pipe(res);
      }
    );
    salida.on("error", () => res.writeHead(502).end());
    req.pipe(salida);
  }
);
await new Promise((listo) => proxy.listen(PUERTO_TLS, "127.0.0.1", listo));

// ── Decodificar de verdad lo descargado ─────────────────────────────
function decodificarPng(ruta) {
  const png = PNG.sync.read(readFileSync(ruta));
  const leido = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return leido?.data ?? null;
}

/**
 * El SVG no se rasteriza aquí. Se compara su rejilla con la que produce
 * `qrcode` para el texto esperado: si los dos dibujan los mismos módulos, el
 * SVG codifica ese texto. No se exige que sean idénticos byte a byte —no lo
 * son, ni tienen por qué—, sino que digan lo mismo.
 */
async function svgDiceLoMismo(ruta, esperado) {
  const svg = readFileSync(ruta, "utf8");
  // Las MISMAS opciones que usa la descarga: con otro margen o ancho el dibujo
  // cambia sin que cambie lo codificado, y la comparación diría que no coinciden
  // cuando sí lo hacen.
  const referencia = await QRCode.toString(esperado, { type: "svg", width: 1024, margin: 2 });
  const rejilla = (texto) => {
    const d = [...texto.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]).join(" ");
    return d.replace(/\s+/g, " ").trim();
  };
  const a = rejilla(svg), b = rejilla(referencia);
  return a.length > 0 && a === b;
}

const navegador = await chromium.launch();
const nuevoContexto = (extra = {}) => navegador.newContext({ ignoreHTTPSErrors: true, ...extra });

try {
  const contexto = await nuevoContexto();
  await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const pagina = await contexto.newPage();
  const consola = [], fallidas = [];
  pagina.on("console", (m) => { if (m.type() === "error") consola.push(m.text().slice(0, 160)); });
  // Un 404 se ve en consola sin decir de qué: se anota la URL, que es lo que
  // permite arreglarlo en vez de mirar un mensaje genérico.
  pagina.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("/r/")) consola.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  pagina.on("pageerror", (e) => consola.push(String(e).slice(0, 160)));
  pagina.on("requestfailed", (r) => fallidas.push(`${r.url().slice(0, 80)} ${r.failure()?.errorText}`));

  console.log("Sin sesión");
  const portada = await pagina.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("la portada responde", portada.status(), 200);
  check("  con CSP y su nonce", /nonce-/.test(portada.headers()["content-security-policy"] ?? ""), true);
  check("  y ofrece entrar", await pagina.getByRole("link", { name: /sign in/i }).count() > 0, true);
  // Los estilos, preguntándole al navegador qué aplicó: que el CSS responda 200
  // no distingue Tailwind procesado de su fuente sin generar.
  const borde = await pagina.locator("footer").evaluate((e) => getComputedStyle(e).borderTopWidth);
  check("  con los estilos aplicados", borde, "1px");
  check("  y el pie enlaza a los otros servicios",
    await pagina.locator('footer a[href="https://link.kaicorplabs.com"]').count() > 0, true);
  const logo = await pagina.locator("footer img").first().evaluate((e) => e.naturalWidth);
  check("  y el logo carga", logo > 0, true);

  console.log("\nEntrar de verdad, pasando por el proveedor");
  await pagina.goto(`${BASE}/api/auth/login?next=%2F`, { waitUntil: "networkidle" });
  check("vuelve a la aplicación", pagina.url().startsWith(`${BASE}/`), true);
  const galletas = await contexto.cookies();
  const sesion = galletas.find((c) => c.name === "qrforge_session");
  check("la cookie de sesión existe", Boolean(sesion), true);
  check("  es Secure", sesion?.secure, true);
  check("  es HttpOnly", sesion?.httpOnly, true);
  check("  es SameSite=Lax", sesion?.sameSite, "Lax");

  console.log("\nCrear un QR dinámico");
  await pagina.goto(`${BASE}/new`, { waitUntil: "networkidle" });
  const destino = `https://example.com/uno-${randomUUID().slice(0, 8)}`;
  await pagina.getByLabel(/title/i).first().fill("Cartel de prueba");
  const campoUrl = pagina.locator('input[type="url"], input[name="destinationUrl"]').first();
  await campoUrl.fill(destino);
  // Se espera la RESPUESTA de la creación y después la navegación: encadenar
  // sólo la navegación deja la prueba a merced de cuándo llegue el 201.
  const [creado] = await Promise.all([
    pagina.waitForResponse((r) => r.url().endsWith("/api/qr") && r.request().method() === "POST",
      { timeout: 20_000 }),
    pagina.getByRole("button", { name: /create qr/i }).click(),
  ]);
  check("la API acepta la creación", creado.status(), 201);
  // Ojo con el patrón: `/new` también encaja en «un segmento de slug», así que
  // esperar sólo eso resolvía sin haber navegado y el resto de la prueba miraba
  // el formulario creyendo que era la ficha.
  try {
    await pagina.waitForURL((u) => /^\/[a-z0-9-]{1,40}$/.test(new URL(u).pathname) &&
      new URL(u).pathname !== "/new", { timeout: 15_000 });
  } catch (e) {
    console.log("   [diag] url:", pagina.url());
    console.log("   [diag] consola:", JSON.stringify([...new Set(consola)]).slice(0, 400));
    console.log("   [diag] main:", (await pagina.locator("main").innerText()).slice(0, 200).replace(/\n+/g, " | "));
    throw e;
  }
  const slug = new URL(pagina.url()).pathname.slice(1);
  check("el QR se crea y abre su ficha", /^[a-z0-9-]{1,40}$/.test(slug), true);

  console.log("\nEl QR descargado dice lo que debe");
  const corta = `${BASE}/r/${slug}`;
  // La ficha pide sus datos a la API, así que hay que esperar a que termine de
  // pintarse: pulsar antes encuentra un «Loading…» y ningún botón.
  await pagina.getByRole("button", { name: /png/i }).first().waitFor({ timeout: 20_000 });
  for (const formato of ["png", "svg"]) {
    const descarga = await Promise.all([
      pagina.waitForEvent("download", { timeout: 20_000 }),
      pagina.getByRole("button", { name: new RegExp(formato, "i") }).first().click(),
    ]).then(([d]) => d);
    const ruta = await descarga.path();
    if (formato === "png") {
      check("el PNG decodifica a la URL corta", decodificarPng(ruta), corta);
    } else {
      check("y el SVG codifica lo mismo", await svgDiceLoMismo(ruta, corta), true);
    }
  }

  console.log("\nEscanear sin sesión, y cambiar el destino");
  const anonimo = await nuevoContexto();
  const visitante = await anonimo.newPage();
  const salto = await visitante.goto(corta, { waitUntil: "domcontentloaded" });
  check("el QR impreso lleva al destino", salto.url(), destino);
  check("  y no hizo falta sesión", (await anonimo.cookies()).length, 0);

  const nuevoDestino = `https://example.com/dos-${randomUUID().slice(0, 8)}`;
  await pagina.goto(`${BASE}/${slug}/edit`, { waitUntil: "networkidle" });
  const campoEdicion = pagina.locator('input[type="url"], input[name="destinationUrl"]').first();
  await campoEdicion.waitFor({ timeout: 20_000 });
  await campoEdicion.fill(nuevoDestino);
  // Guardar NO navega: la pantalla de edición se queda donde está y recarga, que
  // es lo que hace el producto. Se espera la respuesta del PATCH, que es el
  // hecho que importa.
  const [guardado] = await Promise.all([
    pagina.waitForResponse((r) => r.url().includes(`/api/qr/${slug}`) && r.request().method() === "PATCH",
      { timeout: 20_000 }),
    pagina.getByRole("button", { name: /save|guardar/i }).first().click(),
  ]);
  check("la edición se guarda", guardado.status(), 200);
  const otroSalto = await visitante.goto(corta, { waitUntil: "domcontentloaded" });
  // Esto es la promesa entera del producto: el papel no cambia, el destino sí.
  check("el MISMO código ya lleva al destino nuevo", otroSalto.url(), nuevoDestino);
  await anonimo.close();

  console.log("\nLas estadísticas cuentan lo que pasó");
  await pagina.goto(`${BASE}/${slug}`, { waitUntil: "networkidle" });
  await pagina.waitForFunction(() => document.body.innerText.includes("Total scans"), null, { timeout: 15_000 });
  const total = await pagina.locator("text=Total scans").locator("xpath=..").innerText();
  check("los dos escaneos están contados", /\b2\b/.test(total), true);

  console.log("\nDesactivar y salir");
  await pagina.getByRole("button", { name: /disable|desactivar/i }).first().click();
  await pagina.waitForTimeout(1500);
  const apagado = await nuevoContexto();
  const tras = await apagado.newPage().then((p) => p.goto(corta, { waitUntil: "domcontentloaded" }));
  check("un QR desactivado ya no redirige", tras.status(), 410);
  await apagado.close();

  await pagina.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await pagina.getByRole("button", { name: /account/i }).first().click();
  await pagina.getByRole("menuitem", { name: /sign out/i }).click();
  await pagina.waitForTimeout(1500);
  check("la sesión se retira",
    (await contexto.cookies()).some((c) => c.name === "qrforge_session" && c.value), false);

  console.log("\nLa intención de LinkUp, a través del login");
  const conIntencion = await nuevoContexto();
  const p2 = await conIntencion.newPage();
  const enlace = `${BASE}/new?url=${encodeURIComponent("https://link.example/abc")}&title=Desde+LinkUp&from=linkup`;
  await p2.goto(enlace, { waitUntil: "networkidle" });
  check("acaba en el formulario tras pasar por el proveedor", new URL(p2.url()).pathname, "/new");
  check("  con la URL puesta",
    await p2.locator('input[value="https://link.example/abc"]').count() > 0, true);
  check("  y el título", await p2.locator('input[value="Desde LinkUp"]').count() > 0, true);
  await conIntencion.close();

  console.log("\nMóvil");
  const movil = await nuevoContexto({ viewport: { width: 390, height: 844 } });
  const p3 = await movil.newPage();
  await p3.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const desborda = await p3.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("la portada no desborda a 390px", desborda, false);
  await movil.close();

  console.log("\nLo que la consola no dijo");
  check("sin errores de consola", [...new Set(consola)], []);
  check("sin peticiones fallidas", [...new Set(fallidas)], []);
} finally {
  await navegador.close();
  idp.close();
  proxy.close();
}

console.log(`\n${pasan} pasan, ${fallan} fallan`);
process.exit(fallan === 0 ? 0 : 1);
