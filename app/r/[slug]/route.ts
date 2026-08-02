import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { qrCodes, qrScans } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /r/[slug] — el endpoint público que codifica el QR
// Hace log del scan y redirige a la URL destino
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

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
      return new NextResponse("410 — QR deshabilitado", { status: 410 });
    }
    if (qr.expiresAt && qr.expiresAt < new Date()) {
      return new NextResponse("410 — QR expirado", { status: 410 });
    }
    // Después de los checks, destinationUrl es string (narrowing)
    const destinationUrl = qr.destinationUrl!;

    // Log del scan (fire-and-forget: no bloquea el redirect)
    const headers = request.headers;
    db.insert(qrScans)
      .values({
        qrId: qr.id,
        ip: headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for") ?? null,
        userAgent: headers.get("user-agent") ?? null,
        referer: headers.get("referer") ?? null,
        country: headers.get("cf-ipcountry") ?? null,
        scannedAt: new Date(),
      })
      .catch((err) => console.error("[scan log failed]", err));

    return NextResponse.redirect(destinationUrl, 302);
  } catch (error) {
    console.error("[GET /r/[slug]]", error);
    return new NextResponse("500 — Internal error", { status: 500 });
  }
}
