import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";

// POST /api/auth/logout — borra la sesión en la DB y la cookie.
export async function POST() {
  await endSession();
  return NextResponse.json({ ok: true });
}
