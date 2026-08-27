import { NextRequest, NextResponse } from "next/server";

export function positiveInt(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : fallback;
}

export function sameOrigin(request: NextRequest): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    // `Host` y no `X-Forwarded-Host`, y la diferencia importa: la segunda la
    // escribe quien llama, y **este despliegue no la reemplaza**. Comprobado en
    // vivo contra el túnel: llega intacta a la aplicación mientras `Host` sigue
    // valiendo el nombre de verdad. Prefiriéndola, esta comprobación se salta
    // sola. `QRFORGE_PUBLIC_HOST` queda para un proxy que reescriba `Host`.
    const expectedHost = process.env.QRFORGE_PUBLIC_HOST?.trim() || request.headers.get("host");
    // El esquema sí sale de lo que reconstruye Next: cambiarlo no cruza orígenes,
    // porque haría falta un `Origin` con este mismo host.
    const expectedProto = request.nextUrl.protocol.replace(":", "");
    if (!expectedHost || new URL(origin).origin !== `${expectedProto}://${expectedHost}`) {
      return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }
  return null;
}
