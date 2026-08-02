"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useBaseUrl } from "./BaseUrlConfig";

type Props = {
  /** Slug (dynamic): el QR apunta a baseUrl + /r/{slug} */
  slug?: string;
  /** Payload literal (static): se codifica tal cual */
  payload?: string;
  size?: number;
};

export function QrThumbnail({ slug, payload, size = 140 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const baseUrl = useBaseUrl();

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
  }, [slug, payload, size, baseUrl]);

  return <div ref={ref} style={{ width: size, height: size }} />;
}
