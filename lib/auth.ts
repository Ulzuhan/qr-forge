/**
 * QR-Forge — cuentas de usuario y sesiones.
 *
 * Modelo de acceso:
 *
 *   PÚBLICO         /r/[slug]
 *                   Es el endpoint que codifican los QR impresos: tiene que
 *                   funcionar para cualquiera, siempre, sin sesión. Es lo único
 *                   público de la aplicación.
 *
 *   AUTENTICADO     el resto (dashboard, crear, editar, stats, /api/qr/*)
 *                   y además ACOTADO POR DUEÑO: cada usuario ve solo sus QRs.
 *
 * La autorización se comprueba dentro de cada ruta y página, no en un
 * middleware: un único punto de control es un único punto de olvido.
 */
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";

export const SESSION_COOKIE = "qrforge_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

// ─── Registro abierto o cerrado ──────────────────────────────────────
/**
 * QRFORGE_REGISTRATION=closed deja el servicio solo para las cuentas que ya
 * existen. Por defecto está abierto: el servicio se publica para que otra gente
 * lo use, y cada cuenta solo alcanza sus propios QRs.
 */
export function registrationOpen(): boolean {
  return (process.env.QRFORGE_REGISTRATION ?? "open").trim().toLowerCase() !== "closed";
}

// ─── Email y contraseña ─────────────────────────────────────────────
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Deliberadamente laxa: la validación seria de un email es enviarle un correo.
  // Esto solo descarta lo que no puede serlo.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Mínimos de contraseña. Longitud antes que reglas de composición. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 512;

export function passwordProblem(password: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return "Contraseña demasiado larga";
  }
  return null;
}

export function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex")
): string {
  const derived = scryptSync(password.normalize("NFKC"), salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;

  let derived: Buffer;
  try {
    derived = scryptSync(password.normalize("NFKC"), salt, 64);
  } catch {
    return false;
  }

  const expectedBuf = Buffer.from(expected, "hex");
  // Comparación en tiempo constante: una normal filtra el hash byte a byte
  // a través del tiempo de respuesta.
  if (derived.length !== expectedBuf.length) return false;
  return timingSafeEqual(derived, expectedBuf);
}

// ─── Sesiones ───────────────────────────────────────────────────────
/** Lo que se guarda en la DB es el hash del token, nunca el token. */
function tokenId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const cookieOptions = {
  httpOnly: true,
  // Tras el túnel todo es HTTPS; relajado en desarrollo (http) para que el
  // login siga funcionando en localhost.
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};

export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    id: tokenId(token),
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions);

  // Barrido perezoso de sesiones caducadas, para que la tabla no crezca sola.
  db.delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .catch(() => {});
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, tokenId(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** El usuario de esta petición, o null. */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, tokenId(token)))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, tokenId(token)));
    return null;
  }
  return row.user;
}

/**
 * Para páginas: devuelve el usuario o manda al login. `next` conserva a dónde
 * iba, para volver ahí después de entrar.
 */
export async function requireUser(next?: string): Promise<User> {
  const user = await currentUser();
  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return user;
}

/**
 * Para rutas de API: el usuario, o la respuesta 401 que hay que devolver.
 * Se usa como `const auth = await apiUser(); if (!auth.user) return auth.response;`
 */
export async function apiUser(): Promise<
  { user: User; response?: never } | { user?: never; response: Response }
> {
  const user = await currentUser();
  if (!user) {
    return {
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  return { user };
}

// ─── Alta y acceso ──────────────────────────────────────────────────
export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error: string; status: number };

export async function registerUser(
  rawEmail: string,
  password: string
): Promise<AuthResult> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return { ok: false, error: "Email no válido", status: 400 };
  }
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem, status: 400 };

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return { ok: false, error: "Ya existe una cuenta con ese email", status: 409 };
  }

  const [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date(),
    })
    .returning();

  return { ok: true, user };
}

export async function authenticate(
  rawEmail: string,
  password: string
): Promise<AuthResult> {
  const email = normalizeEmail(rawEmail);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Mismo mensaje exista o no la cuenta: distinguirlos convierte el login en un
  // buscador de emails registrados.
  const wrong = { ok: false as const, error: "Email o contraseña incorrectos", status: 401 };
  if (!user) {
    // Se calcula un hash igualmente, para que "usuario inexistente" no responda
    // notablemente más rápido que "contraseña incorrecta".
    hashPassword(password);
    return wrong;
  }
  if (!verifyPassword(password, user.passwordHash)) return wrong;

  return { ok: true, user };
}

/** Cierra todas las sesiones de un usuario (cambio de contraseña, sospecha). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId)));
}
