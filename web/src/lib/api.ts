/** Lo que el navegador necesita de la API, con los tipos que devuelve Go. */
export type Qr = {
  id: string;
  type: "dynamic" | "static";
  title: string;
  description: string | null;
  destinationUrl: string | null;
  staticPayload: string | null;
  staticKind: string | null;
  campaign: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QrConCuenta = Qr & { scanCount: number };

export type Estadisticas = {
  qr: Qr;
  total: number;
  daily: { day: string; count: number }[];
  countries: { country: string; count: number }[];
  recent: { id: number; country: string | null; userAgent: string | null; scannedAt: string }[];
  /** El periodo de la serie lo fija el servidor: aquí no se recorta otra vez. */
  dailySince: string;
  dailyDays: number;
};

async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  const res = await fetch(ruta, {
    ...opciones,
    headers: { ...(opciones?.body ? { "Content-Type": "application/json" } : {}), ...opciones?.headers },
  });
  if (!res.ok) {
    let mensaje = `HTTP ${res.status}`;
    try {
      const cuerpo = await res.json();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      /* la respuesta no era JSON */
    }
    throw new Error(mensaje);
  }
  return res.json() as Promise<T>;
}

export const listarQrs = () => pedir<{ qrs: QrConCuenta[] }>("/api/qr").then((r) => r.qrs);
export const verEstadisticas = (id: string) => pedir<Estadisticas>(`/api/qr/${encodeURIComponent(id)}/stats`);
export const verQr = (id: string) => pedir<{ qr: Qr }>(`/api/qr/${encodeURIComponent(id)}`).then((r) => r.qr);
export const crearQr = (datos: unknown) =>
  pedir<{ id: string }>("/api/qr", { method: "POST", body: JSON.stringify(datos) });
export const editarQr = (id: string, datos: unknown) =>
  pedir<{ ok: true }>(`/api/qr/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(datos) });
export const borrarQr = (id: string) =>
  pedir<{ ok: true }>(`/api/qr/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Lo que Go dejó en el nodo raíz: sesión, configuración e intención. */
export function contexto() {
  const raiz = document.getElementById("app");
  const d = raiz?.dataset ?? ({} as DOMStringMap);
  return {
    pagina: d.page ?? "landing",
    email: d.email ?? "",
    qrId: d.qrId ?? "",
    cuentaUrl: d.accountUrl ?? null,
    publicUrl: d.publicUrl ?? window.location.origin,
    enlacesPie: d.footerLinks === "on",
    intencion: d.intentUrl
      ? { url: d.intentUrl, title: d.intentTitle ?? "", from: (d.intentFrom as "linkup") ?? null }
      : null,
  };
}
