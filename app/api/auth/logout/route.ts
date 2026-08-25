import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";

/**
 * POST /api/auth/logout — cierra la sesión de ESTA aplicación.
 *
 * No cierra la de Authentik a propósito: alguien que sale de QR-Forge no
 * espera que también le echen de las demás aplicaciones abiertas en otras
 * pestañas. Para salir de todo se cierra sesión en el propio Authentik.
 */
export async function POST() {
  await endSession();
  return NextResponse.json({ ok: true });
}
