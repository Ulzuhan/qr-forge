import { NextRequest, NextResponse } from "next/server";
import { safeNext, exchangeCode, oidcConfig } from "@/lib/oidc";
import { startSession, upsertUser } from "@/lib/auth";

/**
 * GET /api/auth/callback — vuelta desde Authentik.
 *
 * Canjea el código por la identidad, la refleja en la base local y abre la
 * sesión. Si algo no cuadra se vuelve a la portada sin sesión: no hay mensaje
 * de error detallado a propósito, porque quien llega aquí con parámetros
 * inventados no merece pistas.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cfg = oidcConfig();
  if (!cfg) return back("/");

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  const raw = request.cookies.get("qrforge_oidc")?.value;
  let stored: { verifier?: string; state?: string; next?: string } = {};
  try {
    stored = raw ? JSON.parse(raw) : {};
  } catch {
    stored = {};
  }

  const fail = () => {
    const res = back("/?error=signin");
    res.cookies.delete("qrforge_oidc");
    return res;
  };

  // El estado tiene que coincidir con el que emitimos: es lo que impide que
  // alguien nos haga iniciar sesión con SU código.
  if (!code || !state || !stored.state || !stored.verifier || state !== stored.state) {
    return fail();
  }

  try {
    const identity = await exchangeCode(cfg, { code, verifier: stored.verifier });
    const user = await upsertUser(identity);
    await startSession(user.id);
  } catch (error) {
    console.error("[oidc callback]", error);
    return fail();
  }

  const next = safeNext(stored.next);
  const res = back(next);
  res.cookies.delete("qrforge_oidc");
  return res;
}

/**
 * Redirección con destino RELATIVO.
 *
 * NextResponse.redirect() exige una URL absoluta, y construirla desde
 * request.url devolvía "localhost" en vez del host por el que llegó la
 * petición: el navegador aterrizaba en otro origen, no mandaba la cookie de
 * sesión recién puesta y la vuelta del login parecía no haber funcionado. Una
 * Location relativa la resuelve el navegador contra donde ya está, así que
 * sirve igual detrás del túnel, por Tailscale o en localhost.
 */
function back(path: string): NextResponse {
  return new NextResponse(null, { status: 302, headers: { Location: path } });
}
