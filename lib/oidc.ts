/**
 * Cliente OIDC (flujo de código de autorización con PKCE) — sin atarse a
 * ningún proveedor.
 *
 * Escrito a mano y sin dependencias: son unas pocas peticiones bien definidas,
 * y añadir una librería de autenticación entera para esto traería más
 * superficie que código propio.
 *
 * AQUÍ NO VIVE LA FORMA DE URL DE NADIE. Cada endpoint sale del documento de
 * discovery del propio proveedor (`<emisor>/.well-known/openid-configuration`),
 * así que esto vale igual con Authentik, con Keycloak o con cualquier otro.
 * Antes llevaba escrita a mano la forma de Authentik (`/application/o/…`): la
 * aplicación era portable en teoría y estaba atada en la práctica.
 *
 * Dos direcciones distintas del mismo proveedor, a propósito:
 *
 *   PÚBLICA   la que se manda al navegador. Tiene que ser alcanzable desde el
 *             móvil de quien entra. Sale del emisor.
 *   INTERNA   la que usa este servidor para canjear el código y pedir los datos
 *             del usuario. Ahorra dar la vuelta por internet para hablar con un
 *             proceso que está en la misma máquina.
 *
 * El discovery se pide por la pata INTERNA y luego cada endpoint se apunta a la
 * dirección que su llamante puede alcanzar: las rutas son del proveedor, las
 * direcciones son nuestras. Ése es todo el truco.
 *
 * El token de identidad NO se verifica criptográficamente: se obtiene del
 * endpoint de token en una llamada directa servidor-a-servidor, que es el caso
 * en el que la propia especificación (OIDC Core 3.1.3.7) permite saltarse la
 * comprobación de firma. Los datos del usuario se leen además de /userinfo.
 */
import { createHash, randomBytes } from "crypto";

export interface OidcConfig {
  /** El emisor público, tal y como lo anuncia el proveedor. */
  issuer: string;
  /** El origen al que se manda el navegador. Sale del emisor. */
  publicOrigin: string;
  /** El origen que usa este servidor. Cae al público si no se fija. */
  internalOrigin: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  timeoutMs: number;
}

function validUrl(raw: string | undefined, { allowHttp = false } = {}): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !((allowHttp || loopback) && url.protocol === "http:")) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, "");
  } catch { return null; }
}

export function oidcConfig(): OidcConfig | null {
  const clientId = process.env.QRFORGE_OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.QRFORGE_OIDC_CLIENT_SECRET?.trim();
  // El emisor es la única dirección del proveedor que hace falta: todo lo demás
  // se le pregunta a él.
  const issuer = validUrl(process.env.QRFORGE_OIDC_ISSUER);
  // La pata interna admite http con cualquier hostname: es el tramo
  // servidor→proveedor, y un alias de red de contenedores (authentik-server)
  // o un nombre de LAN son el caso normal — exigir loopback aquí dejaba el
  // login en 503 dentro de un contenedor, medido. El https obligatorio sigue
  // intacto para todo lo que visita el navegador.
  const internalOrigin = validUrl(
    process.env.QRFORGE_OIDC_INTERNAL_BASE ?? (issuer ? new URL(issuer).origin : undefined),
    { allowHttp: true }
  );
  const redirectUri = validUrl(process.env.QRFORGE_OIDC_REDIRECT_URI);
  const requestedTimeout = Number(process.env.QRFORGE_OIDC_TIMEOUT_MS ?? 10_000);
  const timeoutMs = Number.isFinite(requestedTimeout) ? Math.min(60_000, Math.max(1_000, requestedTimeout)) : 10_000;
  if (!clientId || !clientSecret || !issuer || !internalOrigin || !redirectUri) return null;
  return {
    issuer,
    publicOrigin: new URL(issuer).origin,
    internalOrigin,
    clientId,
    clientSecret,
    redirectUri,
    timeoutMs,
  };
}

/** Si falta configuración, la aplicación no puede dejar entrar a nadie. */
/**
 * La página de la cuenta en el proveedor: correo, contraseña, segundo factor, sesiones.
 *
 * Nada de eso lo lleva esta aplicación, y hasta ahora no había ninguna puerta hacia
 * ella: el menú de la cuenta tenía una sola línea, salir. Sin la variable no se enlaza
 * a ninguna parte; la ruta es cosa de cada proveedor —Authentik la sirve en
 * `/if/user/`— así que llega entera por entorno.
 */
export function accountUrl(): string | null {
  const raw = process.env.QRFORGE_ACCOUNT_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function oidcConfigured(): boolean {
  return oidcConfig() !== null;
}


// ─── Discovery ──────────────────────────────────────────────────────
export interface OidcEndpoints {
  authorization: string;
  token: string;
  userinfo: string;
  endSession: string | null;
  jwks: string | null;
  /** Los `iss` que se aceptan: el público y el interno. Ver más abajo. */
  issuers: string[];
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
let cache: { key: string; at: number; value: OidcEndpoints } | null = null;

/** Cambia el origen de una URL conservando su ruta: el camino lo elige el
 *  proveedor, la dirección la elegimos nosotros según quién va a llamar. */
function at(endpoint: string, origin: string): string {
  const url = new URL(endpoint);
  const target = new URL(origin);
  url.protocol = target.protocol;
  // `hostname` y `port` POR SEPARADO, nunca `host`: el setter de `host`
  // deja el puerto como estaba si el valor nuevo no trae uno. Con eso,
  // cambiar `http://proveedor-interno:9000/...` al origen público daba
  // `https://auth.publico:9000/...` — el puerto interno colado en la URL a la
  // que se manda el navegador, que desde fuera no existe. Pasó en producción.
  url.hostname = target.hostname;
  url.port = target.port;
  return url.toString();
}

export async function discover(cfg: OidcConfig): Promise<OidcEndpoints> {
  const key = `${cfg.issuer}|${cfg.internalOrigin}`;
  if (cache && cache.key === key && Date.now() - cache.at < DISCOVERY_TTL_MS) return cache.value;

  // Se pregunta por la pata interna: es la misma respuesta y no sale a la red.
  const url = `${at(cfg.issuer, cfg.internalOrigin).replace(/\/+$/, "")}/.well-known/openid-configuration`;
  let doc: Record<string, unknown>;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(cfg.timeoutMs) });
    if (!res.ok) throw new Error(`discovery: ${res.status}`);
    doc = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    // Un parpadeo del proveedor no debe tumbar los inicios de sesión mientras
    // se recuerde algo que funcionaba. Si no hay nada recordado, no hay forma
    // de construir las URLs y el error sube.
    if (cache && cache.key === key) return cache.value;
    throw err;
  }

  const need = (name: string): string => {
    const value = doc[name];
    if (typeof value !== "string" || !value) throw new Error(`discovery: sin ${name}`);
    return value;
  };
  const maybe = (name: string): string | null =>
    typeof doc[name] === "string" && doc[name] ? (doc[name] as string) : null;

  const advertised = typeof doc.issuer === "string" ? doc.issuer : cfg.issuer;
  const value: OidcEndpoints = {
    // Al navegador, por la dirección pública; al servidor, por la interna.
    authorization: at(need("authorization_endpoint"), cfg.publicOrigin),
    token: at(need("token_endpoint"), cfg.internalOrigin),
    userinfo: at(need("userinfo_endpoint"), cfg.internalOrigin),
    endSession: maybe("end_session_endpoint")
      ? at(maybe("end_session_endpoint")!, cfg.publicOrigin)
      : null,
    jwks: maybe("jwks_uri") ? at(maybe("jwks_uri")!, cfg.internalOrigin) : null,
    // DOS emisores válidos, y no es laxitud: los tokens que nacen del canje
    // servidor-a-servidor llevan el `iss` INTERNO, porque esa es la dirección
    // por la que se pidieron. Aceptar solo el público rechazaría lo que el
    // propio proveedor manda (visto con el aviso de cierre de sesión).
    issuers: [...new Set([advertised, at(advertised, cfg.publicOrigin), at(advertised, cfg.internalOrigin)])],
  };
  cache = { key, at: Date.now(), value };
  return value;
}

/** Solo para las pruebas: obliga a volver a preguntar. */
export function forgetDiscovery(): void {
  cache = null;
}

export async function authorizeUrl(
  cfg: OidcConfig,
  { state, codeChallenge }: { state: string; codeChallenge: string }
): Promise<string> {
  const url = new URL((await discover(cfg)).authorization);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function endSessionUrl(cfg: OidcConfig): Promise<string | null> {
  // Sin `post_logout_redirect_uri` a propósito. Volver a la aplicación
  // exigiría mandar `id_token_hint` —Authentik lo pide, es requisito de
  // certificación OIDC— y eso significaría guardar el id_token de cada
  // sesión: cambio de esquema donde la sesión vive en base de datos, y ~1 KB
  // más de cookie en CADA petición donde vive en la cookie. Demasiado coste
  // permanente para un detalle estético.
  //
  // Sin él, el proveedor cierra la sesión y deja al usuario en la pantalla
  // de entrada de KaiCorp Labs, que pide credenciales: exactamente la señal
  // de que ha salido de verdad.
  // Devuelve null si el proveedor no anuncia el endpoint, y ahí quien
  // llama decide (salir de la aplicación y ya).
  return (await discover(cfg)).endSession;
}

// ─── PKCE ───────────────────────────────────────────────────────────
export function newVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ─── Intercambio de código por identidad ────────────────────────────
export interface OidcIdentity {
  sub: string;
  email: string;
  name?: string;
}

export async function exchangeCode(
  cfg: OidcConfig,
  { code, verifier }: { code: string; verifier: string }
): Promise<OidcIdentity> {
  const endpoints = await discover(cfg);
  const res = await fetch(endpoints.token, {
    method: "POST",
    signal: AbortSignal.timeout(cfg.timeoutMs),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`token endpoint: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const tokens = (await res.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("token endpoint: sin access_token");

  const info = await fetch(endpoints.userinfo, {
    signal: AbortSignal.timeout(cfg.timeoutMs),
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!info.ok) {
    throw new Error(`userinfo: ${info.status}`);
  }

  const claims = (await info.json()) as { sub?: unknown; email?: unknown; name?: unknown };
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string" || !claims.email || (claims.name !== undefined && typeof claims.name !== "string")) {
    throw new Error("userinfo: faltan sub o email");
  }

  return { sub: claims.sub.slice(0, 256), email: claims.email.toLowerCase().slice(0, 320), name: claims.name?.slice(0, 256) };
}

/**
 * Destino interno seguro tras iniciar sesión.
 *
 * La comprobación anterior era `startsWith("/") && !startsWith("//")`, y se
 * escapaba: **los navegadores normalizan `\` a `/` dentro de las URLs**, así que
 * `/\evil.com` empieza por una sola barra —pasa el filtro— pero el navegador lo
 * resuelve como `//evil.com`, o sea protocolo relativo hacia un dominio ajeno.
 * Iniciar sesión se convertía en un redirector a donde quisiera quien mandara
 * el enlace. Verificado en producción antes de arreglarlo: la cookie guardaba
 * `"next":"/\\evil.com"` sin rechistar.
 *
 * Los caracteres de control se quitan **antes** de decidir, no después: el
 * navegador también los descarta al resolver la URL, así que comprobar sobre la
 * cadena sucia estaría mirando una URL distinta de la que se va a seguir.
 *
 * Vive aquí y no en cada ruta porque estaba duplicado, y dos copias de una
 * comprobación de seguridad acaban divergiendo.
 */
export function safeNext(raw: string | undefined | null): string {
  if (!raw) return "/";
  const limpio = raw.replace(/[\u0000-\u001F\u007F]/g, "");
  if (!limpio.startsWith("/")) return "/";
  if (limpio.startsWith("//") || limpio.startsWith("/\\")) return "/";
  return limpio;
}
