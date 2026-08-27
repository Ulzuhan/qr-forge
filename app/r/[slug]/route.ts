import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { qrCodes, qrScans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clientIp, rateLimit } from "@/lib/ratelimit";

// GET /r/[slug] — el endpoint público que codifica el QR
// Hace log del scan y redirige a la URL destino
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return new NextResponse("404 — QR not found", { status: 404 });

  try {
    const [qr] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.id, slug))
      .limit(1);

    if (!qr) {
      return new NextResponse("404 — QR not found", { status: 404 });
    }
    if (qr.type !== "dynamic") {
      return new NextResponse("400 — This QR is not a redirect URL", { status: 400 });
    }
    if (!qr.isActive) {
      return new NextResponse("410 — This QR has been disabled", { status: 410 });
    }
    if (qr.expiresAt && qr.expiresAt < new Date()) {
      return new NextResponse("410 — This QR has expired", { status: 410 });
    }
    // Después de los checks, destinationUrl es string (narrowing)
    const destinationUrl = qr.destinationUrl!;

    // Límite SOBRE EL REGISTRO, no sobre la redirección.
    //
    // Tentador poner el límite arriba y devolver 429, pero sería un error: esta
    // ruta es la que un QR impreso necesita que funcione siempre. Un cartel en
    // un evento, una oficina entera tras el mismo NAT, y de pronto el código
    // "no va" — y quien lo imprimió no puede arreglarlo.
    //
    // Lo que sí conviene acotar es la analítica: sin límite, cualquiera puede
    // pedir la misma URL en bucle e inflar las cifras de un código ajeno. Así
    // que quien pase de 30 escaneos por minuto sigue siendo redirigido, pero
    // deja de sumar. Se pierde algún escaneo legítimo en un pico; se evita que
    // los números sean inventables por cualquiera.
    const ip = clientIp(request);
    const limite = rateLimit(`scan:${slug}:${ip}`, 30, 60_000);

    // Log del scan (fire-and-forget: no bloquea el redirect)
    const headers = request.headers;
    if (limite.allowed) db.insert(qrScans)
      .values({
        qrId: qr.id,
        ip: null,
        userAgent: headers.get("user-agent")?.slice(0, 256) ?? null,
        referer: null,
        country: /^[A-Z]{2}$/.test(headers.get("cf-ipcountry") ?? "") ? headers.get("cf-ipcountry") : null,
        scannedAt: new Date(),
      })
      .catch((err) => console.error("[scan log failed]", err));

    // Sin `no-store`, un 302 cacheado deja el QR clavado en el destino viejo
    // —justo lo que un QR dinámico existe para evitar— y además deja de contar
    // escaneos, porque el navegador ya no vuelve a pedirlo. Los dos efectos son
    // silenciosos: el QR "funciona", solo que apunta a donde ya no debe.
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: destinationUrl,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("[GET /r/[slug]]", error);
    return new NextResponse("500 — Internal error", { status: 500 });
  }
}
