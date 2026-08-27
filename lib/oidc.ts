/**
 * Cliente OIDC contra Authentik (flujo de código de autorización con PKCE).
 *
 * Escrito a mano y sin dependencias: son unas pocas peticiones bien definidas,
 * y añadir una librería de autenticación entera para esto traería más
 * superficie que código propio.
 *
 * Dos direcciones distintas del mismo Authentik, a propósito:
 *
 *   PÚBLICA   la que se manda al navegador (auth.kaicorplabs.com). Tiene que
 *             ser alcanzable desde el móvil de quien entra.
 *   INTERNA   la que usa este servidor para canjear el código y pedir los datos
 *             del usuario (127.0.0.1). Ahorra dar la vuelta por internet para
 *             hablar con un proceso que está en la misma máquina.
 *
 * El token de identidad NO se verifica criptográficamente: se obtiene del
 * endpoint de token en una llamada directa servidor-a-servidor, que es el caso
 * en el que la propia especificación (OIDC Core 3.1.3.7) permite saltarse la
 * comprobación de firma. Los datos del usuario se leen además de /userinfo.
 */
import { createHash, randomBytes } from "crypto";

export interface OidcConfig {
  publicBase: string;
  internalBase: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  appSlug: string;
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
  const publicBase = validUrl(process.env.QRFORGE_OIDC_PUBLIC_BASE);
  // La pata interna admite http con cualquier hostname: es el tramo
  // servidor→proveedor, y un alias de red de contenedores (authentik-server)
  // o un nombre de LAN son el caso normal — exigir loopback aquí dejaba el
  // login en 503 dentro de un contenedor, medido. El https obligatorio sigue
  // intacto para todo lo que visita el navegador.
  const internalBase = validUrl(process.env.QRFORGE_OIDC_INTERNAL_BASE ?? process.env.QRFORGE_OIDC_PUBLIC_BASE, { allowHttp: true });
  const redirectUri = validUrl(process.env.QRFORGE_OIDC_REDIRECT_URI);
  const appSlug = (process.env.QRFORGE_OIDC_APP_SLUG ?? "qr-forge").trim();
  const requestedTimeout = Number(process.env.QRFORGE_OIDC_TIMEOUT_MS ?? 10_000);
  const timeoutMs = Number.isFinite(requestedTimeout) ? Math.min(60_000, Math.max(1_000, requestedTimeout)) : 10_000;
  if (!clientId || !clientSecret || !publicBase || !internalBase || !redirectUri || !/^[A-Za-z0-9_-]+$/.test(appSlug)) return null;
  return { publicBase, internalBase, clientId, clientSecret, redirectUri, appSlug, timeoutMs };
}

/** Si falta configuración, la aplicación no puede dejar entrar a nadie. */
export function oidcConfigured(): boolean {
  return oidcConfig() !== null;
}

const APP_PATH = "/application/o";

export function authorizeUrl(
  cfg: OidcConfig,
  { state, codeChallenge }: { state: string; codeChallenge: string }
): string {
  const url = new URL(`${cfg.publicBase}${APP_PATH}/authorize/`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function endSessionUrl(cfg: OidcConfig): string {
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
  return `${cfg.publicBase}${APP_PATH}/${cfg.appSlug}/end-session/`;
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
  const res = await fetch(`${cfg.internalBase}${APP_PATH}/token/`, {
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

  const info = await fetch(`${cfg.internalBase}${APP_PATH}/userinfo/`, {
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
