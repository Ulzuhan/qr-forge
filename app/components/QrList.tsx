import { db } from "@/db";
import { qrCodes, qrScans } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { QrThumbnail } from "./QrThumbnail";
import { DeleteButton } from "./DeleteButton";

type QrWithCount = {
  id: string;
  type: "dynamic" | "static";
  title: string;
  description: string | null;
  destinationUrl: string | null;
  staticPayload: string | null;
  staticKind: string | null;
  campaign: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  scanCount: number;
};

async function getQrs(userId: string): Promise<QrWithCount[]> {
  const rows = await db
    .select({
      id: qrCodes.id,
      type: qrCodes.type,
      title: qrCodes.title,
      description: qrCodes.description,
      destinationUrl: qrCodes.destinationUrl,
      staticPayload: qrCodes.staticPayload,
      staticKind: qrCodes.staticKind,
      campaign: qrCodes.campaign,
      isActive: qrCodes.isActive,
      expiresAt: qrCodes.expiresAt,
      createdAt: qrCodes.createdAt,
      updatedAt: qrCodes.updatedAt,
      scanCount: sql<number>`COUNT(${qrScans.id})`.as("scan_count"),
    })
    .from(qrCodes)
    .leftJoin(qrScans, eq(qrScans.qrId, qrCodes.id))
    .where(eq(qrCodes.userId, userId))
    .groupBy(qrCodes.id)
    .orderBy(desc(qrCodes.createdAt));
  return rows as QrWithCount[];
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

const STATIC_ICONS: Record<string, string> = {
  wifi: "📶",
  url: "🔗",
  email: "📧",
  text: "📝",
};

export async function QrList({
  userId,
  baseUrl,
}: {
  userId: string;
  baseUrl: string;
}) {
  const qrs = await getQrs(userId);

  if (qrs.length === 0) {
    return (
      <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/30">
        <p className="text-6xl mb-4">📱</p>
        <h2 className="text-xl font-semibold mb-2">No QR codes yet</h2>
        <p className="text-muted-foreground mb-6">
          Create your first QR — dynamic (with analytics) or static (WiFi, URL, email).
        </p>
        <Link
          href="/new"
          className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
        >
          + Create your first QR
        </Link>
      </div>
    );
  }

  return (
    <div className="qr-gallery grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {qrs.map((qr) => {
        const isExpired = qr.expiresAt && qr.expiresAt < new Date();
        const isDisabled = !qr.isActive;
        const isStatic = qr.type === "static";

        return (
          <div
            key={qr.id}
            className="qr-card border border-border rounded-lg bg-card overflow-hidden hover:border-primary/50 transition-colors"
          >
            <div className="qr-card-art p-4 flex justify-center bg-white relative">
              <QrThumbnail
                slug={isStatic ? undefined : qr.id}
                payload={isStatic ? qr.staticPayload ?? undefined : undefined}
                baseUrl={baseUrl}
                size={140}
              />
              <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white font-mono uppercase">
                {isStatic ? `${STATIC_ICONS[qr.staticKind ?? ""] ?? "•"} ${qr.staticKind ?? "static"}` : "⚡ dynamic"}
              </span>
            </div>
            <div className="qr-card-body p-4 border-t border-border space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate">{qr.title}</h3>
                  {qr.campaign && (
                    <span className="inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                      {qr.campaign}
                    </span>
                  )}
                </div>
                <StatusBadge disabled={isDisabled} expired={!!isExpired} />
              </div>
              <p className="text-xs text-muted-foreground truncate" title={isStatic ? qr.staticPayload ?? "" : qr.destinationUrl ?? ""}>
                {isStatic
                  ? `→ ${qr.staticPayload}`
                  : `→ ${qr.destinationUrl}`}
              </p>
              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                {isStatic ? (
                  <span className="text-warning">⚠ no tracking</span>
                ) : (
                  <span>
                    <strong className="text-foreground text-base">{qr.scanCount}</strong>{" "}
                    scan{qr.scanCount === 1 ? "" : "s"}
                  </span>
                )}
                <span>created {timeAgo(qr.createdAt)}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {isStatic ? (
                  <>
                    <Link
                      href={`/${qr.id}`}
                      className="flex-1 text-center px-3 py-1.5 text-sm rounded-md bg-muted hover:bg-muted/70 transition-colors"
                    >
                      View
                    </Link>
                    <Link
                      href={`/${qr.id}/edit`}
                      className="flex-1 text-center px-3 py-1.5 text-sm rounded-md bg-muted hover:bg-muted/70 transition-colors"
                    >
                      Edit
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/${qr.id}`}
                      className="flex-1 text-center px-3 py-1.5 text-sm rounded-md bg-muted hover:bg-muted/70 transition-colors"
                    >
                      Stats
                    </Link>
                    <Link
                      href={`/${qr.id}/edit`}
                      className="flex-1 text-center px-3 py-1.5 text-sm rounded-md bg-muted hover:bg-muted/70 transition-colors"
                    >
                      Edit
                    </Link>
                  </>
                )}
                <DeleteButton id={qr.id} title={qr.title} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({
  disabled,
  expired,
}: {
  disabled: boolean;
  expired: boolean;
}) {
  if (disabled) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
        Disabled
      </span>
    );
  }
  if (expired) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning whitespace-nowrap">
        Expired
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success whitespace-nowrap">
      Active
    </span>
  );
}
