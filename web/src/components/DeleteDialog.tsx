import { useState } from "react";
import { borrarQr, type Qr } from "../lib/api";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Notice } from "../ui/Notice";

/**
 * Borrar es lo único aquí que no tiene vuelta atrás, y con un dinámico además
 * deja de funcionar lo que ya está impreso. Se dice antes de pulsar.
 */
export function DeleteDialog({
  qr,
  open,
  onClose,
  onDeleted,
}: {
  qr: Pick<Qr, "id" | "title" | "type"> | null;
  open: boolean;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (!qr) return;
    setBusy(true);
    setError(null);
    try {
      await borrarQr(qr.id);
      onDeleted(qr.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Delete this code?"
      description={
        <>
          <strong className="text-text-1">{qr?.title}</strong> and its scan history will be deleted. This cannot be undone.
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="danger-solid" onClick={confirm} loading={busy}>
            Delete QR
          </Button>
        </>
      }
    >
      {qr?.type === "dynamic" ? (
        <Notice tone="warn">
          Every printed copy of this code stops working: scanning it will answer <span className="font-mono">404</span>.
          If you only want to stop the redirect for a while, disable it instead.
        </Notice>
      ) : (
        <Notice tone="plain">
          A static code keeps working after it is deleted here: the content lives in the image itself.
        </Notice>
      )}
      {error && (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      )}
    </Dialog>
  );
}
