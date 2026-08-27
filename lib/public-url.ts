import { headers } from "next/headers";

function validBase(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) return null;
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    return url.origin;
  } catch { return null; }
}

export async function publicBaseUrl(): Promise<string> {
  const configured = process.env.QRFORGE_PUBLIC_URL?.trim();
  if (configured) {
    const valid = validBase(configured);
    if (!valid) throw new Error("QRFORGE_PUBLIC_URL must be an HTTPS origin (HTTP only on loopback)");
    return valid;
  }
  if (process.env.NODE_ENV === "production") throw new Error("QRFORGE_PUBLIC_URL is required in production");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3459";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

export function shortUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/r/${slug}`;
}
