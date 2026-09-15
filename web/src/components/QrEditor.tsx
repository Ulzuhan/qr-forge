import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { crearQr, editarQr, type Qr, type StaticKind } from "../lib/api";
import {
  fromLocalInputValue,
  normalizeSlug,
  parseEmailPayload,
  parseWifiPayload,
  STATIC_KIND_LABEL,
  toLocalInputValue,
  withScheme,
  type WifiFields,
} from "../lib/format";
import { buildEmailPayload, buildWifiPayload } from "../lib/payload";
import { shortUrl } from "../lib/url";
import { useNavigation } from "../navigation";
import { Button, ButtonLink } from "../ui/Button";
import { Field, Input, Switch, Textarea } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { Pill } from "../ui/Pill";
import { Segmented } from "../ui/Segmented";
import { flash } from "../ui/Toast";
import { IconBolt, IconBox, IconCalendar, IconChevron, IconLink, IconMail, IconSparkle, IconTag, IconText, IconWifi } from "../ui/icons";
import { QrTile } from "./QrTile";

/**
 * Lo que otra herramienta ha decidido por quien llega, ya validado por el
 * servidor (internal/httpapi/paginas.go). Aquí sólo se pinta.
 */
export type Initial = { url: string; title: string; from: "linkup" | null };

type Props =
  | { mode: "create"; baseUrl: string; initial?: Initial | null }
  | { mode: "edit"; baseUrl: string; qr: Qr };

const GHOST_SLUG = "yourcode";

/**
 * El editor de un código, para crear y para cambiar. A la izquierda el
 * formulario; a la derecha el código tal como va a quedar, dibujado mientras
 * se escribe. Un dinámico ya creado no cambia nunca de imagen, y aquí se ve.
 */
export function QrEditor(props: Props) {
  const router = useNavigation();
  const editing = props.mode === "edit" ? props.qr : null;
  const initial = props.mode === "create" ? (props.initial ?? null) : null;

  // Con intención se abre en estático: quien viene de LinkUp ya tiene un
  // enlace que redirige, y hacerlo dinámico otra vez añadiría un salto y un
  // segundo contador para la misma cosa. Puede cambiarlo.
  const [type, setType] = useState<"dynamic" | "static">(editing?.type ?? (initial ? "static" : "dynamic"));
  const [kind, setKind] = useState<StaticKind>(editing?.staticKind ?? "url");

  const [title, setTitle] = useState(editing?.title ?? initial?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [campaign, setCampaign] = useState(editing?.campaign ?? "");
  const [customSlug, setCustomSlug] = useState("");
  const [expiresAt, setExpiresAt] = useState(toLocalInputValue(editing?.expiresAt));

  const [destinationUrl, setDestinationUrl] = useState(editing?.destinationUrl ?? initial?.url ?? "");
  const [staticUrl, setStaticUrl] = useState(
    editing?.staticKind === "url" ? (editing.staticPayload ?? "") : (initial?.url ?? "")
  );
  const parsedWifi = editing?.staticKind === "wifi" ? parseWifiPayload(editing.staticPayload ?? "") : null;
  const parsedEmail = editing?.staticKind === "email" ? parseEmailPayload(editing.staticPayload ?? "") : null;
  const [wifi, setWifi] = useState<WifiFields>(parsedWifi ?? { ssid: "", password: "", security: "WPA", hidden: false });
  const [email, setEmail] = useState(parsedEmail ?? { to: "", subject: "", body: "" });
  const [text, setText] = useState(editing?.staticKind === "text" ? (editing.staticPayload ?? "") : "");
  // Un payload guardado que no se deja leer se edita tal cual, sin inventarle campos.
  const rawMode = Boolean(editing && editing.type === "static" &&
    ((editing.staticKind === "wifi" && !parsedWifi) || (editing.staticKind === "email" && !parsedEmail)));
  const [rawPayload, setRawPayload] = useState(editing?.staticPayload ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staticPayload = useMemo(() => {
    if (rawMode) return rawPayload;
    switch (kind) {
      case "url":
        return staticUrl.trim();
      case "wifi":
        return wifi.ssid ? buildWifiPayload(wifi.ssid, wifi.password, wifi.security, wifi.hidden) : "";
      case "email":
        return email.to ? buildEmailPayload(email.to.trim(), email.subject, email.body) : "";
      case "text":
        return text;
    }
  }, [rawMode, rawPayload, kind, staticUrl, wifi, email, text]);

  const slug = normalizeSlug(customSlug);
  const previewValue =
    type === "dynamic"
      ? editing
        ? shortUrl(props.baseUrl, editing.id)
        : shortUrl(props.baseUrl, slug || GHOST_SLUG)
      : staticPayload;
  const previewExact = type === "static" || Boolean(editing) || slug.length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          title: title.trim(),
          description: description.trim() || null,
          campaign: campaign.trim() || null,
          expiresAt: fromLocalInputValue(expiresAt),
        };
        if (editing.type === "dynamic") body.destinationUrl = destinationUrl.trim();
        else body.staticPayload = staticPayload;
        await editarQr(editing.id, body);
        flash({ tone: "ok", title: "Changes saved" });
        router.push(`/${editing.id}`);
        return;
      }
      const body: Record<string, unknown> = { title: title.trim(), type };
      if (description.trim()) body.description = description.trim();
      if (campaign.trim()) body.campaign = campaign.trim();
      if (type === "dynamic" && slug) body.customSlug = slug;
      const expiry = fromLocalInputValue(expiresAt);
      if (expiry) body.expiresAt = expiry;
      if (type === "dynamic") body.destinationUrl = destinationUrl.trim();
      else {
        body.staticKind = kind;
        body.staticPayload = staticPayload;
      }
      const { id } = await crearQr(body);
      flash({
        tone: "ok",
        title: "Code created",
        body: type === "dynamic" ? "Download it, print it, and change the destination whenever you like." : "Download it and print it. The content is in the image.",
      });
      router.push(`/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const optionsOpen = Boolean(campaign || expiresAt);

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="space-y-5">
        {initial?.from === "linkup" && (
          <Notice tone="info" className="animate-fade">
            This link is already dynamic in LinkUp: the code encodes it as-is, and its destination is changed there.
            Switch to Dynamic only if you want scan statistics of its own; every scan will also count as a click in
            LinkUp.
          </Notice>
        )}

        {/* ── Tipo ── */}
        {editing ? null : (
          <section className="panel animate-rise">
            <div className="panel-head">
              <h2 className="panel-title">
                <IconSparkle size={18} />
                What kind of code?
              </h2>
            </div>
            <div className="panel-body grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Kind of code">
              <button
                type="button"
                role="radio"
                aria-checked={type === "dynamic"}
                className="choice"
                onClick={() => setType("dynamic")}
              >
                <span className="choice-icon">
                  <IconBolt size={20} />
                </span>
                <span>
                  <span className="block font-semibold">Dynamic</span>
                  <span className="mt-1 block text-sm leading-relaxed text-text-2">
                    Encodes a short link on this server. Change the destination any time, count scans, pause it.
                  </span>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={type === "static"}
                className="choice choice-cyan"
                onClick={() => setType("static")}
              >
                <span className="choice-icon">
                  <IconBox size={20} />
                </span>
                <span>
                  <span className="block font-semibold">Static</span>
                  <span className="mt-1 block text-sm leading-relaxed text-text-2">
                    The content goes straight into the image. Works offline and forever; nothing is tracked.
                  </span>
                </span>
              </button>
            </div>
          </section>
        )}

        {/* ── Contenido ── */}
        <section className="panel animate-rise [animation-delay:60ms]">
          <div className="panel-head">
            <h2 className="panel-title">
              {type === "dynamic" ? <IconLink size={18} /> : <IconBox size={18} />}
              {type === "dynamic" ? "Where it points" : "What it encodes"}
            </h2>
            {editing && (
              <Pill tone={editing.type === "dynamic" ? "ember" : "cyan"}>
                {editing.type === "dynamic" ? <IconBolt /> : <IconBox />}
                {editing.type === "dynamic" ? "Dynamic" : `Static · ${STATIC_KIND_LABEL[editing.staticKind ?? ""] ?? "Static"}`}
              </Pill>
            )}
          </div>
          <div className="panel-body space-y-5">
            {type === "static" && !editing && (
              <Segmented<StaticKind>
                label="Content type"
                value={kind}
                onChange={setKind}
                className="w-full"
                options={[
                  { value: "url", label: "Link", icon: <IconLink size={15} /> },
                  { value: "wifi", label: "WiFi", icon: <IconWifi size={15} /> },
                  { value: "email", label: "Email", icon: <IconMail size={15} /> },
                  { value: "text", label: "Text", icon: <IconText size={15} /> },
                ]}
              />
            )}

            {type === "dynamic" && (
              <Field
                id="destinationUrl"
                label="Destination URL"
                required
                hint={
                  editing
                    ? "Every copy already printed starts pointing here the moment you save."
                    : "You can change this any time. The printed code stays the same."
                }
                warn={Boolean(editing)}
              >
                <Input
                  id="destinationUrl"
                  name="destinationUrl"
                  type="url"
                  inputMode="url"
                  mono
                  required
                  autoFocus={!editing && !initial}
                  placeholder="https://example.com/spring-menu"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  onBlur={() => setDestinationUrl((v) => withScheme(v))}
                />
              </Field>
            )}

            {type === "static" && rawMode && (
              <Field
                id="rawPayload"
                label="Encoded content"
                required
                hint="This content could not be read as structured fields, so it is edited as-is. Changing it changes the code itself."
                warn
              >
                <Textarea id="rawPayload" mono required rows={5} value={rawPayload} onChange={(e) => setRawPayload(e.target.value)} />
              </Field>
            )}

            {type === "static" && !rawMode && kind === "url" && (
              <Field
                id="staticUrl"
                label="URL"
                required
                hint={editing ? "Changing this changes the code itself: anything already printed keeps the old link." : "Encoded directly into the image. No redirect, nothing tracked."}
                warn={Boolean(editing)}
              >
                <Input
                  id="staticUrl"
                  name="staticUrl"
                  type="url"
                  inputMode="url"
                  mono
                  required
                  placeholder="https://example.com"
                  value={staticUrl}
                  onChange={(e) => setStaticUrl(e.target.value)}
                  onBlur={() => setStaticUrl((v) => withScheme(v))}
                />
              </Field>
            )}

            {type === "static" && !rawMode && kind === "wifi" && (
              <div className="space-y-4">
                {editing && <Notice tone="warn">Changing these changes the code itself. Anything already printed keeps the old network.</Notice>}
                <Field id="wifiSsid" label="Network name (SSID)" required>
                  <Input
                    id="wifiSsid"
                    required
                    autoComplete="off"
                    placeholder="cafe-guests"
                    value={wifi.ssid}
                    onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })}
                  />
                </Field>
                <div>
                  <span className="label">Security</span>
                  <Segmented<WifiFields["security"]>
                    label="Security"
                    value={wifi.security}
                    onChange={(security) => setWifi({ ...wifi, security })}
                    className="w-full"
                    options={[
                      { value: "WPA", label: "WPA / WPA2" },
                      { value: "WEP", label: "WEP" },
                      { value: "nopass", label: "Open" },
                    ]}
                  />
                </div>
                <Field
                  id="wifiPassword"
                  label="Password"
                  required={wifi.security !== "nopass"}
                  hint={wifi.security === "nopass" ? "An open network has no password." : "Shown in clear on purpose, so you can check it before printing."}
                >
                  <Input
                    id="wifiPassword"
                    type="text"
                    mono
                    autoComplete="off"
                    spellCheck={false}
                    required={wifi.security !== "nopass"}
                    disabled={wifi.security === "nopass"}
                    placeholder={wifi.security === "nopass" ? "" : "the network password"}
                    value={wifi.security === "nopass" ? "" : wifi.password}
                    onChange={(e) => setWifi({ ...wifi, password: e.target.value })}
                  />
                </Field>
                <Switch id="wifiHidden" checked={wifi.hidden} onChange={(hidden) => setWifi({ ...wifi, hidden })} label="Hidden network (SSID not broadcast)" />
              </div>
            )}

            {type === "static" && !rawMode && kind === "email" && (
              <div className="space-y-4">
                {editing && <Notice tone="warn">Changing these changes the code itself. Anything already printed keeps the old address.</Notice>}
                <Field id="emailTo" label="To" required>
                  <Input
                    id="emailTo"
                    type="email"
                    required
                    placeholder="hello@example.com"
                    value={email.to}
                    onChange={(e) => setEmail({ ...email, to: e.target.value })}
                  />
                </Field>
                <Field id="emailSubject" label="Subject" optional>
                  <Input id="emailSubject" placeholder="Booking request" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
                </Field>
                <Field id="emailBody" label="Message" optional>
                  <Textarea id="emailBody" rows={3} placeholder="Hi! I'd like to…" value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} />
                </Field>
              </div>
            )}

            {type === "static" && !rawMode && kind === "text" && (
              <Field
                id="textContent"
                label="Text"
                required
                hint={
                  <span className="flex justify-between gap-4">
                    <span>{editing ? "Changing this changes the code itself." : "An address, a note, a serial number, instructions."}</span>
                    <span className="tabular-nums">{text.length} / 2000</span>
                  </span>
                }
                warn={Boolean(editing)}
              >
                <Textarea id="textContent" required rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
            )}

            {type === "static" && !rawMode && kind !== "text" && staticPayload && (
              <p className="hint break-all">
                Encoded as <code className="rounded bg-bg-3 px-1.5 py-0.5 text-[0.75rem] text-text-2">{staticPayload}</code>
              </p>
            )}
          </div>
        </section>

        {/* ── Detalles ── */}
        <section className="panel animate-rise [animation-delay:120ms]">
          <div className="panel-head">
            <h2 className="panel-title">
              <IconTag size={18} />
              How you'll recognize it
            </h2>
          </div>
          <div className="panel-body space-y-5">
            <Field id="title" label="Title" required hint="Only for you: it is not printed and not shown to anyone who scans.">
              <Input
                id="title"
                name="title"
                required
                maxLength={100}
                placeholder={type === "static" && kind === "wifi" ? "Guest WiFi at the counter" : "Spring menu · table cards"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field id="description" label="Description" optional>
              <Input
                id="description"
                maxLength={300}
                placeholder="Where it's printed, who asked for it, what to remember"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* ── Opciones ── */}
        <details className="panel group animate-rise [animation-delay:180ms]" open={optionsOpen || undefined}>
          <summary className="panel-head cursor-pointer list-none select-none flex-nowrap [&::-webkit-details-marker]:hidden">
            <span className="panel-title min-w-0">
              <IconCalendar size={18} className="flex-none" />
              <span className="flex-none">More options</span>
              <span className="min-w-0 truncate text-xs font-normal text-text-3">
                campaign, {type === "dynamic" && !editing ? "custom slug, " : ""}expiry
              </span>
            </span>
            <IconChevron size={18} className="flex-none text-text-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="panel-body grid gap-5 sm:grid-cols-2">
            <Field id="campaign" label="Campaign tag" optional hint="A word to group codes: flyer-spring-2026.">
              <Input id="campaign" maxLength={100} placeholder="spring-2026" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            </Field>
            {type === "dynamic" && !editing && (
              <Field
                id="customSlug"
                label="Custom slug"
                optional
                hint={
                  slug ? (
                    <>
                      Will be printed as <span className="font-mono text-text-2">{shortUrl(props.baseUrl, slug)}</span>
                      {slug !== customSlug.trim() && " (normalized)"}
                    </>
                  ) : (
                    "Letters, numbers and dashes, up to 40. Leave it empty for a random 7-character slug."
                  )
                }
              >
                <Input id="customSlug" mono maxLength={40} placeholder="spring-menu" autoComplete="off" spellCheck={false} value={customSlug} onChange={(e) => setCustomSlug(e.target.value)} />
              </Field>
            )}
            <Field
              id="expiresAt"
              label="Expires"
              optional
              className={type === "dynamic" && !editing ? "sm:col-span-2" : ""}
              hint={
                type === "dynamic"
                  ? "After this moment the short link answers 410 Gone. Leave it empty to never expire."
                  : "Only marks the code as expired here. The printed image keeps working on its own."
              }
            >
              <Input id="expiresAt" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
          </div>
        </details>

        {error && (
          <Notice tone="danger" className="animate-fade">
            {error}
          </Notice>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <ButtonLink href={editing ? `/${editing.id}` : "/"} variant="ghost">
            Cancel
          </ButtonLink>
          <Button type="submit" variant="primary" size="lg" loading={busy} className="sm:min-w-44">
            {!busy && (editing ? <IconBolt size={18} /> : <IconSparkle size={18} />)}
            {editing ? "Save changes" : "Create QR"}
          </Button>
        </div>
      </div>

      {/* ── Vista previa ── */}
      <aside className="animate-rise [animation-delay:200ms] lg:sticky lg:top-20">
        <div className="panel p-4 sm:p-5">
          <p className="eyebrow">{editing ? "Your code" : "Preview"}</p>
          <QrTile
            className="mt-4"
            value={previewValue}
            label="Preview of the QR code"
            placeholder={type === "static" ? "Fill in the content to see the code" : "Enter a destination to see the code"}
          >
            {previewValue && (
              <p className="mt-3 break-all text-center font-mono text-[11px] leading-snug text-ink/60">{previewValue}</p>
            )}
          </QrTile>
          <PreviewNotes type={type} exact={previewExact} editing={Boolean(editing)} />
        </div>
      </aside>
    </form>
  );
}

function PreviewNotes({ type, exact, editing }: { type: "dynamic" | "static"; exact: boolean; editing: boolean }): ReactNode {
  const items =
    type === "dynamic"
      ? editing
        ? ["This image never changes, whatever you edit.", "Only the destination behind it moves.", "Disable it any time to stop the redirect."]
        : exact
          ? ["This is the exact code you'll get, if the slug is free.", "Destination and title can change later.", "Scans are counted from the first one."]
          : ["The final code appears when you save: the slug is picked then.", "Or choose a custom slug in More options to see it now.", "Destination and title can change later."]
      : ["This is exactly what gets printed.", "It works without this server, forever.", "There are no scan statistics for static codes."];
  return (
    <ul className="mt-4 space-y-2 text-xs leading-relaxed text-text-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className={`mt-[7px] size-1.5 flex-none rounded-full ${type === "dynamic" ? "bg-ember" : "bg-cyan"}`} aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}
