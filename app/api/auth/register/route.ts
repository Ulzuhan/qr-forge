import { NextRequest, NextResponse } from "next/server";
import { registerUser, registrationOpen, startSession } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/ratelimit";

// POST /api/auth/register — alta de cuenta. Entra directamente tras registrarse.
export async function POST(request: NextRequest) {
  if (!registrationOpen()) {
    return NextResponse.json(
      { error: "El registro está cerrado en esta instancia" },
      { status: 403 }
    );
  }

  // Altas por IP: sin esto, un script llena la tabla de usuarios en un minuto.
  const limit = rateLimit(`register:${clientIp(request)}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) return tooManyRequests(limit);

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
  }

  const result = await registerUser(body.email, body.password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await startSession(result.user.id);
  return NextResponse.json({ ok: true, email: result.user.email }, { status: 201 });
}
