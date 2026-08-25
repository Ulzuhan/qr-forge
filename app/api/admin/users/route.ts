import { NextRequest, NextResponse } from "next/server";
import { approveUser, currentUser, isAdmin, rejectUser } from "@/lib/auth";

/**
 * POST /api/admin/users — aprobar o rechazar una solicitud de cuenta.
 *
 * body: { userId, action: "approve" | "reject" }
 *
 * Solo para el admin. A quien no lo sea se le responde 404, igual que a una
 * ruta que no existe: confirmar que hay un panel de administración solo sirve
 * para que alguien insista.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { userId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof body.userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const done =
    body.action === "approve"
      ? await approveUser(body.userId)
      : await rejectUser(body.userId);

  if (!done) {
    // O no existe, o ya no está pendiente (dos pestañas abiertas, por ejemplo).
    return NextResponse.json({ error: "That request is no longer pending" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
