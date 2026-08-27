import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { qrCodes, qrScans } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { apiUser } from "@/lib/auth";

// GET /api/qr/[id]/stats — devuelve stats agregadas de un QR
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await apiUser();
  if (!auth.user) return auth.response;

  try {
    const { id } = await params;

    // Las estadísticas de un QR ajeno responden 404 igual que uno inexistente.
    const [qr] = await db
      .select()
      .from(qrCodes)
      .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, auth.user.id)))
      .limit(1);
    if (!qr) {
      return NextResponse.json({ error: "QR not found" }, { status: 404 });
    }

    // Total scans
    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)`.as("total") })
      .from(qrScans)
      .where(eq(qrScans.qrId, id));

    // Scans por día (últimos 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const daily = await db
      .select({
        day: sql<string>`strftime('%Y-%m-%d', ${qrScans.scannedAt}, 'unixepoch')`.as("day"),
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(qrScans)
      // `thirtyDaysAgo` se calculaba arriba y no llegaba a usarse: la consulta
      // devolvía el histórico entero mientras la etiqueta decía "últimos 30
      // días". Un gráfico que miente sobre su propio periodo es peor que no
      // tenerlo, porque nadie lo comprueba.
      .where(and(eq(qrScans.qrId, id), gte(qrScans.scannedAt, thirtyDaysAgo)))
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    // Top países
    const countries = await db
      .select({
        country: qrScans.country,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(qrScans)
      .where(eq(qrScans.qrId, id))
      .groupBy(qrScans.country)
      .orderBy(sql`count DESC`)
      .limit(10);

    // Últimos 20 scans
    const recent = await db
      .select()
      .from(qrScans)
      .where(eq(qrScans.qrId, id))
      .orderBy(desc(qrScans.scannedAt))
      .limit(20);

    return NextResponse.json({
      qr,
      total: total ?? 0,
      daily,
      countries: countries.filter((c) => c.country),
      recent,
    });
  } catch (error) {
    console.error("[GET /api/qr/[id]/stats]", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
