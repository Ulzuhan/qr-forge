import { NextRequest, NextResponse } from "next/server";
import { BodyTooLarge, jsonBody } from "@/lib/body";
import { db } from "@/db";
import { qrCodes, qrScans } from "@/db/schema";
import { count, desc, eq, sql } from "drizzle-orm";
import { generateUniqueSlug, isValidUrl, sanitizeSlug, validateStaticPayload, type StaticKind } from "@/lib/qr";
import { apiUser } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { positiveInt, sameOrigin } from "@/lib/request-security";

const optionalText = (value: unknown, max: number): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean.length <= max ? clean || null : undefined;
};

export async function GET() {
  const auth = await apiUser();
  if (!auth.user) return auth.response;
  try {
    const rows = await db.select({
      id: qrCodes.id, type: qrCodes.type, destinationUrl: qrCodes.destinationUrl,
      staticPayload: qrCodes.staticPayload, staticKind: qrCodes.staticKind,
      title: qrCodes.title, description: qrCodes.description, campaign: qrCodes.campaign,
      isActive: qrCodes.isActive, expiresAt: qrCodes.expiresAt, createdAt: qrCodes.createdAt,
      updatedAt: qrCodes.updatedAt, scanCount: sql<number>`COUNT(${qrScans.id})`.as("scan_count"),
    }).from(qrCodes).leftJoin(qrScans, eq(qrScans.qrId, qrCodes.id))
      .where(eq(qrCodes.userId, auth.user.id)).groupBy(qrCodes.id).orderBy(desc(qrCodes.createdAt));
    return NextResponse.json({ qrs: rows });
  } catch (error) {
    console.error("[GET /api/qr]", error);
    return NextResponse.json({ error: "Failed to list QRs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await apiUser();
  if (!auth.user) return auth.response;
  const originError = sameOrigin(request);
  if (originError) return originError;
  const limit = rateLimit(`create:${auth.user.id}:${clientIp(request)}`, positiveInt("QRFORGE_MAX_CREATES_PER_HOUR", 120, 10_000), 3_600_000);
  if (!limit.allowed) return tooManyRequests(limit);

  try {
    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
    const { title, description, campaign, customSlug, expiresAt, type = "dynamic", destinationUrl, staticPayload, staticKind } = body;

    if (typeof title !== "string" || !title.trim() || title.length > 100) {
      return NextResponse.json({ error: "Title is required (max 100)" }, { status: 400 });
    }
    const cleanDescription = optionalText(description, 1000);
    const cleanCampaign = optionalText(campaign, 200);
    if ((description !== undefined && cleanDescription === undefined) || (campaign !== undefined && cleanCampaign === undefined)) {
      return NextResponse.json({ error: "Invalid description or campaign" }, { status: 400 });
    }
    if (type !== "dynamic" && type !== "static") return NextResponse.json({ error: "Invalid type" }, { status: 400 });

    const [{ value: existingCount }] = await db.select({ value: count() }).from(qrCodes).where(eq(qrCodes.userId, auth.user.id));
    if (existingCount >= positiveInt("QRFORGE_MAX_QRS_PER_USER", 1000, 100_000)) {
      return NextResponse.json({ error: "QR quota reached" }, { status: 507 });
    }

    let destination: string | null = null;
    let staticValue: string | null = null;
    let kind: StaticKind | null = null;
    if (type === "dynamic") {
      if (typeof destinationUrl !== "string" || !isValidUrl(destinationUrl)) {
        return NextResponse.json({ error: "Valid destination URL required (http/https)" }, { status: 400 });
      }
      destination = destinationUrl;
    } else {
      if (typeof staticKind !== "string" || !["url", "wifi", "email", "text"].includes(staticKind)) {
        return NextResponse.json({ error: "Invalid staticKind" }, { status: 400 });
      }
      if (typeof staticPayload !== "string") return NextResponse.json({ error: "staticPayload required" }, { status: 400 });
      const validation = validateStaticPayload(staticKind as StaticKind, staticPayload);
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
      staticValue = staticPayload;
      kind = staticKind as StaticKind;
    }

    let slug: string;
    if (customSlug !== undefined && customSlug !== null && customSlug !== "") {
      if (typeof customSlug !== "string" || customSlug.length > 40) return NextResponse.json({ error: "Invalid custom slug" }, { status: 400 });
      const cleaned = sanitizeSlug(customSlug);
      if (!cleaned) return NextResponse.json({ error: "Invalid custom slug" }, { status: 400 });
      slug = cleaned;
    } else slug = await generateUniqueSlug();

    let expiration: Date | null = null;
    if (expiresAt !== undefined && expiresAt !== null && expiresAt !== "") {
      if (typeof expiresAt !== "string" && typeof expiresAt !== "number") return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
      expiration = new Date(expiresAt);
      if (Number.isNaN(expiration.getTime())) return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
    }

    const now = new Date();
    try {
      await db.insert(qrCodes).values({
        id: slug, userId: auth.user.id, type, destinationUrl: destination,
        staticPayload: staticValue, staticKind: kind, title: title.trim(),
        description: cleanDescription ?? null, campaign: cleanCampaign ?? null,
        isActive: true, expiresAt: expiration, createdAt: now, updatedAt: now,
      });
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed: qr_codes.id")) {
        return NextResponse.json({ error: "Custom slug already taken" }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ id: slug }, { status: 201 });
  } catch (error) {
    if (error instanceof BodyTooLarge) return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    console.error("[POST /api/qr]", error);
    return NextResponse.json({ error: "Failed to create QR" }, { status: 500 });
  }
}
