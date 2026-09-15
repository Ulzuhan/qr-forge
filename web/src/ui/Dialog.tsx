import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./icons";

/**
 * Un diálogo modal sobre <dialog>: el navegador pone el foco, atrapa el
 * teclado y cierra con Escape. Pulsar el fondo también cierra.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="dialog-title" className="text-xl">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm -mr-2 -mt-1" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>
        {description && <p className="mt-2 text-sm text-text-2">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}
