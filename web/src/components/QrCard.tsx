import Link from "../navigation";
import type { QrConCuenta } from "../lib/api";
import { formatNumber, isExpired, STATIC_KIND_LABEL, timeAgo } from "../lib/format";
import { shortUrl } from "../lib/url";
import { Button, ButtonLink } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { IconBolt, IconBox, IconEdit, IconTrash } from "../ui/icons";
import { CopyButton } from "./CopyField";
import { QrArt } from "./QrArt";

export function TypePill({ qr }: { qr: Pick<QrConCuenta, "type" | "staticKind"> }) {
  return qr.type === "dynamic" ? (
    <Pill tone="ember">
      <IconBolt /> Dynamic
    </Pill>
  ) : (
    <Pill tone="cyan">
      <IconBox /> Static · {STATIC_KIND_LABEL[qr.staticKind ?? ""] ?? "Static"}
    </Pill>
  );
}

export function StatusPill({ qr }: { qr: Pick<QrConCuenta, "isActive" | "expiresAt" | "type"> }) {
  if (!qr.isActive) return <Pill tone="muted" dot>Disabled</Pill>;
  if (isExpired(qr.expiresAt)) return <Pill tone="warn" dot>Expired</Pill>;
  if (qr.type === "static") return null;
  return (
    <Pill tone="ok" dot>
      Live
    </Pill>
  );
}

export function targetOf(qr: Pick<QrConCuenta, "type" | "destinationUrl" | "staticPayload">): string {
  return (qr.type === "dynamic" ? qr.destinationUrl : qr.staticPayload) ?? "";
}

export function QrCard({
  qr,
  baseUrl,
  onDelete,
}: {
  qr: QrConCuenta;
  baseUrl: string;
  onDelete: (qr: QrConCuenta) => void;
}) {
  const dynamic = qr.type === "dynamic";
  const value = dynamic ? shortUrl(baseUrl, qr.id) : qr.staticPayload ?? "";
  const target = targetOf(qr);
  return (
    <article className="qr-card">
      <Link href={`/${qr.id}`} className="qr-card-link" aria-label={`Open ${qr.title}`} />
      <div className="qr-card-tile">
        <div className="paper">
          <QrArt value={value} label={`QR code for ${qr.title}`} className="block h-auto w-full" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 pt-4">
        <div className="flex items-center justify-between gap-2">
          <TypePill qr={qr} />
          <StatusPill qr={qr} />
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[1.05rem] font-semibold leading-snug">{qr.title}</h3>
          <p className="mt-1 truncate font-mono text-xs text-text-3" title={target}>
            {target}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 text-xs text-text-3">
          {dynamic ? (
            <span>
              <strong className="text-base font-semibold tabular-nums text-text-1">{formatNumber(qr.scanCount)}</strong>{" "}
              scan{qr.scanCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span>No tracking</span>
          )}
          <time dateTime={qr.createdAt} title={new Date(qr.createdAt).toLocaleString()}>
            {timeAgo(qr.createdAt)}
          </time>
        </div>
        <div className="qr-card-actions flex items-center gap-1.5 border-t border-line pt-3">
          <ButtonLink href={`/${qr.id}`} size="sm" className="flex-1">
            {dynamic ? "Stats" : "Open"}
          </ButtonLink>
          <ButtonLink href={`/${qr.id}/edit`} size="sm" icon aria-label={`Edit ${qr.title}`} title="Edit">
            <IconEdit size={16} />
          </ButtonLink>
          <CopyButton text={value} label={dynamic ? "Copy short link" : "Copy encoded content"} />
          <Button
            size="sm"
            icon
            variant="ghost"
            aria-label={`Delete ${qr.title}`}
            title="Delete"
            className="hover:!text-danger"
            onClick={() => onDelete(qr)}
          >
            <IconTrash size={16} />
          </Button>
        </div>
      </div>
    </article>
  );
}
