"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type Props = {
  /** Slug (dynamic): el QR apunta a baseUrl + /r/{slug} */
  slug?: string;
  /** Payload literal (static): se codifica tal cual */
  payload?: string;
  /** URL pública, decidida en el servidor (ver lib/public-url.ts). */
  baseUrl?: string;
  size?: number;
};

export function QrThumbnail({ slug, payload, baseUrl, size = 140 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const value = payload ?? (slug && baseUrl ? `${baseUrl}/r/${slug}` : null);
    if (!value) return;

    QRCode.toString(value, {
      type: "svg",
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).then((svg) => {
      if (ref.current) ref.current.innerHTML = svg;
    });
  }, [slug, payload, baseUrl, size]);

  // El hueco se reserva con aspect-square y ancho máximo: así la tarjeta no da
  // un salto cuando el SVG entra, y en móvil el QR nunca es más ancho que ella.
  return (
    <div
      ref={ref}
      className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full"
      style={{ maxWidth: size }}
    />
  );
}
