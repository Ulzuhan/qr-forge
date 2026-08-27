import { NextRequest, NextResponse } from "next/server";
import { jsonBody } from "@/lib/body";
import { db } from "@/db";
import { qrCodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  isValidUrl,
  validateStaticPayload,
  type StaticKind,
} from "@/lib/qr";
import { apiUser } from "@/lib/auth";
import { and } from "drizzle-orm";

// Un QR ajeno responde 404, no 403: un 403 confirmaría que ese slug existe.
const notFound = () => NextResponse.json({ error: "QR not found" }, { status: 404 });

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await apiUser();
  if (!auth.user) return auth.response;

  try {
    const { id } = await params;
    const [qr] = await db
      .select()
      .from(qrCodes)
      .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, auth.user.id)))
      .limit(1);

    if (!qr) return notFound();
    return NextResponse.json({ qr });
  } catch (error) {
    console.error("[GET /api/qr/[id]]", error);
    return NextResponse.json({ error: "Failed to fetch QR" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await apiUser();
  if (!auth.user) return auth.response;

  try {
    const { id } = await params;
    // `null` es JSON válido: pasaba el `try` y reventaba al leer un campo, y el
    // catch lo convertía en un 500 que no le dice nada a quien lo recibe.
    const body = await jsonBody(request);
    if (!body) {
      return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
    }
    const {
      destinationUrl,
      title,
      description,
      campaign,
      isActive,
      expiresAt,
      staticPayload,
    } = body;

    const [existing] = await db
      .select()
      .from(qrCodes)
      .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, auth.user.id)))
      .limit(1);
    if (!existing) return notFound();

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      }
      if (title.length > 100) {
        return NextResponse.json({ error: "Title too long" }, { status: 400 });
      }
      updates.title = title.trim();
    }
    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }
    if (campaign !== undefined) {
      updates.campaign = campaign?.trim() || null;
    }
    if (isActive !== undefined) {
      updates.isActive = !!isActive;
    }
    if (expiresAt !== undefined) {
      updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    // Editar payload según el tipo
    if (existing.type === "dynamic" && destinationUrl !== undefined) {
      if (!isValidUrl(destinationUrl)) {
        return NextResponse.json(
          { error: "Invalid destination URL" },
          { status: 400 }
        );
      }
      updates.destinationUrl = destinationUrl;
    }

    if (existing.type === "static" && staticPayload !== undefined) {
      const validation = validateStaticPayload(
        existing.staticKind as StaticKind,
        staticPayload
      );
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      updates.staticPayload = staticPayload;
    }

    await db
      .update(qrCodes)
      .set(updates)
      .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, auth.user.id)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/qr/[id]]", error);
    return NextResponse.json({ error: "Failed to update QR" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await apiUser();
  if (!auth.user) return auth.response;

  try {
    const { id } = await params;
    const [existing] = await db
      .select({ id: qrCodes.id })
      .from(qrCodes)
      .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, auth.user.id)))
      .limit(1);
    if (!existing) return notFound();

    await db
      .delete(qrCodes)
      .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, auth.user.id)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/qr/[id]]", error);
    return NextResponse.json({ error: "Failed to delete QR" }, { status: 500 });
  }
}
