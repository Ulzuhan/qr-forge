import { useCallback, useEffect, useMemo, useState } from "react";
import { DeleteDialog } from "../components/DeleteDialog";
import { PageHeader } from "../components/PageHeader";
import { QrCard, targetOf } from "../components/QrCard";
import { listarQrs, type QrConCuenta } from "../lib/api";
import { formatNumber, isExpired } from "../lib/format";
import { Button, ButtonLink } from "../ui/Button";
import { Select } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { Segmented } from "../ui/Segmented";
import { CardSkeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { IconPlus, IconQr, IconRefresh, IconSearch, IconX } from "../ui/icons";

type Filter = "all" | "dynamic" | "static" | "paused";
type Sort = "newest" | "scans" | "title";

export function Dashboard({ baseUrl }: { baseUrl: string }) {
  const [qrs, setQrs] = useState<QrConCuenta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [toDelete, setToDelete] = useState<QrConCuenta | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    setError(null);
    setQrs(null);
    listarQrs().then(setQrs, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const visible = useMemo(() => {
    if (!qrs) return [];
    const q = query.trim().toLowerCase();
    const list = qrs.filter((qr) => {
      if (filter === "dynamic" && qr.type !== "dynamic") return false;
      if (filter === "static" && qr.type !== "static") return false;
      if (filter === "paused" && qr.isActive && !isExpired(qr.expiresAt)) return false;
      if (!q) return true;
      return [qr.title, qr.id, qr.campaign ?? "", targetOf(qr)].some((s) => s.toLowerCase().includes(q));
    });
    return list.sort((a, b) =>
      sort === "scans"
        ? b.scanCount - a.scanCount
        : sort === "title"
          ? a.title.localeCompare(b.title)
          : b.createdAt.localeCompare(a.createdAt)
    );
  }, [qrs, query, filter, sort]);

  const totals = useMemo(() => {
    if (!qrs) return null;
    return {
      codes: qrs.length,
      scans: qrs.reduce((n, q) => n + q.scanCount, 0),
      live: qrs.filter((q) => q.isActive && !isExpired(q.expiresAt)).length,
      dynamic: qrs.filter((q) => q.type === "dynamic").length,
    };
  }, [qrs]);

  const onDeleted = (id: string) => {
    setQrs((list) => (list ? list.filter((q) => q.id !== id) : list));
    setToDelete(null);
    toast({ tone: "ok", title: "Code deleted" });
  };

  return (
    <div className="container-x py-8 sm:py-12">
      <PageHeader
        eyebrow="Your codes"
        title="QR codes"
        lede="Dynamic codes keep working after you change where they point. Static ones carry their content in the image."
        actions={
          <ButtonLink href="/new" variant="primary">
            <IconPlus size={16} />
            New QR
          </ButtonLink>
        }
      />

      {totals && totals.codes > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-3 animate-rise lg:grid-cols-4">
          <div className="stat">
            <span className="stat-label">Codes</span>
            <span className="stat-value">{formatNumber(totals.codes)}</span>
            <span className="stat-note">
              {totals.dynamic} dynamic · {totals.codes - totals.dynamic} static
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Scans</span>
            <span className="stat-value">{formatNumber(totals.scans)}</span>
            <span className="stat-note">across all dynamic codes</span>
          </div>
          <div className="stat">
            <span className="stat-label">Live</span>
            <span className="stat-value">{formatNumber(totals.live)}</span>
            <span className="stat-note">{totals.codes - totals.live} disabled or expired</span>
          </div>
          <div className="stat">
            <span className="stat-label">Printed origin</span>
            <span className="stat-value truncate text-[1.05rem] leading-snug" title={baseUrl}>
              {baseUrl.replace(/^https?:\/\//, "")}
            </span>
            <span className="stat-note">what every dynamic code encodes</span>
          </div>
        </div>
      )}

      {qrs && qrs.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 animate-rise sm:flex-row sm:items-center">
          <div className="input-affix flex-1">
            <IconSearch size={16} />
            <input
              type="search"
              className="input"
              placeholder="Search by title, slug, destination or campaign"
              aria-label="Search your codes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Segmented<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "dynamic", label: "Dynamic" },
              { value: "static", label: "Static" },
              { value: "paused", label: "Paused" },
            ]}
          />
          <div className="sm:w-44">
            <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="newest">Newest first</option>
              <option value="scans">Most scanned</option>
              <option value="title">By title</option>
            </Select>
          </div>
        </div>
      )}

      <div className="mt-6">
        {error ? (
          <div className="panel p-8 text-center animate-rise">
            <h2 className="text-xl">Could not load your codes</h2>
            <p className="mt-2 text-sm text-text-2">{error}</p>
            <Button className="mt-5" onClick={load}>
              <IconRefresh size={16} /> Try again
            </Button>
          </div>
        ) : qrs === null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading your codes">
            {Array.from({ length: 4 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : qrs.length === 0 ? (
          <EmptyState />
        ) : visible.length === 0 ? (
          <Notice tone="plain" className="justify-between animate-fade">
            <span>Nothing matches. Try another word, or clear the search.</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              <IconX size={14} /> Clear
            </Button>
          </Notice>
        ) : (
          <div className="grid grid-cols-1 gap-4 stagger sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((qr) => (
              <QrCard key={qr.id} qr={qr} baseUrl={baseUrl} onDelete={setToDelete} />
            ))}
          </div>
        )}
      </div>

      <DeleteDialog qr={toDelete} open={toDelete !== null} onClose={() => setToDelete(null)} onDeleted={onDeleted} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="panel overflow-hidden animate-rise">
      <div className="grid grid-cols-1 items-center gap-8 p-8 sm:p-12 lg:grid-cols-[1fr_auto]">
        <div className="max-w-xl">
          <p className="eyebrow">Nothing printed yet</p>
          <h2 className="mt-3 text-3xl">Your first code takes about a minute.</h2>
          <p className="mt-3 text-text-2">
            Make it dynamic if you'll ever want to change where it points or see how often it's scanned. Make it
            static for WiFi, an email or a link that must work without this server.
          </p>
          <ButtonLink href="/new" variant="primary" size="lg" className="mt-6">
            <IconPlus size={18} />
            Create your first QR
          </ButtonLink>
        </div>
        <div className="mx-auto grid size-40 grid-cols-6 gap-1.5 rounded-3xl border border-dashed border-line-2 p-4 text-text-3" aria-hidden>
          {Array.from({ length: 36 }, (_, i) => (
            <span key={i} className={`rounded-[3px] ${[0, 1, 2, 6, 8, 12, 13, 14, 3, 4, 5, 9, 11, 15, 16, 17, 18, 19, 20, 24, 26, 30, 31, 32].includes(i) ? "bg-text-3/35" : ""}`} />
          ))}
          <IconQr className="col-span-6 mx-auto mt-1" size={18} />
        </div>
      </div>
    </div>
  );
}
