import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconInfo } from "./icons";

export type ToastTone = "ok" | "danger" | "info";
export type ToastInput = { title: string; body?: string; tone?: ToastTone };
type Toast = ToastInput & { id: number };

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const FLASH_KEY = "qrforge:flash";

/**
 * Un aviso que sobrevive a la navegación: se guarda antes de cambiar de página
 * y el proveedor lo enseña al montar. sessionStorage puede no existir (modo
 * privado, almacenamiento bloqueado): en ese caso simplemente no hay aviso.
 */
export function flash(t: ToastInput) {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify(t));
  } catch {
    /* sin almacenamiento no hay aviso, y no pasa nada */
  }
}

function takeFlash(): ToastInput | null {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FLASH_KEY);
    return JSON.parse(raw) as ToastInput;
  } catch {
    return null;
  }
}

const ICONS: Record<ToastTone, ReactNode> = {
  ok: <IconCheck size={18} />,
  danger: <IconAlert size={18} />,
  info: <IconInfo size={18} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setToasts((list) => [...list, { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.tone === "danger" ? 7000 : 4200);
  }, []);

  useEffect(() => {
    const pending = takeFlash();
    if (pending) push(pending);
  }, [push]);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
      >
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone ?? "ok"} pointer-events-auto`}>
            {ICONS[t.tone ?? "ok"]}
            <div className="min-w-0">
              <p className="text-sm font-medium">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-text-2">{t.body}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
