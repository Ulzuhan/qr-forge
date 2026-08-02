"use client";

import { useEffect, useState } from "react";

/**
 * Componente que gestiona la "Base URL" del QR service.
 * Se guarda en localStorage para que el QR generado apunte a la URL
 * completa del tunnel (ej. https://qr.tu-dominio.com/r/abc).
 *
 * En localhost por defecto: http://localhost:3459
 */
export function BaseUrlConfig() {
  const [baseUrl, setBaseUrl] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("qrforge.baseUrl");
    if (saved) {
      setBaseUrl(saved);
    } else if (typeof window !== "undefined") {
      // Default: window.location.origin
      setBaseUrl(window.location.origin);
    }
  }, []);

  const save = () => {
    let url = baseUrl.trim().replace(/\/$/, ""); // strip trailing slash
    if (url && !/^https?:\/\//.test(url)) {
      url = "https://" + url;
    }
    localStorage.setItem("qrforge.baseUrl", url);
    setBaseUrl(url);
    // Recargar para que se regeneren los QRs con la nueva base
    window.location.reload();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
        title="Configure base URL for QR codes"
      >
        ⚙ Base URL: <span className="font-mono">{baseUrl || "..."}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-6 max-w-md w-full space-y-3"
      >
        <h3 className="text-lg font-bold">Base URL for QR codes</h3>
        <p className="text-sm text-muted-foreground">
          The QR image encodes <code className="px-1 bg-muted rounded">{"{baseUrl}/r/{slug}"}</code>.
          Set this to your public tunnel URL so scans from phones go to the right place.
        </p>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://qr.tu-dominio.com"
          className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Current window origin: <code className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}</code>
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-1.5 text-sm rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hook para leer la baseUrl desde localStorage en el cliente */
export function useBaseUrl(): string {
  const [baseUrl, setBaseUrl] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem("qrforge.baseUrl");
    if (saved) {
      setBaseUrl(saved);
    } else if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);
  return baseUrl;
}
