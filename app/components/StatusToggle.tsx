"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StatusToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(isActive);

  const handleToggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/qr/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !active }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      setActive(!active);
      router.refresh();
    } catch (err) {
      alert("Failed: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 border border-border rounded bg-card">
      <div>
        <p className="text-sm font-medium">Status</p>
        <p className="text-xs text-muted-foreground">
          {active
            ? "QR is active and will redirect."
            : "QR is disabled. Scanning will return 410 Gone."}
        </p>
      </div>
      <button
        onClick={handleToggle}
        disabled={busy}
        className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors disabled:opacity-50 ${
          active
            ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "bg-success/10 text-success hover:bg-success/20"
        }`}
      >
        {busy ? "..." : active ? "Disable" : "Enable"}
      </button>
    </div>
  );
}
