// Helpers compartidos para validación, slugs, y payloads de QR estáticos
import { randomInt } from "crypto";
import { db } from "@/db";
import { qrCodes } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Genera un slug aleatorio legible (sin ambigüedades: sin 0/O, 1/l/I)
 *
 * Con `crypto.randomInt` y no con `Math.random()`. El slug es público —va dentro
 * del QR impreso— pero eso no lo hace irrelevante: `Math.random()` en V8 es un
 * xorshift128+ cuyo estado se recupera a partir de unas pocas salidas. Quien
 * cree unos cuantos QR propios puede reconstruirlo y **predecir los slugs que
 * generen otros usuarios en ese momento**, y con ellos ver a dónde apuntan sus
 * códigos y contaminarles las analíticas.
 *
 * `randomInt` además reparte uniforme: `Math.floor(random() * 31)` introduce un
 * sesgo pequeño, y aquí no cuesta nada evitarlo.
 */
export function generateSlug(length: number = 7): string {
  const charset = "abcdefghjkmnpqrstuvwxyz23456789";
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.push(charset[randomInt(charset.length)]);
  }
  return chars.join("");
}

export async function generateUniqueSlug(maxAttempts: number = 20): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateSlug(i < 10 ? 7 : 10);
    const [existing] = await db.select({ id: qrCodes.id }).from(qrCodes).where(eq(qrCodes.id, candidate)).limit(1);
    if (!existing) return candidate;
  }
  throw new Error("Could not allocate a unique QR slug");
}

export function sanitizeSlug(input: string): string | null {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : null;
}

export function isValidUrl(input: unknown): input is string {
  if (typeof input !== "string" || input.length > 2048 || /[\u0000-\u001F\u007F]/.test(input)) return false;
  try {
    const u = new URL(input);
    return (u.protocol === "http:" || u.protocol === "https:") && Boolean(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

// ====================
// Static payload builders
// ====================

export type StaticKind = "url" | "wifi" | "email" | "text";

export type WifiConfig = {
  ssid: string;
  password?: string;
  encryption?: "WPA" | "WEP" | "nopass";
  hidden?: boolean;
};

/**
 * Construye payload WiFi según el spec de ZXing.
 * Formato: WIFI:T:<encryption>;S:<ssid>;P:<password>;H:<true|false>;;
 */
export function buildWifiPayload(c: WifiConfig): string {
  const enc = c.encryption ?? (c.password ? "WPA" : "nopass");
  // Escapar caracteres especiales: \, ;, ,, ", :
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/"/g, '\\"')
      .replace(/:/g, "\\:");

  let payload = `WIFI:T:${enc};S:${esc(c.ssid)};`;
  if (c.password && enc !== "nopass") {
    payload += `P:${esc(c.password)};`;
  }
  if (c.hidden) payload += "H:true;";
  payload += ";";
  return payload;
}

export type EmailConfig = {
  to: string;
  subject?: string;
  body?: string;
};

export function buildEmailPayload(c: EmailConfig): string {
  const params = new URLSearchParams();
  if (c.subject) params.set("subject", c.subject);
  if (c.body) params.set("body", c.body);
  const qs = params.toString();
  return `mailto:${c.to}${qs ? "?" + qs : ""}`;
}

/**
 * Valida un payload estático antes de guardarlo
 */
export function validateStaticPayload(
  kind: StaticKind,
  payload: string
): { ok: true } | { ok: false; error: string } {
  if (!payload || payload.trim().length === 0) {
    return { ok: false, error: "Empty payload" };
  }
  if (payload.length > 2000) {
    return { ok: false, error: "Payload too long (max 2000 chars)" };
  }
  if (kind === "url" && !isValidUrl(payload)) {
    return { ok: false, error: "Invalid URL" };
  }
  if (kind === "email" && !/^mailto:.+/i.test(payload)) {
    return { ok: false, error: "Invalid email payload" };
  }
  if (kind === "wifi" && !/^WIFI:/.test(payload)) {
    return { ok: false, error: "Invalid WiFi payload" };
  }
  return { ok: true };
}
