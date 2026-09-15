/**
 * El código en sí: la matriz para dibujarlo bonito en pantalla, y los ficheros
 * para imprimirlo. Las dos cosas parten del mismo valor y del mismo nivel de
 * corrección (M, el de la librería), así que lo que se ve es lo que se descarga.
 */
import QRCode from "qrcode";

export type Matrix = { size: number; dark: (row: number, col: number) => boolean };

/** La matriz de módulos, o null si el valor está vacío o no cabe en un QR. */
export function qrMatrix(value: string): Matrix | null {
  if (!value) return null;
  try {
    const code = QRCode.create(value, { errorCorrectionLevel: "M" });
    const { size, data } = code.modules;
    return {
      size,
      dark: (row, col) => row >= 0 && col >= 0 && row < size && col < size && data[row * size + col] === 1,
    };
  } catch {
    return null;
  }
}

/**
 * Descarga el QR como PNG (1024 px) o SVG. Se usa el renderizador estándar de
 * la librería y no el dibujo redondeado de la pantalla: lo que va a imprenta
 * es la forma canónica, la que cualquier lector conoce.
 */
export async function downloadQr(value: string, filename: string, format: "png" | "svg"): Promise<void> {
  if (!value) throw new Error("Nothing to encode");
  if (format === "svg") {
    const svg = await QRCode.toString(value, {
      type: "svg",
      width: 1024,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    triggerDownload(new Blob([svg], { type: "image/svg+xml" }), `${filename}.svg`);
    return;
  }
  const dataUrl = await QRCode.toDataURL(value, {
    width: 1024,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  triggerDownload(blobFromDataUrl(dataUrl), `${filename}.png`);
}

/**
 * Convierte el `data:` URL en un Blob sin pasar por la red: `fetch(dataUrl)` es
 * una petición y la CSP la bloquea (connect-src 'self'), con razón.
 */
function blobFromDataUrl(dataUrl: string): Blob {
  const [head, data] = dataUrl.split(",", 2);
  const type = /:(.*?);/.exec(head)?.[1] ?? "application/octet-stream";
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revocar en la misma vuelta cancela la descarga a medio empezar; se deja
  // vivir el blob un rato largo y se retira después.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
