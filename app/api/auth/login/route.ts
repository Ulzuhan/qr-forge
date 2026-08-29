import { NextRequest, NextResponse } from "next/server";
import { safeNext, authorizeUrl, challengeFor, newVerifier, oidcConfig } from "@/lib/oidc";

/**
 * GET /api/auth/login — arranca la entrada contra Authentik.
 *
 * Guarda en una cookie efímera el verificador de PKCE, el estado anti-CSRF y a
 * dónde volver. Va en cookie y no en sesión de servidor porque todavía no hay
 * sesión: esto ocurre antes de saber quién es quien llama.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cfg = oidcConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Sign-in is not configured on this instance" },
      { status: 503 }
    );
  }

  const verifier = newVerifier();
  const state = newVerifier();

  // Solo rutas internas: sin esto, un enlace con ?next=https://otro-sitio
  // convertiría el login en un redirector hacia donde quisiera el atacante.
  const raw = request.nextUrl.searchParams.get("next") ?? "/";
  const next = safeNext(raw);

  const response = NextResponse.redirect(
    await authorizeUrl(cfg, { state, codeChallenge: challengeFor(verifier) })
  );
  response.cookies.set("qrforge_oidc", JSON.stringify({ verifier, state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" no basta: Authentik nos devuelve con una navegación de otro sitio,
    // y con "strict" el navegador no mandaría esta cookie en esa vuelta.
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
