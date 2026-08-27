/**
 * QR-Forge — sesiones locales sobre identidades de Authentik.
 *
 * Modelo de acceso:
 *
 *   PÚBLICO         /r/[slug] y la portada sin sesión
 *                   El redirect es lo que codifican los QR impresos: tiene que
 *                   funcionar para cualquiera, siempre, sin sesión.
 *
 *   AUTENTICADO     el resto (dashboard, crear, editar, stats, /api/qr/*)
 *                   y ACOTADO POR DUEÑO: cada cuenta ve solo sus QRs.
 *
 * Aquí ya no hay contraseñas, altas ni aprobaciones: de eso se encarga
 * Authentik, que además solo emite tokens para quien esté en el grupo de esta
 * aplicación. Lo que queda es la sesión propia — una cookie cuyo hash vive en
 * la base de datos, para poder revocarla — y el espejo local del usuario.
 *
 * La autorización se comprueba dentro de cada ruta y página, no en un
 * middleware: un único punto de control es un único punto de olvido.
 */
import { createHash, randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import type { OidcIdentity } from "@/lib/oidc";

export const SESSION_COOKIE = "qrforge_session";
const requestedTtl = Number(process.env.QRFORGE_SESSION_TTL_HOURS ?? 12);
const SESSION_TTL_HOURS = Number.isFinite(requestedTtl) ? Math.min(24, Math.max(1, requestedTtl)) : 12;
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

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

// ─── Identidad ──────────────────────────────────────────────────────
/**
 * Trae al usuario que corresponde a una identidad de Authentik, creándolo la
 * primera vez. La búsqueda es por `sub` y no por email: cambiar de correo en el
 * proveedor no debe convertir a alguien en otra persona ni dejarle sin sus QRs.
 */
export async function upsertUser(identity: OidcIdentity): Promise<User> {
  const now = new Date();

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.oidcSub, identity.sub))
    .limit(1);

  if (existing) {
    // El email y el nombre son del proveedor: se refrescan en cada entrada.
    const [updated] = await db
      .update(users)
      .set({ email: identity.email, name: identity.name ?? null, lastSeenAt: now })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      oidcSub: identity.sub,
      email: identity.email,
      name: identity.name ?? null,
      createdAt: now,
      lastSeenAt: now,
    })
    .returning();
  return created;
}

// ─── Sesiones ───────────────────────────────────────────────────────
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
 * Para páginas: devuelve el usuario o lo manda a entrar. `next` conserva a
 * dónde iba, para volver ahí después.
 */
export async function requireUser(next?: string): Promise<User> {
  const user = await currentUser();
  if (!user) {
    redirect(next ? `/api/auth/login?next=${encodeURIComponent(next)}` : "/api/auth/login");
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
