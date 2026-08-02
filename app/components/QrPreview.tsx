"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useBaseUrl } from "./BaseUrlConfig";

type Props = {
  /** Slug del QR (se combinará con baseUrl para dynamic) */
  slug?: string;
  /** Payload literal (para static, no se modifica) */
  payload?: string;
  size?: number;
  className?: string;
  fgColor?: string;
  bgColor?: string;
  level?: "L" | "M" | "Q" | "H";
};

/**
 * Renderiza un QR en SVG. Si recibe `slug` (dynamic), usa la baseUrl del tunnel.
 * Si recibe `payload` (static), codifica ese payload literal tal cual.
 */
export function QrPreview({
  slug,
  payload,
  size = 256,
  className = "",
  fgColor = "#000000",
  bgColor = "#ffffff",
  level = "M",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const baseUrl = useBaseUrl();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const value = payload ?? (slug && baseUrl ? `${baseUrl}/r/${slug}` : null);
    if (!value) return;

    QRCode.toString(value, {
      type: "svg",
      width: size,
      margin: 2,
      errorCorrectionLevel: level,
      color: { dark: fgColor, light: bgColor },
    })
      .then((svg) => {
        if (ref.current) ref.current.innerHTML = svg;
        setError(null);
      })
      .catch((err) => setError(String(err)));
  }, [slug, payload, size, fgColor, bgColor, level, baseUrl]);

  if (error) {
    return (
      <div className="text-destructive text-sm p-4 border border-destructive rounded">
        Error: {error}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Descarga el QR como PNG o SVG.
 */
export async function downloadQr(
  identifier: { slug?: string; payload?: string },
  filename: string,
  format: "png" | "svg" = "png",
  options: { fgColor?: string; bgColor?: string; size?: number; baseUrl?: string } = {}
) {
  const {
    fgColor = "#000000",
    bgColor = "#ffffff",
    size = 1024,
    baseUrl = typeof window !== "undefined" ? window.location.origin : "",
  } = options;

  const value = identifier.payload
    ? identifier.payload
    : `${baseUrl}/r/${identifier.slug}`;

  if (format === "svg") {
    const svg = await QRCode.toString(value, {
      type: "svg",
      width: size,
      margin: 2,
      color: { dark: fgColor, light: bgColor },
    });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    triggerDownload(blob, `${filename}.svg`);
  } else {
    const dataUrl = await QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: { dark: fgColor, light: bgColor },
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    triggerDownload(blob, `${filename}.png`);
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
