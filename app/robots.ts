import type { MetadataRoute } from "next";

/**
 * Se evalúa en cada petición, y no es opcional: estas rutas son Route Handlers
 * que Next cachea en la construcción por defecto, y la construcción ocurre en
 * CI, donde el origen público NO existe — el sitemap salía vacío y a robots le
 * faltaba su línea Sitemap. Medido antes de publicar nada.
 */
export const dynamic = "force-dynamic";

/**
 * Why this file has to exist.
 *
 * `app/[id]` is a dynamic segment at the root, so it matched `/robots.txt` and
 * `/sitemap.xml` too: both ended up in the sign-in redirect, and a crawler
 * asking for the rules got a 307 to a login page. A metadata route takes
 * precedence over the dynamic segment, which is the fix.
 *
 * `/r/` is disallowed on purpose. Those are the redirects printed on paper:
 * they must work for anyone, always — but they are not content, they are
 * plumbing, and every one of them indexed is a scan attributed to a crawler
 * rather than a person.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.QRFORGE_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/r/", "/api/", "/new"] },
    ...(base ? { sitemap: `${base}/sitemap.xml`, host: base } : {}),
  };
}
