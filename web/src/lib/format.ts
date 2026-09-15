/**
 * Formato y pequeñas conversiones que usa la interfaz. Sin dependencias: lo que
 * el navegador ya sabe hacer con Intl, y dos espejos de reglas del servidor.
 */

const relativo = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** «just now», «3 minutes ago», «yesterday»… Sin cifras negativas ni «in». */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return relativo.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 24) return relativo.format(-h, "hour");
  const d = Math.round(h / 24);
  if (d < 30) return relativo.format(-d, "day");
  const mo = Math.round(d / 30);
  if (mo < 12) return relativo.format(-mo, "month");
  return relativo.format(-Math.round(d / 365), "year");
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}

/** Un día «YYYY-MM-DD» de la serie (UTC) como «Sep 15». */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(undefined).format(n);
}

/** «ES» → 🇪🇸. El país llega como dos mayúsculas o nada. */
export function flagEmoji(country: string | null | undefined): string {
  if (!country || !/^[A-Z]{2}$/.test(country)) return "🌐";
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function countryName(country: string | null | undefined): string {
  if (!country || !/^[A-Z]{2}$/.test(country)) return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
}

/** Un resumen legible del agente de usuario: «iPhone · Safari». */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  if (/bot|crawl|spider|slurp|curl\/|wget|python-requests|httpclient|facebookexternalhit/i.test(ua)) return "Bot or crawler";
  let device = "Unknown device";
  if (/iPhone/.test(ua)) device = "iPhone";
  else if (/iPad/.test(ua)) device = "iPad";
  else if (/Android/.test(ua)) device = "Android";
  else if (/Windows/.test(ua)) device = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) device = "Mac";
  else if (/CrOS/.test(ua)) device = "ChromeOS";
  else if (/Linux/.test(ua)) device = "Linux";
  let browser = "";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/.test(ua)) browser = "Firefox";
  else if (/CriOS|Chrome/.test(ua)) browser = "Chrome";
  else if (/Safari/.test(ua)) browser = "Safari";
  return browser ? `${device} · ${browser}` : device;
}

/**
 * El espejo de `limpiarSlug` en Go: minúsculas, todo lo que no sea [a-z0-9-]
 * pasa a guion, guiones colapsados y recortados, máximo 40. Sirve para enseñar
 * cómo va a quedar antes de guardar; la decisión final sigue siendo del servidor.
 */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Fechas para `datetime-local`, que quiere «YYYY-MM-DDTHH:mm» EN HORA LOCAL y
 * sin zona. Convertir con toISOString() —que es UTC— desplazaba la fecha en
 * cada guardado por el desfase horario de quien editaba.
 */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isExpired(iso: string | null | undefined, now: number = Date.now()): boolean {
  return Boolean(iso) && new Date(iso as string).getTime() < now;
}

/** Añade https:// a lo que parece un dominio escrito a mano. */
export function withScheme(value: string): string {
  const v = value.trim();
  if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return /^[\w-]+(\.[\w-]+)+/.test(v) ? `https://${v}` : v;
}

// ── Contenido estático, leído de vuelta ──────────────────────────────

export type WifiFields = {
  ssid: string;
  password: string;
  security: "WPA" | "WEP" | "nopass";
  hidden: boolean;
};

/** Lee un payload «WIFI:T:WPA;S:red;P:clave;H:true;;», deshaciendo los escapes. */
export function parseWifiPayload(payload: string): WifiFields | null {
  if (!/^WIFI:/i.test(payload)) return null;
  const fields: Record<string, string> = {};
  let i = 5;
  while (i < payload.length) {
    if (payload[i] === ";") break;
    const colon = payload.indexOf(":", i);
    if (colon < 0) break;
    const key = payload.slice(i, colon);
    i = colon + 1;
    let value = "";
    while (i < payload.length && payload[i] !== ";") {
      if (payload[i] === "\\" && i + 1 < payload.length) {
        value += payload[i + 1];
        i += 2;
      } else {
        value += payload[i];
        i += 1;
      }
    }
    fields[key] = value;
    i += 1;
  }
  const t = (fields.T ?? "nopass").toUpperCase();
  return {
    ssid: fields.S ?? "",
    password: fields.P ?? "",
    security: t === "WPA" || t === "WEP" ? t : "nopass",
    hidden: /^true$/i.test(fields.H ?? ""),
  };
}

export type EmailFields = { to: string; subject: string; body: string };

export function parseEmailPayload(payload: string): EmailFields | null {
  if (!/^mailto:/i.test(payload)) return null;
  try {
    const u = new URL(payload);
    return {
      to: decodeURIComponent(u.pathname),
      subject: u.searchParams.get("subject") ?? "",
      body: u.searchParams.get("body") ?? "",
    };
  } catch {
    return null;
  }
}

export const STATIC_KIND_LABEL: Record<string, string> = {
  url: "Link",
  wifi: "WiFi",
  email: "Email",
  text: "Text",
};
