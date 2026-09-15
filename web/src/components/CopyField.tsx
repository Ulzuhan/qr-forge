import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy } from "../ui/icons";

type State = "idle" | "copied" | "blocked";

/**
 * Copiar al portapapeles se deniega en más sitios de los que parece (iframes,
 * permisos, contextos sin HTTPS). Cuando falla, el texto queda seleccionado y
 * se dice cómo copiarlo a mano: el estado de error se ve, y hay alternativa.
 */
export function useCopy(text: string) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      timer.current = window.setTimeout(() => setState("idle"), 1800);
      return true;
    } catch {
      setState("blocked");
      timer.current = window.setTimeout(() => setState("idle"), 4000);
      return false;
    }
  };
  return { state, copy };
}

export function CopyField({
  value,
  label,
  mono = true,
  className,
}: {
  value: string;
  label: string;
  mono?: boolean;
  className?: string;
}) {
  const { state, copy } = useCopy(value);
  const input = useRef<HTMLInputElement>(null);
  const onCopy = async () => {
    const ok = await copy();
    if (!ok) input.current?.select();
  };
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <div className={className}>
      <div className="flex gap-2">
        <input
          ref={input}
          readOnly
          value={value}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className={`input min-w-0 flex-1 ${mono ? "input-mono" : ""}`}
        />
        <button
          type="button"
          onClick={onCopy}
          className={`btn btn-icon ${state === "copied" ? "btn-primary" : "btn-secondary"}`}
          aria-label={state === "copied" ? "Copied" : `Copy ${label}`}
          title="Copy"
        >
          {state === "copied" ? <IconCheck size={18} /> : <IconCopy size={18} />}
        </button>
      </div>
      <p className="hint" aria-live="polite">
        {state === "copied" && <span className="text-ok">Copied to your clipboard.</span>}
        {state === "blocked" && (
          <span className="text-warn">
            Your browser blocked the clipboard. The text is selected: press {isMac ? "⌘C" : "Ctrl+C"} to copy it.
          </span>
        )}
      </p>
    </div>
  );
}

export function CopyButton({ text, label, size = "sm" }: { text: string; label: string; size?: "sm" | "md" }) {
  const { state, copy } = useCopy(text);
  return (
    <button
      type="button"
      onClick={copy}
      className={`btn btn-icon btn-${size} ${state === "copied" ? "btn-primary" : state === "blocked" ? "btn-danger" : "btn-ghost"}`}
      aria-label={state === "copied" ? "Copied" : state === "blocked" ? "Clipboard blocked" : label}
      title={state === "blocked" ? "Your browser blocked the clipboard" : label}
    >
      {state === "copied" ? <IconCheck size={16} /> : <IconCopy size={16} />}
    </button>
  );
}
