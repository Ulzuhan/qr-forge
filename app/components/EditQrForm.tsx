"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type QrData = {
  id: string;
  type: "dynamic" | "static";
  staticKind: string | null;
  title: string;
  description: string | null;
  destinationUrl: string;
  staticPayload: string | null;
  campaign: string | null;
  isActive: boolean;
  expiresAt: string;
};

export function EditQrForm({ qr }: { qr: QrData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [title, setTitle] = useState(qr.title);
  const [description, setDescription] = useState(qr.description ?? "");
  const [campaign, setCampaign] = useState(qr.campaign ?? "");
  const [expiresAt, setExpiresAt] = useState(qr.expiresAt);

  // Dynamic
  const [destinationUrl, setDestinationUrl] = useState(qr.destinationUrl);

  // Static
  const [staticPayload, setStaticPayload] = useState(qr.staticPayload ?? "");

  const isStatic = qr.type === "static";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title,
        description: description || null,
        campaign: campaign || null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      if (isStatic) {
        body.staticPayload = staticPayload;
      } else {
        body.destinationUrl = destinationUrl;
      }

      const res = await fetch(`/api/qr/${qr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Title" required>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={100}
          className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
        />
      </Field>

      {isStatic ? (
        <Field label={`Encoded payload (${qr.staticKind ?? "static"})`} required highlight>
          <textarea
            value={staticPayload}
            onChange={(e) => setStaticPayload(e.target.value)}
            required
            rows={5}
            className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none resize-none font-mono text-xs"
          />
          <p className="text-xs text-warning mt-1">
            ⚠ Cambiar esto modifica lo que el QR codifica directamente.
          </p>
        </Field>
      ) : (
        <Field label="Destination URL" required highlight>
          <input
            type="url"
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none font-mono text-sm"
          />
          <p className="text-xs text-warning mt-1">
            ⚠ Cambiar esto redirige a los QRs ya impresos. Úsalo con cabeza.
          </p>
        </Field>
      )}

      <Field label="Description (optional)">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
        />
      </Field>
      <Field label="Campaign tag (optional)">
        <input
          type="text"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          maxLength={50}
          className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
        />
      </Field>
      <Field label="Expires at (optional — leave empty for never)">
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
        />
      </Field>

      {error && (
        <div className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="px-3 py-2 rounded-md bg-success/10 text-success text-sm">
          ✓ Saved.
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/${qr.id}`)}
          className="px-6 py-2.5 rounded-md bg-muted hover:bg-muted/70 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  highlight,
  children,
}: {
  label: string;
  required?: boolean;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className={`text-sm font-medium mb-1.5 block ${
          highlight ? "text-primary" : ""
        }`}
      >
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
