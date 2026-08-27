import { NextRequest, NextResponse } from "next/server";
import { BodyTooLarge, jsonBody } from "@/lib/body";
import { db } from "@/db";
import { qrCodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isValidUrl, validateStaticPayload, type StaticKind } from "@/lib/qr";
import { apiUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/request-security";

const notFound = () => NextResponse.json({ error: "QR not found" }, { status: 404 });
const owned = (id: string, userId: string) => and(eq(qrCodes.id, id), eq(qrCodes.userId, userId));

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if (!auth.user) return auth.response;
  try {
    const { id } = await params;
    const [qr] = await db.select().from(qrCodes).where(owned(id, auth.user.id)).limit(1);
    return qr ? NextResponse.json({ qr }) : notFound();
  } catch (error) {
    console.error("[GET /api/qr/[id]]", error);
    return NextResponse.json({ error: "Failed to fetch QR" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if (!auth.user) return auth.response;
  const originError = sameOrigin(request);
  if (originError) return originError;
  try {
    const { id } = await params;
    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
    const [existing] = await db.select().from(qrCodes).where(owned(id, auth.user.id)).limit(1);
    if (!existing) return notFound();

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const { destinationUrl, title, description, campaign, isActive, expiresAt, staticPayload } = body;
    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim() || title.length > 100) return NextResponse.json({ error: "Invalid title" }, { status: 400 });
      updates.title = title.trim();
    }
    for (const [name, value, max] of [["description", description, 1000], ["campaign", campaign, 200]] as const) {
      if (value === undefined) continue;
      if (value === null || value === "") updates[name] = null;
      else if (typeof value === "string" && value.length <= max) updates[name] = value.trim() || null;
      else return NextResponse.json({ error: `Invalid ${name}` }, { status: 400 });
    }
    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") return NextResponse.json({ error: "Invalid isActive" }, { status: 400 });
      updates.isActive = isActive;
    }
    if (expiresAt !== undefined) {
      if (expiresAt === null || expiresAt === "") updates.expiresAt = null;
      else {
        if (typeof expiresAt !== "string" && typeof expiresAt !== "number") return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
        const parsed = new Date(expiresAt);
        if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
        updates.expiresAt = parsed;
      }
    }
    if (existing.type === "dynamic" && destinationUrl !== undefined) {
      if (typeof destinationUrl !== "string" || !isValidUrl(destinationUrl)) return NextResponse.json({ error: "Invalid destination URL" }, { status: 400 });
      updates.destinationUrl = destinationUrl;
    }
    if (existing.type === "static" && staticPayload !== undefined) {
      if (typeof staticPayload !== "string") return NextResponse.json({ error: "Invalid static payload" }, { status: 400 });
      const validation = validateStaticPayload(existing.staticKind as StaticKind, staticPayload);
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
      updates.staticPayload = staticPayload;
    }
    await db.update(qrCodes).set(updates).where(owned(id, auth.user.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BodyTooLarge) return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    console.error("[PATCH /api/qr/[id]]", error);
    return NextResponse.json({ error: "Failed to update QR" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if (!auth.user) return auth.response;
  const originError = sameOrigin(request);
  if (originError) return originError;
  try {
    const { id } = await params;
    const result = await db.delete(qrCodes).where(owned(id, auth.user.id)).returning({ id: qrCodes.id });
    return result.length ? NextResponse.json({ ok: true }) : notFound();
  } catch (error) {
    console.error("[DELETE /api/qr/[id]]", error);
    return NextResponse.json({ error: "Failed to delete QR" }, { status: 500 });
  }
}
