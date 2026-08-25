/**
 * Limitador de intentos en memoria, por proceso.
 *
 * Suficiente para el despliegue previsto (un único proceso Node detrás del
 * túnel). Con varias instancias haría falta un almacén compartido: aquí cada
 * proceso contaría por su cuenta.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export type LimitResult = { allowed: boolean; retryAfterSeconds: number };

export function rateLimit(key: string, max: number, windowMs: number): LimitResult {
  const now = Date.now();

  // Barrido perezoso: sin esto el Map crece con cada IP que pasa por aquí.
  if (now - lastSweep > windowMs) {
    lastSweep = now;
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Tras un acceso correcto, para que los intentos fallidos previos no cuenten. */
export function resetLimit(key: string): void {
  buckets.delete(key);
}

/**
 * IP del cliente. Detrás de Cloudflare la buena es cf-connecting-ip; si no,
 * el último salto de x-forwarded-for (los anteriores los pone el cliente y
 * son falsificables).
 */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "direct";
}

export function tooManyRequests(limit: LimitResult): Response {
  return Response.json(
    { error: "Demasiados intentos. Prueba de nuevo en un momento." },
    { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
  );
}
