import { NextRequest, NextResponse } from "next/server";
import { authenticate, startSession } from "@/lib/auth";
import { clientIp, rateLimit, resetLimit, tooManyRequests } from "@/lib/ratelimit";

// POST /api/auth/login
export async function POST(request: NextRequest) {
  // Fuerza bruta: 10 intentos por IP cada 15 minutos.
  const key = `login:${clientIp(request)}`;
  const limit = rateLimit(key, 10, 15 * 60 * 1000);
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

  const result = await authenticate(body.email, body.password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  resetLimit(key);
  await startSession(result.user.id);
  return NextResponse.json({ ok: true, email: result.user.email });
}
