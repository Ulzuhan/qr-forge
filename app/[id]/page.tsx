import { db } from "@/db";
import { qrCodes, qrScans } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { publicBaseUrl, shortUrl } from "@/lib/public-url";
import { QrPreview } from "../components/QrPreview";
import { CopyButton } from "../components/CopyButton";
import { StatusToggle } from "../components/StatusToggle";
import { DownloadBtn } from "../components/DownloadBtn";

export const dynamic = "force-dynamic";

async function getQrWithStats(id: string, userId: string) {
  // Acotado al dueño: un QR ajeno da 404, igual que uno inexistente.
  const [qr] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, userId)))
    .limit(1);
  if (!qr) return null;

  // Los static no tienen scans (no redirigen)
  if (qr.type === "static") {
    return { qr, total: 0, daily: [], countries: [], recent: [] };
  }

  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)`.as("total") })
    .from(qrScans)
    .where(eq(qrScans.qrId, id));

  const daily = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${qrScans.scannedAt}, 'unixepoch')`.as("day"),
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(qrScans)
    .where(eq(qrScans.qrId, id))
    .groupBy(sql`day`)
    .orderBy(sql`day`);

  const countries = await db
    .select({
      country: qrScans.country,
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(qrScans)
    .where(eq(qrScans.qrId, id))
    .groupBy(qrScans.country)
    .orderBy(sql`count DESC`)
    .limit(10);

  const recent = await db
    .select()
    .from(qrScans)
    .where(eq(qrScans.qrId, id))
    .orderBy(desc(qrScans.scannedAt))
    .limit(20);

  return { qr, total: total ?? 0, daily, countries: countries.filter((c) => c.country), recent };
}

const STATIC_ICONS: Record<string, string> = {
  wifi: "📶",
  url: "🔗",
  email: "📧",
  text: "📝",
};

export default async function QrDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/${id}`);
  const baseUrl = await publicBaseUrl();
  const data = await getQrWithStats(id, user.id);
  if (!data) notFound();

  const { qr, total, daily, countries, recent } = data;
  const isStatic = qr.type === "static";
  const isExpired = qr.expiresAt && qr.expiresAt < new Date();

  return (
    <div className="kc-workspace qr-workspace qr-detail max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">← All QRs</Link>
        <span>/</span>
        <span className="text-foreground font-mono">{qr.id}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground font-mono uppercase">
          {isStatic
            ? `${STATIC_ICONS[qr.staticKind ?? ""] ?? "•"} ${qr.staticKind ?? "static"}`
            : "⚡ dynamic"}
        </span>
      </div>

      {/* minmax(0,1fr) en vez de 1fr: con 1fr la columna de stats no puede
          encoger por debajo de su contenido y la tabla de escaneos empujaba la
          página a lo ancho. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left: QR + actions */}
        <div className="space-y-4">
          <div className="p-4 bg-white rounded-lg flex flex-col items-center">
            <QrPreview
              slug={isStatic ? undefined : qr.id}
              payload={isStatic ? qr.staticPayload ?? undefined : undefined}
              baseUrl={baseUrl}
              size={260}
            />
            <p className="text-xs text-zinc-600 mt-3 font-mono text-center break-all max-w-full px-2">
              {isStatic
                ? qr.staticPayload
                : `(${qr.id} → redirects to destination)`}
            </p>
          </div>
          {isStatic ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Encoded payload</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={qr.staticPayload ?? ""}
                  className="flex-1 px-3 py-2 text-xs rounded-md bg-muted border border-border font-mono"
                />
                <CopyButton text={qr.staticPayload ?? ""} />
              </div>
              <p className="text-xs text-muted-foreground">
                Static QR: no redirect, no analytics, works offline.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Short URL</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shortUrl(baseUrl, qr.id)}
                  className="min-w-0 flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs"
                />
                <CopyButton text={shortUrl(baseUrl, qr.id)} />
              </div>
              <p className="text-xs text-muted-foreground">
                This is what the QR encodes. It stays the same when you change the destination.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            {isStatic ? (
              <>
                <DownloadBtn payload={qr.staticPayload ?? undefined} id={qr.id} format="png" />
                <DownloadBtn payload={qr.staticPayload ?? undefined} id={qr.id} format="svg" />
              </>
            ) : (
              <>
                <DownloadBtn slug={qr.id} baseUrl={baseUrl} id={qr.id} format="png" />
                <DownloadBtn slug={qr.id} baseUrl={baseUrl} id={qr.id} format="svg" />
              </>
            )}
          </div>
          <Link
            href={`/${qr.id}/edit`}
            className="block text-center w-full px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            Edit
          </Link>
        </div>

        {/* Right: stats + meta */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{qr.title}</h1>
            {qr.description && (
              <p className="text-muted-foreground mt-1">{qr.description}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {qr.campaign && (
                <span className="px-2 py-0.5 rounded bg-accent/20 text-accent">
                  campaign: {qr.campaign}
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded ${
                  qr.isActive
                    ? "bg-success/20 text-success"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {qr.isActive ? "Active" : "Disabled"}
              </span>
              {isExpired && (
                <span className="px-2 py-0.5 rounded bg-warning/20 text-warning">
                  Expired
                </span>
              )}
              {qr.expiresAt && !isExpired && (
                <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  expires {new Date(qr.expiresAt).toLocaleString()}
                </span>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground break-all">
              {isStatic ? (
                <>
                  📦 Encodes:{" "}
                  <span className="font-mono text-foreground">
                    {qr.staticPayload}
                  </span>
                </>
              ) : (
                <>
                  → <span className="font-mono text-foreground">{qr.destinationUrl}</span>
                </>
              )}
            </p>
          </div>

          {!isStatic ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Total scans" value={total} big />
                <Stat label="Countries" value={countries.length} />
                <Stat label="Days active" value={daily.length} />
                <Stat
                  label="Avg scans / day"
                  value={daily.length > 0 ? (total / Math.max(daily.length, 1)).toFixed(1) : "0"}
                />
              </div>

              <div>
                <h2 className="text-sm font-semibold mb-2">Scans by day</h2>
                {daily.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 border border-dashed border-border rounded">
                    No scans yet. Share the QR!
                  </p>
                ) : (
                  <DailyChart daily={daily} />
                )}
              </div>

              {countries.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold mb-2">Top countries</h2>
                  <div className="space-y-1">
                    {countries.map((c) => {
                      const pct = (c.count / total) * 100;
                      return (
                        <div key={c.country ?? "?"} className="flex items-center gap-2 text-sm">
                          <span className="font-mono w-8 text-right">{c.country ?? "??"}</span>
                          <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-muted-foreground">{c.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-sm font-semibold mb-2">Recent scans</h2>
                {recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No scans yet.</p>
                ) : (
                  <div className="overflow-x-auto border border-border rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-muted text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2">When</th>
                          <th className="text-left px-3 py-2">Country</th>
                          <th className="text-left px-3 py-2">User agent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((s) => (
                          <tr key={s.id} className="border-t border-border">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {new Date(s.scannedAt).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 font-mono">{s.country ?? "—"}</td>
                            <td className="px-3 py-2 truncate max-w-[300px]" title={s.userAgent ?? ""}>
                              {s.userAgent ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-4 border border-warning/30 rounded-md bg-warning/5 text-sm">
              <p className="font-medium text-warning mb-1">Static QR — no tracking</p>
              <p className="text-muted-foreground">
                This QR encodes the payload directly. It doesn’t pass through this app,
                so we can’t see scans, locations, or devices. The QR will keep working
                even if QR-Forge goes down.
              </p>
            </div>
          )}

          <StatusToggle id={qr.id} isActive={qr.isActive} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  big,
}: {
  label: string;
  value: string | number;
  big?: boolean;
}) {
  return (
    <div className="border border-border rounded-md p-3 bg-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`${big ? "text-3xl" : "text-xl"} font-bold`}>{value}</p>
    </div>
  );
}

function DailyChart({ daily }: { daily: { day: string; count: number }[] }) {
  const max = Math.max(...daily.map((d) => d.count), 1);
  return (
    <div className="border border-border rounded p-3 bg-card">
      <div className="flex items-end gap-0.5 h-32">
        {daily.slice(-30).map((d) => {
          const h = (d.count / max) * 100;
          return (
            <div
              key={d.day}
              className="flex-1 bg-primary/70 hover:bg-primary rounded-t transition-colors relative group"
              style={{ height: `${h}%`, minHeight: "2px" }}
              title={`${d.day}: ${d.count} scan${d.count === 1 ? "" : "s"}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>{daily[0]?.day}</span>
        <span>{daily[daily.length - 1]?.day}</span>
      </div>
    </div>
  );
}
