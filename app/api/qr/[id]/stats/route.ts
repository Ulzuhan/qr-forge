import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { qrCodes, qrScans } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

// GET /api/qr/[id]/stats — devuelve stats agregadas de un QR
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [qr] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.id, id))
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
      .where(eq(qrScans.qrId, id))
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
