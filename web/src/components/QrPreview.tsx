
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

type Props = {
  /** Slug del QR (se combinará con baseUrl para dynamic) */
  slug?: string;
  /** Payload literal (para static, no se modifica) */
  payload?: string;
  /** URL pública, decidida en el servidor (ver lib/public-url.ts). */
  baseUrl?: string;
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
  baseUrl,
  size = 256,
  className = "",
  fgColor = "#000000",
  bgColor = "#ffffff",
  level = "M",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
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
      className={`aspect-square w-full [&>svg]:h-full [&>svg]:w-full ${className}`}
      style={{ maxWidth: size }}
    />
  );
}

/**
 * Descarga el QR como PNG o SVG.
 */
export async function downloadQr(
  identifier: { slug?: string; payload?: string; baseUrl?: string },
  filename: string,
  format: "png" | "svg" = "png",
  options: { fgColor?: string; bgColor?: string; size?: number } = {}
) {
  const { fgColor = "#000000", bgColor = "#ffffff", size = 1024 } = options;

  // La base venía por defecto de window.location.origin, ignorando la que
  // estaba configurada: el PNG descargado podía codificar una URL distinta a la
  // de la vista previa, y eso acaba impreso. Ahora es la misma o no se descarga.
  if (!identifier.payload && !identifier.baseUrl) {
    throw new Error("downloadQr: falta baseUrl para un QR dinámico");
  }

  const value = identifier.payload
    ? identifier.payload
    : `${identifier.baseUrl}/r/${identifier.slug}`;

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
    triggerDownload(blobDeDataUrl(dataUrl), `${filename}.png`);
  }
}

/**
 * Convierte el `data:` URL que devuelve la librería en un Blob, sin red.
 *
 * Antes esto era un `fetch(dataUrl)`, que es una petición aunque no salga de la
 * máquina — y la CSP la bloquea, con razón: `connect-src` está en `\'self\'` y
 * abrirla a `data:` para esto sería aflojar la política por una conversión que
 * no necesita red. El resultado era una descarga que fallaba siempre y un
 * «Could not generate the file» que no explicaba por qué.
 */
function blobDeDataUrl(dataUrl: string): Blob {
  const [cabecera, datos] = dataUrl.split(",", 2);
  const tipo = /:(.*?);/.exec(cabecera)?.[1] ?? "application/octet-stream";
  const crudo = atob(datos);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // El revoke va DESPUÉS, no en la misma vuelta del bucle de eventos: el
  // navegador aún no ha empezado a leer el blob cuando `click()` retorna, y
  // revocarlo ahí cancela la descarga. Falla de forma intermitente, que es la
  // peor manera de fallar.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
