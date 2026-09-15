import { DestinationDemo } from "../components/DestinationDemo";
import { ButtonLink } from "../ui/Button";
import { Notice } from "../ui/Notice";
import {
  IconArrowRight,
  IconBolt,
  IconBox,
  IconChart,
  IconClock,
  IconEdit,
  IconLink,
  IconLogIn,
  IconPrinter,
  IconShield,
} from "../ui/icons";

const ENROLL_URL = "https://auth.kaicorplabs.com/if/flow/enroll-qr-forge/";

/** Lo que ve quien no ha entrado. */
export function Landing({ baseUrl }: { baseUrl: string }) {
  const signinFailed = new URLSearchParams(window.location.search).get("error") === "signin";

  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      {/* ── Hero ── */}
      <section className="container-x pt-10 pb-16 sm:pt-16 sm:pb-24">
        {signinFailed && (
          <Notice tone="warn" className="mb-8 animate-fade">
            Sign-in didn't complete. Try again; if it keeps happening, the identity provider may be down.
          </Notice>
        )}
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="animate-rise text-center lg:text-left">
            <p className="eyebrow justify-center lg:justify-start">Self-hosted · open source · no third-party tracking</p>
            <h1 className="mt-5 text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-[4.4rem]">
              Print once.
              <br />
              <span className="grad-text">Point anywhere.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-text-2 lg:mx-0">
              A dynamic QR code encodes a short link on your own server. Change where it goes whenever you like:
              the code on the poster never changes. Every scan is counted, and none of them is tied to a person.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <ButtonLink href={ENROLL_URL} variant="primary" size="lg">
                Request an account
                <IconArrowRight size={18} />
              </ButtonLink>
              <ButtonLink href="/api/auth/login" variant="secondary" size="lg">
                <IconLogIn size={18} />
                Sign in
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-text-3">
              Already have a KaiCorp Labs account? Sign in and it will ask for access to this one.
            </p>
          </div>
          <div className="animate-rise [animation-delay:120ms]">
            <DestinationDemo baseUrl={baseUrl} />
            <p className="mt-4 text-center text-xs text-text-3">That code is real. Scan it and it brings you back here.</p>
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section className="border-t border-line/70 bg-bg-1/40">
        <div className="container-x py-16 sm:py-20">
          <p className="eyebrow">How it works</p>
          <h2 className="section-title mt-3 max-w-2xl">Three steps, and only the first one is on paper.</h2>
          <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 stagger">
            {STEPS.map((s, i) => (
              <li key={s.title} className="feature">
                <div className="flex items-center justify-between">
                  <div className="feature-icon">{s.icon}</div>
                  <span className="font-mono text-xs text-text-3">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Dos clases de código ── */}
      <section className="container-x py-16 sm:py-20">
        <p className="eyebrow">Two kinds of code</p>
        <h2 className="section-title mt-3 max-w-2xl">Live and editable, or fixed and independent.</h2>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 stagger">
          <article className="panel overflow-hidden p-6 sm:p-7">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-40 blur-3xl"
              style={{ background: "var(--color-ember)" }}
            />
            <span className="pill pill-ember">
              <IconBolt size={12} /> Dynamic
            </span>
            <h3 className="mt-4 text-xl">Editable, and it counts scans</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-2">
              The code points at a short link here, which forwards wherever you say. Change the destination,
              pause it, give it an expiry date: the printed code keeps working. Each scan is logged with its day
              and country.
            </p>
            <p className="mt-4 font-mono text-xs text-text-3">{baseUrl}/r/your-slug → anywhere</p>
          </article>
          <article className="panel overflow-hidden p-6 sm:p-7">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-30 blur-3xl"
              style={{ background: "var(--color-cyan)" }}
            />
            <span className="pill pill-cyan">
              <IconBox size={12} /> Static
            </span>
            <h3 className="mt-4 text-xl">Fixed, and it outlives this server</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-2">
              A link, WiFi credentials, an email or plain text encoded straight into the image. Nothing passes
              through here, so nothing is tracked, and the code still works if this site is down.
            </p>
            <p className="mt-4 font-mono text-xs text-text-3">WIFI:T:WPA;S:cafe-guests;P:…;;</p>
          </article>
        </div>
      </section>

      {/* ── Qué hay dentro ── */}
      <section className="border-t border-line/70 bg-bg-1/40">
        <div className="container-x py-16 sm:py-20">
          <p className="eyebrow">What you get</p>
          <h2 className="section-title mt-3 max-w-2xl">Everything a printed code needs after it leaves the printer.</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature">
                <div className="feature-icon">{f.icon}</div>
                <h3 className="mt-4 text-base">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-2">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacidad ── */}
      <section className="container-x py-16 sm:py-20">
        <div className="panel grid grid-cols-1 gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow">Privacy by design</p>
            <h2 className="section-title mt-3">A scan is a count, not a person.</h2>
            <p className="mt-4 text-sm leading-relaxed text-text-2">
              Analytics are minimized on purpose, and they are best-effort: if recording a scan ever fails, the
              redirect still happens. A code that stops working is worse than a scan that goes uncounted.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-ok/25 bg-ok/5 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-ok">Recorded</p>
              <ul className="mt-3 space-y-2 text-sm text-text-2">
                <li>The day of the scan</li>
                <li>The country, as two letters</li>
                <li>The first 256 characters of the user agent</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-danger/25 bg-danger/5 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-danger">Never recorded</p>
              <ul className="mt-3 space-y-2 text-sm text-text-2">
                <li>IP addresses</li>
                <li>Referrers</li>
                <li>Anything shared with an ad network</li>
              </ul>
            </div>
            <p className="text-xs text-text-3 sm:col-span-2">
              Scans are kept for a bounded time (a year by default) and then deleted. Each account sees only its
              own codes.
            </p>
          </div>
        </div>
      </section>

      {/* ── Cierre ── */}
      <section className="border-t border-line/70">
        <div className="container-x py-16 text-center sm:py-24">
          <h2 className="section-title mx-auto max-w-2xl">Make your first code in about a minute.</h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-text-2">
            Accounts are approved by hand, so this stays a small place. Your codes are yours: nobody else on this
            instance can see them, and there is no analytics company in the middle.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href={ENROLL_URL} variant="primary" size="lg">
              Request an account
              <IconArrowRight size={18} />
            </ButtonLink>
            <ButtonLink href="/api/auth/login" variant="ghost" size="lg">
              I already have one
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}

const STEPS = [
  {
    icon: <IconLink size={18} />,
    title: "Create",
    body: "Paste a destination, pick a slug you can read out loud if you want one, and download the code as PNG or SVG at print size.",
  },
  {
    icon: <IconPrinter size={18} />,
    title: "Print",
    body: "Flyers, menus, packaging, badges, a sign at the door. The image is final: it never needs to change again.",
  },
  {
    icon: <IconEdit size={18} />,
    title: "Change your mind",
    body: "Edit the destination, pause the code, or let it expire on a date. Whatever is already printed follows along.",
  },
];

const FEATURES = [
  {
    icon: <IconEdit size={18} />,
    title: "Change the destination",
    body: "Point today's flyer somewhere else tomorrow. The code on the paper stays exactly as it was.",
  },
  {
    icon: <IconChart size={18} />,
    title: "See the scans",
    body: "A total, a chart by day, top countries and the most recent scans, for each code.",
  },
  {
    icon: <IconLink size={18} />,
    title: "Pick your own short link",
    body: "Let it generate a slug, or choose one that fits on a business card and survives a phone call.",
  },
  {
    icon: <IconClock size={18} />,
    title: "Expiry and an off switch",
    body: "Give a code a date, or disable it by hand. After that it stops forwarding instead of going stale.",
  },
  {
    icon: <IconPrinter size={18} />,
    title: "PNG and SVG",
    body: "Download at print resolution. The SVG scales to a billboard without going fuzzy.",
  },
  {
    icon: <IconShield size={18} />,
    title: "Only yours",
    body: "Each account sees only its own codes. No ad network, no third-party analytics, no resale.",
  },
];
