import { headers } from "next/headers";

/**
 * La URL pública desde la que se sirve QR-Forge.
 *
 * Es el dato más delicado de la aplicación: un QR impreso codifica
 * `<base>/r/<slug>` para siempre. Si se genera con la base equivocada, el papel
 * ya impreso apunta a un sitio muerto y no hay forma de arreglarlo.
 *
 * Antes lo elegía cada navegador (un valor en localStorage que había que
 * configurar a mano, y que la descarga del PNG ni siquiera miraba: usaba
 * window.location.origin). Ahora lo decide el servidor y viaja como prop hasta
 * los componentes que dibujan el QR, así que la vista previa, la miniatura y el
 * PNG descargado codifican exactamente lo mismo.
 *
 * QRFORGE_PUBLIC_URL manda; sin ella se deduce de la petición, que es correcto
 * en desarrollo y detrás del túnel (que reenvía host y protocolo originales).
 */
export async function publicBaseUrl(): Promise<string> {
  const configured = process.env.QRFORGE_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3459";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** La URL corta de un QR dinámico, absoluta y lista para compartir o imprimir. */
export function shortUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/r/${slug}`;
}
