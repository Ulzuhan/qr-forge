import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { qrCodes, qrScans } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import {
  generateUniqueSlug,
  isValidUrl,
  sanitizeSlug,
  validateStaticPayload,
  type StaticKind,
} from "@/lib/qr";
import { apiUser } from "@/lib/auth";

// GET /api/qr — lista los QRs del usuario con su conteo de scans
export async function GET() {
  const auth = await apiUser();
  if (!auth.user) return auth.response;

  try {
    const rows = await db
      .select({
        id: qrCodes.id,
        type: qrCodes.type,
        destinationUrl: qrCodes.destinationUrl,
        staticPayload: qrCodes.staticPayload,
        staticKind: qrCodes.staticKind,
        title: qrCodes.title,
        description: qrCodes.description,
        campaign: qrCodes.campaign,
        isActive: qrCodes.isActive,
        expiresAt: qrCodes.expiresAt,
        createdAt: qrCodes.createdAt,
        updatedAt: qrCodes.updatedAt,
        scanCount: sql<number>`COUNT(${qrScans.id})`.as("scan_count"),
      })
      .from(qrCodes)
      .leftJoin(qrScans, eq(qrScans.qrId, qrCodes.id))
      .where(eq(qrCodes.userId, auth.user.id))
      .groupBy(qrCodes.id)
      .orderBy(desc(qrCodes.createdAt));

    return NextResponse.json({ qrs: rows });
  } catch (error) {
    console.error("[GET /api/qr]", error);
    return NextResponse.json(
      { error: "Failed to list QRs" },
      { status: 500 }
    );
  }
}

// POST /api/qr — crear un QR nuevo (dynamic o static)
export async function POST(request: NextRequest) {
  const auth = await apiUser();
  if (!auth.user) return auth.response;

  try {
    const body = await request.json();
    const {
      title,
      description,
      campaign,
      customSlug,
      expiresAt,
      type = "dynamic",
      destinationUrl,
      staticPayload,
      staticKind,
    } = body;

    // Validaciones comunes
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (title.length > 100) {
      return NextResponse.json({ error: "Title too long (max 100)" }, { status: 400 });
    }
    if (type !== "dynamic" && type !== "static") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    let payload: { destinationUrl: string | null; staticPayload: string | null; staticKind: StaticKind | null } = {
      destinationUrl: null,
      staticPayload: null,
      staticKind: null,
    };

    if (type === "dynamic") {
      if (!destinationUrl || !isValidUrl(destinationUrl)) {
        return NextResponse.json(
          { error: "Valid destination URL required (http/https)" },
          { status: 400 }
        );
      }
      payload.destinationUrl = destinationUrl;
    } else {
      // static
      if (!staticKind || !["url", "wifi", "email", "text"].includes(staticKind)) {
        return NextResponse.json({ error: "Invalid staticKind" }, { status: 400 });
      }
      if (typeof staticPayload !== "string") {
        return NextResponse.json({ error: "staticPayload required" }, { status: 400 });
      }
      const validation = validateStaticPayload(staticKind, staticPayload);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      payload.staticPayload = staticPayload;
      payload.staticKind = staticKind as StaticKind;
    }

    // Slug
    let slug: string;
    if (customSlug) {
      const cleaned = sanitizeSlug(String(customSlug));
      if (!cleaned) {
        return NextResponse.json(
          { error: "Invalid custom slug (use a-z, 0-9, -)" },
          { status: 400 }
        );
      }
      // Sin acotar por usuario a propósito: el slug vive en la URL pública
      // /r/<slug>, así que es único para toda la instancia.
      const [existing] = await db
        .select({ id: qrCodes.id })
        .from(qrCodes)
        .where(eq(qrCodes.id, cleaned))
        .limit(1);
      if (existing) {
        return NextResponse.json(
          { error: "Custom slug already taken" },
          { status: 409 }
        );
      }
      slug = cleaned;
    } else {
      slug = await generateUniqueSlug();
    }

    const expiresAtDate = expiresAt ? new Date(expiresAt) : null;
    if (expiresAtDate && isNaN(expiresAtDate.getTime())) {
      return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
    }

    const now = new Date();
    await db.insert(qrCodes).values({
      id: slug,
      userId: auth.user.id,
      type: type as "dynamic" | "static",
      title: title.trim(),
      description: description?.trim() || null,
      campaign: campaign?.trim() || null,
      isActive: true,
      expiresAt: expiresAtDate,
      createdAt: now,
      updatedAt: now,
      ...payload,
    });

    return NextResponse.json({ id: slug }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/qr]", error);
    return NextResponse.json({ error: "Failed to create QR" }, { status: 500 });
  }
}
