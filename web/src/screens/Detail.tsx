import { useEffect, useState } from "react";
import { CopyField } from "../components/CopyField";
import { DeleteDialog } from "../components/DeleteDialog";
import { DownloadButtons } from "../components/DownloadButtons";
import { StatusPill, TypePill } from "../components/QrCard";
import { QrTile } from "../components/QrTile";
import { ScanChart, fillSeries } from "../components/ScanChart";
import { editarQr, verEstadisticas, type Estadisticas, type Qr } from "../lib/api";
import {
  countryName,
  describeUserAgent,
  flagEmoji,
  formatDate,
  formatDateTime,
  formatDay,
  formatNumber,
  isExpired,
  parseEmailPayload,
  parseWifiPayload,
  timeAgo,
} from "../lib/format";
import { shortUrl } from "../lib/url";
import Link from "../navigation";
import { useNavigation } from "../navigation";
import { Button, ButtonLink } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { Skeleton } from "../ui/Skeleton";
import { flash, useToast } from "../ui/Toast";
import {
  IconArrowLeft,
  IconChart,
  IconClock,
  IconEdit,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconGlobe,
  IconLink,
  IconPower,
  IconRefresh,
  IconTrash,
} from "../ui/icons";

export function Detail({ id, baseUrl }: { id: string; baseUrl: string }) {
  const [data, setData] = useState<Estadisticas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useNavigation();

  useEffect(() => {
    verEstadisticas(id).then(setData, (e: Error) => setError(e.message));
  }, [id]);

  if (error) return <LoadError message={error} />;
  if (!data) return <DetailSkeleton />;

  const { qr, total, daily, countries, recent } = data;
  const isStatic = qr.type === "static";
  const value = isStatic ? (qr.staticPayload ?? "") : shortUrl(baseUrl, qr.id);
  const expired = isExpired(qr.expiresAt);
  const windowScans = daily.reduce((n, d) => n + d.count, 0);
  const series = fillSeries(daily, data.dailySince);

  return (
    <div className="container-x py-8 sm:py-12">
      <header className="animate-rise">
        <Link href="/" className="link-quiet inline-flex items-center gap-1.5 text-sm">
          <IconArrowLeft size={15} /> All codes
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TypePill qr={qr} />
          <StatusPill qr={qr} />
          <span className="font-mono text-xs text-text-3">{qr.id}</span>
        </div>
        <h1 className="mt-3 text-[2rem] leading-[1.05] sm:text-[2.6rem]">{qr.title}</h1>
        {qr.description && <p className="mt-3 max-w-2xl text-text-2">{qr.description}</p>}
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-text-3">
          <Meta label="Created" value={formatDate(qr.createdAt)} title={formatDateTime(qr.createdAt)} />
          {qr.updatedAt !== qr.createdAt && <Meta label="Updated" value={timeAgo(qr.updatedAt)} title={formatDateTime(qr.updatedAt)} />}
          {qr.expiresAt && <Meta label={expired ? "Expired" : "Expires"} value={formatDateTime(qr.expiresAt)} />}
          {qr.campaign && <Meta label="Campaign" value={qr.campaign} />}
        </dl>
      </header>

      {!qr.isActive && (
        <Notice tone="warn" className="mt-6 animate-fade">
          This code is disabled. Scanning it answers <span className="font-mono">410 Gone</span>. Enable it below to resume the redirect.
        </Notice>
      )}
      {qr.isActive && expired && (
        <Notice tone="warn" className="mt-6 animate-fade">
          This code expired on {formatDateTime(qr.expiresAt as string)}. Scanning it answers{" "}
          <span className="font-mono">410 Gone</span>. Edit the expiry date to bring it back.
        </Notice>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[23rem_minmax(0,1fr)]">
        {/* ── El código ── */}
        <aside className="space-y-4 animate-rise [animation-delay:80ms] lg:sticky lg:top-20">
          <div className="panel p-4 sm:p-5">
            <QrTile value={value} label={`QR code for ${qr.title}`} size="lg" />
            <div className="mt-4">
              <p className="label">{isStatic ? "Encoded content" : "Short link, what the code encodes"}</p>
              <CopyField value={value} label={isStatic ? "encoded content" : "short link"} />
            </div>
            <DownloadButtons value={value} filename={`qr-${qr.id}`} className="mt-1" />
            <p className="hint">PNG at 1024 px for screens and small print. SVG for anything larger.</p>
            <ButtonLink href={`/${qr.id}/edit`} variant="primary" block className="mt-4">
              <IconEdit size={16} />
              Edit
            </ButtonLink>
          </div>
          {!isStatic && <StatusToggle qr={qr} onChange={(next) => setData({ ...data, qr: { ...qr, isActive: next } })} />}
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" className="text-text-3 hover:!text-danger" onClick={() => setDeleting(true)}>
              <IconTrash size={15} /> Delete this code
            </Button>
          </div>
        </aside>

        {/* ── Destino y analítica ── */}
        <div className="space-y-6 animate-rise [animation-delay:140ms]">
          {isStatic ? <StaticContent qr={qr} /> : <Destination qr={qr} />}

          {isStatic ? (
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">
                  <IconChart size={18} /> Nothing to count here
                </h2>
              </div>
              <div className="panel-body text-sm leading-relaxed text-text-2">
                A static code carries its content in the image and never touches this server, so there are no
                scans, countries or devices to show. In exchange it keeps working if this site is down, and it
                cannot be edited after printing.
              </div>
            </section>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <div className="stat">
                  <span className="stat-label">Total scans</span>
                  <span className="stat-value">{formatNumber(total)}</span>
                  <span className="stat-note">all time</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Last {data.dailyDays} days</span>
                  <span className="stat-value">{formatNumber(windowScans)}</span>
                  <span className="stat-note">{(windowScans / data.dailyDays).toFixed(1)} per day on average</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Countries</span>
                  <span className="stat-value">{formatNumber(countries.length)}</span>
                  <span className="stat-note">
                    {countries[0] ? `${flagEmoji(countries[0].country)} ${countryName(countries[0].country)} leads` : "none yet"}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Busiest day</span>
                  {(() => {
                    const best = series.reduce((b, d) => (d.count > b.count ? d : b), series[0] ?? { day: "", count: 0 });
                    return best && best.count > 0 ? (
                      <>
                        <span className="stat-value">{formatNumber(best.count)}</span>
                        <span className="stat-note">on {formatDay(best.day)}</span>
                      </>
                    ) : (
                      <>
                        <span className="stat-value">—</span>
                        <span className="stat-note">no scans this month</span>
                      </>
                    );
                  })()}
                </div>
              </div>

              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">
                    <IconChart size={18} /> Scans by day
                  </h2>
                  <span className="font-mono text-xs text-text-3">
                    {series[0] ? `${formatDay(series[0].day)} – ${formatDay(series[series.length - 1].day)}` : ""} · UTC
                  </span>
                </div>
                <div className="panel-body">
                  {total === 0 ? (
                    <EmptyScans />
                  ) : (
                    <ScanChart daily={daily} since={data.dailySince} />
                  )}
                </div>
              </section>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="panel">
                  <div className="panel-head">
                    <h2 className="panel-title">
                      <IconGlobe size={18} /> Top countries
                    </h2>
                    <span className="text-xs text-text-3">all time</span>
                  </div>
                  <div className="panel-body">
                    {countries.length === 0 ? (
                      <p className="text-sm text-text-3">No country recorded yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {countries.map((c) => {
                          const pct = total ? (c.count / total) * 100 : 0;
                          return (
                            <li key={c.country} className="text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span aria-hidden>{flagEmoji(c.country)}</span>
                                  <span className="truncate">{countryName(c.country)}</span>
                                  <span className="font-mono text-xs text-text-3">{c.country}</span>
                                </span>
                                <span className="tabular-nums text-text-2">
                                  {formatNumber(c.count)} <span className="text-text-3">· {pct.toFixed(0)}%</span>
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-3">
                                <div className="h-full rounded-full bg-gradient-to-r from-ember to-ember-2" style={{ width: `${Math.max(2, pct)}%` }} />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <h2 className="panel-title">
                      <IconClock size={18} /> Recent scans
                    </h2>
                    <span className="text-xs text-text-3">last {recent.length || 20}</span>
                  </div>
                  <div className="panel-body pt-2">
                    {recent.length === 0 ? (
                      <p className="pt-3 text-sm text-text-3">No scans yet.</p>
                    ) : (
                      <ol>
                        {recent.map((s) => (
                          <li key={s.id} className="scan-row">
                            <span className="text-lg leading-none" aria-hidden>
                              {flagEmoji(s.country)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate" title={s.userAgent ?? ""}>
                                {describeUserAgent(s.userAgent)}
                              </span>
                              <span className="block text-xs text-text-3">{countryName(s.country)}</span>
                            </span>
                            <time dateTime={s.scannedAt} title={formatDateTime(s.scannedAt)} className="text-xs text-text-3">
                              {timeAgo(s.scannedAt)}
                            </time>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>

      <DeleteDialog
        qr={qr}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          flash({ tone: "ok", title: "Code deleted" });
          router.push("/");
        }}
      />
    </div>
  );
}

function Meta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex gap-1.5" title={title}>
      <dt>{label}</dt>
      <dd className="text-text-2">{value}</dd>
    </div>
  );
}

function Destination({ qr }: { qr: Qr }) {
  const url = qr.destinationUrl ?? "";
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <IconLink size={18} /> Points to
        </h2>
        <ButtonLink href={`/${qr.id}/edit`} size="sm" variant="ghost">
          <IconEdit size={14} /> Change
        </ButtonLink>
      </div>
      <div className="panel-body">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 break-all font-mono text-sm leading-relaxed">{url}</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
            Open <IconExternal size={14} />
          </a>
        </div>
        <p className="hint">Change it any time. The printed code keeps working and starts pointing to the new place.</p>
      </div>
    </section>
  );
}

function StaticContent({ qr }: { qr: Qr }) {
  const [reveal, setReveal] = useState(false);
  const payload = qr.staticPayload ?? "";
  const wifi = qr.staticKind === "wifi" ? parseWifiPayload(payload) : null;
  const mail = qr.staticKind === "email" ? parseEmailPayload(payload) : null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <IconLink size={18} /> What it encodes
        </h2>
        <ButtonLink href={`/${qr.id}/edit`} size="sm" variant="ghost">
          <IconEdit size={14} /> Change
        </ButtonLink>
      </div>
      <div className="panel-body">
        {wifi ? (
          <dl className="kv">
            <dt>Network</dt>
            <dd className="font-medium">{wifi.ssid}</dd>
            <dt>Security</dt>
            <dd>{wifi.security === "nopass" ? "Open, no password" : wifi.security === "WPA" ? "WPA / WPA2" : "WEP"}</dd>
            {wifi.security !== "nopass" && (
              <>
                <dt>Password</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono">{reveal ? wifi.password : "•".repeat(Math.min(12, Math.max(6, wifi.password.length)))}</span>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setReveal((v) => !v)} aria-label={reveal ? "Hide password" : "Show password"}>
                    {reveal ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                  </button>
                </dd>
              </>
            )}
            <dt>Hidden</dt>
            <dd>{wifi.hidden ? "Yes, the SSID is not broadcast" : "No"}</dd>
          </dl>
        ) : mail ? (
          <dl className="kv">
            <dt>To</dt>
            <dd className="font-medium">{mail.to}</dd>
            {mail.subject && (
              <>
                <dt>Subject</dt>
                <dd>{mail.subject}</dd>
              </>
            )}
            {mail.body && (
              <>
                <dt>Message</dt>
                <dd className="whitespace-pre-wrap text-text-2">{mail.body}</dd>
              </>
            )}
          </dl>
        ) : qr.staticKind === "url" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 break-all font-mono text-sm leading-relaxed">{payload}</p>
            <a href={payload} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              Open <IconExternal size={14} />
            </a>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">{payload}</p>
        )}
        {(wifi || mail) && (
          <p className="hint break-all">
            Raw: <span className="font-mono text-text-3">{payload}</span>
          </p>
        )}
      </div>
    </section>
  );
}

function StatusToggle({ qr, onChange }: { qr: Qr; onChange: (active: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const toggle = async () => {
    setBusy(true);
    try {
      await editarQr(qr.id, { isActive: !qr.isActive });
      onChange(!qr.isActive);
      toast({
        tone: "ok",
        title: qr.isActive ? "Redirect disabled" : "Redirect enabled",
        body: qr.isActive ? "Scans answer 410 Gone until you enable it again." : "The printed code forwards again.",
      });
    } catch (err) {
      toast({ tone: "danger", title: "Could not change the status", body: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel flex items-center justify-between gap-4 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid size-9 flex-none place-items-center rounded-xl ${qr.isActive ? "bg-ok/12 text-ok" : "bg-bg-3 text-text-3"}`}
          aria-hidden
        >
          <IconPower size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{qr.isActive ? "Redirect is on" : "Redirect is off"}</p>
          <p className="text-xs text-text-3">{qr.isActive ? "Scans forward to the destination." : "Scans answer 410 Gone."}</p>
        </div>
      </div>
      <Button size="sm" variant={qr.isActive ? "danger" : "primary"} loading={busy} onClick={toggle}>
        {qr.isActive ? "Disable" : "Enable"}
      </Button>
    </div>
  );
}

function EmptyScans() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex h-10 items-end gap-1" aria-hidden>
        {[3, 6, 4, 8, 5, 9, 7].map((h, i) => (
          <span key={i} className="w-2 rounded-sm bg-line-2" style={{ height: `${h * 10}%` }} />
        ))}
      </div>
      <p className="text-sm font-medium">No scans yet</p>
      <p className="max-w-xs text-xs text-text-3">Print it, or share the short link. The first scan shows up here within seconds.</p>
    </div>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <div className="container-x flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div className="panel max-w-md p-8 animate-rise">
        <h1 className="text-2xl">Could not load this code</h1>
        <p className="mt-2 text-sm text-text-2">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>
            <IconRefresh size={16} /> Try again
          </Button>
          <ButtonLink href="/" variant="ghost">
            All codes
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="container-x py-8 sm:py-12" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-5 h-6 w-40" />
      <Skeleton className="mt-3 h-10 w-80 max-w-full" />
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <Skeleton className="aspect-[4/5] w-full rounded-3xl" />
        <div className="space-y-6">
          <Skeleton className="h-28 rounded-3xl" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
