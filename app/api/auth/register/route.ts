import { NextRequest, NextResponse } from "next/server";
import { registerUser, registrationOpen, startSession } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/ratelimit";

/**
 * POST /api/auth/register — pide cuenta.
 *
 * Según el modo de la instancia la cuenta queda admitida al momento (y se entra)
 * o esperando a que el administrador la apruebe. La primera cuenta que existe
 * siempre entra, y de admin: si no, no habría quien aprobase a nadie.
 */
export async function POST(request: NextRequest) {
  if (!(await registrationOpen())) {
    return NextResponse.json(
      { error: "Sign-ups are closed on this instance" },
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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const result = await registerUser(body.email, body.password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Pendiente de aprobación: no se abre sesión porque no hay a dónde entrar.
  if (result.user.approvedAt == null) {
    return NextResponse.json({ pending: true }, { status: 202 });
  }

  await startSession(result.user.id);
  return NextResponse.json({ ok: true, email: result.user.email }, { status: 201 });
}
