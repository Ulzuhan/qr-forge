import Link from "next/link";
import QRCode from "qrcode";

/**
 * Lo que ve quien no ha entrado.
 *
 * Se renderiza entera en el servidor y no lleva JavaScript de cliente: es lo
 * primero que carga un desconocido, casi siempre desde el móvil, y no hay nada
 * aquí que necesite hidratarse para servir de algo.
 *
 * El QR de la demo es de verdad, generado aquí mismo y escaneable: apunta a
 * esta misma página. Enseñar el producto funcionando dice más que describirlo.
 */
export async function Landing({ baseUrl }: { baseUrl: string }) {
  const demoQr = await QRCode.toString(baseUrl, {
    type: "svg",
    margin: 0,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <div className="flex flex-1 flex-col">
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-5 pt-12 pb-16 sm:pt-20 sm:pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <span className="inline-block rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              Self-hosted · no third-party tracking
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              One QR.{" "}
              <span className="text-primary">Any destination.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground text-pretty lg:mx-0">
              Print it once. Change where it points whenever you like — the
              image on the poster never has to change again. And you get to see
              every scan.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="https://auth.kaicorplabs.com/if/flow/enroll-qr-forge/"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-7 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Request an account
              </Link>
              <Link
                href="/api/auth/login"
                className="inline-flex h-12 items-center justify-center rounded-md border border-border px-7 text-base font-medium transition-colors hover:bg-muted"
              >
                Sign in
              </Link>
            </div>
          </div>

          <DemoCard qrSvg={demoQr} />
        </div>
      </section>

      {/* ── Qué hace ───────────────────────────────────────────────── */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            What you get
          </h2>

          <div className="mt-8 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon, title, body }) => (
              <div key={title}>
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-lg">
                  {icon}
                </div>
                <h3 className="mt-3.5 font-medium">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dinámico vs estático ───────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Two kinds of code
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="font-mono text-xs uppercase text-primary">⚡ dynamic</p>
            <h3 className="mt-2 font-medium">Editable, and it counts scans</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The code points at a short link here, which forwards to wherever
              you say. Change the destination, disable it, give it an expiry
              date — the printed code keeps working. Every scan is logged with
              its date and country.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="font-mono text-xs uppercase text-warning">📦 static</p>
            <h3 className="mt-2 font-medium">Fixed, and it outlives us</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              WiFi credentials, an email, a URL, plain text — encoded straight
              into the image. Nothing is tracked because nothing passes through
              this server, and the code still works if this site is down.
            </p>
          </div>
        </div>
      </section>

      {/* ── Cierre ─────────────────────────────────────────────────── */}
      <section className="border-t border-border/60">
        <div className="mx-auto w-full max-w-5xl px-5 py-16 text-center sm:py-24">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Make your first QR in about a minute
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground text-pretty">
            Accounts are approved by hand, so this stays a small place. Your
            codes are yours: nobody else who uses this instance can see them,
            and there is no analytics company in the middle.
          </p>
          <Link
            href="https://auth.kaicorplabs.com/if/flow/enroll-qr-forge/"
            className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-7 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Request an account
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

const FEATURES = [
  {
    icon: "✏️",
    title: "Change the destination",
    body: "Point today's flyer somewhere else tomorrow. The code on the paper stays exactly as it was.",
  },
  {
    icon: "📈",
    title: "See the scans",
    body: "Totals, a chart by day, top countries and the most recent scans — for each code.",
  },
  {
    icon: "🔗",
    title: "Pick your own short link",
    body: "Let it generate a slug, or choose one you can read out loud over the phone.",
  },
  {
    icon: "⏱",
    title: "Expiry and off switch",
    body: "Give a code a date, or disable it by hand. After that it stops forwarding instead of going stale.",
  },
  {
    icon: "🖼",
    title: "PNG and SVG",
    body: "Download at print resolution. The SVG scales to a billboard without going fuzzy.",
  },
  {
    icon: "🔒",
    title: "Only yours",
    body: "Each account sees only its own codes. No ad network, no third-party analytics, no resale.",
  },
];

/**
 * La demostración: un QR real y, debajo, lo que lo hace distinto de imprimir
 * una URL — que el destino se cambia sin tocar el papel.
 */
function DemoCard({ qrSvg }: { qrSvg: string }) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6">
        <div className="rounded-xl bg-white p-4">
          {/* Generado por nosotros en el servidor, no entrada de nadie. */}
          <div
            className="mx-auto aspect-square w-full max-w-[220px] [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </div>

        <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">
          Destination
        </p>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">↳</span>
            <span className="truncate font-mono text-xs text-muted-foreground line-through">
              /summer-menu-2025
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm ring-1 ring-primary/30">
            <span className="text-primary">↳</span>
            <span className="truncate font-mono text-xs">/autumn-menu-2026</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-base text-foreground">1,284</strong> scans
          </span>
          <span>same printed code · since 2025</span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        That code is real — scan it and it brings you back here.
      </p>
    </div>
  );
}
