"use client";

import { useState } from "react";
import { downloadQr } from "./QrPreview";

type Props = {
  /** Slug (dynamic) */
  slug?: string;
  /** Payload literal (static) */
  payload?: string;
  /** URL pública, para que el archivo codifique lo mismo que la vista previa. */
  baseUrl?: string;
  id: string;
  format: "png" | "svg";
};

export function DownloadBtn({ slug, payload, baseUrl, id, format }: Props) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      await downloadQr({ slug, payload, baseUrl }, `qr-${id}`, format);
    } catch (error) {
      console.error("[download]", error);
      alert("No se ha podido generar el archivo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={download}
      disabled={busy}
      className="flex-1 rounded-md bg-muted px-3 py-2 text-sm transition-colors hover:bg-muted/70 disabled:opacity-60"
    >
      ↓ {format.toUpperCase()}
    </button>
  );
}
