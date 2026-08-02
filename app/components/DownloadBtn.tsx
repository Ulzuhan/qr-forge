"use client";

import { downloadQr } from "./QrPreview";

type Props = {
  /** Slug (dynamic) */
  slug?: string;
  /** Payload literal (static) */
  payload?: string;
  id: string;
  format: "png" | "svg";
};

export function DownloadBtn({ slug, payload, id, format }: Props) {
  return (
    <button
      onClick={() => downloadQr({ slug, payload }, `qr-${id}`, format)}
      className="flex-1 px-3 py-2 text-sm rounded-md bg-muted hover:bg-muted/70 transition-colors"
    >
      ↓ {format.toUpperCase()}
    </button>
  );
}
