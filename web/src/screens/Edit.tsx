import { useEffect, useState } from "react";
import { EditQrForm } from "../components/EditQrForm";
import { verQr, type Qr } from "../lib/api";

export function Edit({ id }: { id: string }) {
  const [qr, setQr] = useState<Qr | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    verQr(id).then(setQr, (e: Error) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="kc-workspace qr-workspace max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <p className="text-6xl mb-4">⚠</p>
        <h1 className="text-xl font-semibold mb-2">Could not load this QR</h1>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!qr) return <div className="text-center py-20 text-muted-foreground">Loading…</div>;

  return (
    <div className="kc-workspace qr-workspace max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edit QR</h1>
        <p className="text-muted-foreground mt-1">
          <span className="font-mono">{qr.id}</span> — change anything. The QR
          image stays the same.
        </p>
      </div>
      <div className="p-4 rounded-md bg-primary/10 border border-primary/30 mb-6 text-sm">
        <strong>💡 Tip:</strong> Change the destination and every code you
        already printed points somewhere new. No reprinting.
      </div>
      <EditQrForm
        qr={{
          id: qr.id,
          type: qr.type,
          staticKind: qr.staticKind,
          title: qr.title,
          description: qr.description,
          destinationUrl: qr.destinationUrl ?? "",
          staticPayload: qr.staticPayload,
          campaign: qr.campaign,
          isActive: qr.isActive,
          // `datetime-local` quiere «YYYY-MM-DDTHH:mm», sin zona ni segundos.
          expiresAt: qr.expiresAt ? new Date(qr.expiresAt).toISOString().slice(0, 16) : "",
        }}
      />
    </div>
  );
}
