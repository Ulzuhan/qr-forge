"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  id: string;
  title: string;
};

export function DeleteButton({ id, title }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete QR "${title}"?\nThis will also delete all scan history. This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/qr/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.refresh();
    } catch (err) {
      alert("Failed to delete: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className="px-3 py-1.5 text-sm rounded-md text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
      title="Delete QR"
      aria-label="Delete QR"
    >
      {busy ? "..." : "🗑"}
    </button>
  );
}
