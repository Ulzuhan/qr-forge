import type { MetadataRoute } from "next";

/**
 * Se evalúa en cada petición, y no es opcional: estas rutas son Route Handlers
 * que Next cachea en la construcción por defecto, y la construcción ocurre en
 * CI, donde el origen público NO existe — el sitemap salía vacío y a robots le
 * faltaba su línea Sitemap. Medido antes de publicar nada.
 */
export const dynamic = "force-dynamic";

/**
 * Only the front page is listed, and that is the whole truth of this app: every
 * other route either belongs to one account (the codes, their statistics) or is
 * a printed redirect that should not be indexed at all. A sitemap that listed
 * them would be inviting crawlers into somebody's dashboard.
 *
 * Without QRFORGE_PUBLIC_URL there is no absolute origin to write, and a
 * sitemap of relative URLs is not a sitemap: it comes back empty instead.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.QRFORGE_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!base) return [];
  return [{ url: `${base}/`, changeFrequency: "monthly", priority: 1 }];
}
