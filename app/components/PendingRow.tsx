"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Una solicitud de cuenta, con los dos botones que deciden su suerte. */
export function PendingRow({
  id,
  email,
  askedAt,
}: {
  id: string;
  email: string;
  /** ISO, formateado en el cliente para que salga en la hora de quien mira. */
  askedAt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That did not work");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{email}</p>
          <p className="text-xs text-muted-foreground">
            asked {new Date(askedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => decide("approve")}
            disabled={busy !== null}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy === "approve" ? "Letting in…" : "Let in"}
          </button>
          <button
            onClick={() => decide("reject")}
            disabled={busy !== null}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60"
          >
            {busy === "reject" ? "Turning down…" : "Turn down"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </li>
  );
}
