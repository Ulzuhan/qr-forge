"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Tab = "dynamic" | "static";
type StaticKind = "url" | "wifi" | "email" | "text";

/**
 * Lo que otra herramienta ha decidido por quien llega. Validado en el servidor
 * (lib/intent.ts) antes de llegar aquí; este componente solo lo pinta.
 */
export type Initial = {
  url: string;
  title: string;
  from: "linkup" | null;
};

export function NewQrForm({ initial }: { initial?: Initial | null }) {
  const router = useRouter();
  // Con intención se abre en estático: quien viene de LinkUp ya tiene un enlace
  // que redirige, y hacerlo dinámico otra vez añadiría un salto y un segundo
  // contador para la misma cosa. Puede cambiarlo, y la nota le dice qué gana.
  const [tab, setTab] = useState<Tab>(initial ? "static" : "dynamic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Common
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState("");
  const [campaign, setCampaign] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  // Dynamic
  // La misma URL en los dos campos a propósito: cambiar de pestaña no debe
  // perder lo que vino en la intención.
  const [destinationUrl, setDestinationUrl] = useState(initial?.url ?? "https://");

  // Static
  const [staticKind, setStaticKind] = useState<StaticKind>(initial ? "url" : "wifi");
  // WiFi fields
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiEncryption, setWifiEncryption] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [wifiHidden, setWifiHidden] = useState(false);
  // Email fields
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  // Text fields
  const [textContent, setTextContent] = useState("");
  // URL field (for static URL)
  const [staticUrl, setStaticUrl] = useState(initial?.url ?? "https://");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { title, type: tab };
      if (description) body.description = description;
      if (campaign) body.campaign = campaign;
      if (customSlug) body.customSlug = customSlug;
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();

      if (tab === "dynamic") {
        body.destinationUrl = destinationUrl;
      } else {
        body.staticKind = staticKind;
        if (staticKind === "wifi") {
          body.staticPayload = buildWifiOnClient(
            wifiSsid,
            wifiPassword,
            wifiEncryption,
            wifiHidden
          );
        } else if (staticKind === "email") {
          const params = new URLSearchParams();
          if (emailSubject) params.set("subject", emailSubject);
          if (emailBody) params.set("body", emailBody);
          const qs = params.toString();
          body.staticPayload = `mailto:${emailTo}${qs ? "?" + qs : ""}`;
        } else if (staticKind === "text") {
          body.staticPayload = textContent;
        } else if (staticKind === "url") {
          body.staticPayload = staticUrl;
        }
      }

      const res = await fetch("/api/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      router.push(`/${data.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="qr-editor space-y-5">
      {initial?.from === "linkup" && (
        <p className="qr-intent-note rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          This link is already dynamic in LinkUp: the QR encodes it as-is and its
          destination is changed there. Switch to Dynamic only if you want scan
          statistics of their own — every scan will also count as a click in
          LinkUp.
        </p>
      )}

      {/* Tabs */}
      <div className="qr-type-switch inline-flex rounded-md border border-border bg-muted p-1" role="tablist" aria-label="QR type">
        <button
          type="button"
          onClick={() => setTab("dynamic")}
          role="tab"
          aria-selected={tab === "dynamic"}
          className={`px-4 py-1.5 text-sm rounded transition-colors ${
            tab === "dynamic"
              ? "bg-card text-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          ⚡ Dynamic
        </button>
        <button
          type="button"
          onClick={() => setTab("static")}
          role="tab"
          aria-selected={tab === "static"}
          className={`px-4 py-1.5 text-sm rounded transition-colors ${
            tab === "static"
              ? "bg-card text-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📦 Static
        </button>
      </div>

      {tab === "static" && (
        <div className="qr-kind-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(["wifi", "url", "email", "text"] as StaticKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStaticKind(k)}
              className={`px-3 py-3 text-sm rounded-md border transition-colors ${
                staticKind === k
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              <div className="text-xl mb-1">{STATIC_ICONS[k]}</div>
              <div className="capitalize text-xs">{k}</div>
            </button>
          ))}
        </div>
      )}

      <Field label="Title" required>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={100}
          placeholder={tab === "static" && staticKind === "wifi" ? "Home WiFi" : "e.g. Siargao Boat Tour Flyer"}
          className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
        />
      </Field>

      {tab === "dynamic" ? (
        <Field label="Destination URL" required>
          <input
            type="url"
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            required
            placeholder="https://example.com/landing"
            className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            You can change this anytime. The QR image stays the same.
          </p>
        </Field>
      ) : (
        <>
          {staticKind === "wifi" && (
            <div className="space-y-3 p-4 rounded-md border border-border bg-card/50">
              <Field label="Network name (SSID)" required>
                <input
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  required
                  placeholder="MiWiFiCasa"
                  className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Password" required={wifiEncryption !== "nopass"}>
                <input
                  type="text"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  disabled={wifiEncryption === "nopass"}
                  required={wifiEncryption !== "nopass"}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none disabled:opacity-50"
                />
              </Field>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="enc"
                    checked={wifiEncryption === "WPA"}
                    onChange={() => setWifiEncryption("WPA")}
                  />
                  WPA/WPA2
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="enc"
                    checked={wifiEncryption === "WEP"}
                    onChange={() => setWifiEncryption("WEP")}
                  />
                  WEP
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="enc"
                    checked={wifiEncryption === "nopass"}
                    onChange={() => setWifiEncryption("nopass")}
                  />
                  Open (no password)
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={wifiHidden}
                  onChange={(e) => setWifiHidden(e.target.checked)}
                />
                Hidden network
              </label>
              <p className="text-xs text-muted-foreground">
                Encoded as: <code className="font-mono">WIFI:T:WPA;S:MiWiFiCasa;P:xxxx;;</code>
              </p>
            </div>
          )}

          {staticKind === "url" && (
            <Field label="URL" required>
              <input
                type="url"
                value={staticUrl}
                onChange={(e) => setStaticUrl(e.target.value)}
                required
                placeholder="https://example.com"
                className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The QR encodes the URL directly. No redirect, no tracking.
              </p>
            </Field>
          )}

          {staticKind === "email" && (
            <div className="space-y-3 p-4 rounded-md border border-border bg-card/50">
              <Field label="To (email address)" required>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  required
                  placeholder="contact@example.com"
                  className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Subject (optional)">
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Contact from QR"
                  className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Body (optional)">
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={3}
                  placeholder="Hello!"
                  className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none resize-none"
                />
              </Field>
            </div>
          )}

          {staticKind === "text" && (
            <Field label="Text content" required>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                required
                rows={5}
                maxLength={2000}
                placeholder="Any text — address, note, instructions, contact info..."
                className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none resize-none font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {textContent.length} / 2000 characters
              </p>
            </Field>
          )}
        </>
      )}

      <Field label="Description (optional)">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder="Short note for your reference"
          className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Campaign tag (optional)">
          <input
            type="text"
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            maxLength={50}
            placeholder="e.g. flyer-mall-2026"
            className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
          />
        </Field>
        <Field label="Custom slug (optional)">
          <input
            type="text"
            value={customSlug}
            onChange={(e) => setCustomSlug(e.target.value)}
            maxLength={40}
            placeholder="auto-generated if empty"
            className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none font-mono text-sm"
          />
        </Field>
      </div>

      <Field label="Expires at (optional)">
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-muted border border-border focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {tab === "dynamic"
            ? "After this date, the QR will stop redirecting (still 410 Gone)."
            : "For static, this only marks the QR as 'expired' in the UI — the QR image itself is independent."}
        </p>
      </Field>

      {error && (
        <div className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="qr-submit w-full sm:w-auto px-6 py-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {busy ? "Creating..." : "Create QR"}
      </button>
    </form>
  );
}

const STATIC_ICONS: Record<StaticKind, string> = {
  wifi: "📶",
  url: "🔗",
  email: "📧",
  text: "📝",
};

function buildWifiOnClient(
  ssid: string,
  password: string,
  encryption: "WPA" | "WEP" | "nopass",
  hidden: boolean
): string {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/"/g, '\\"')
      .replace(/:/g, "\\:");
  let p = `WIFI:T:${encryption};S:${esc(ssid)};`;
  if (password && encryption !== "nopass") p += `P:${esc(password)};`;
  if (hidden) p += "H:true;";
  p += ";";
  return p;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="qr-field block">
      <span className="text-sm font-medium mb-1.5 block">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
