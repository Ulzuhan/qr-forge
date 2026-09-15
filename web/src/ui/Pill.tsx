import type { ReactNode } from "react";

export type PillTone = "ember" | "cyan" | "ok" | "warn" | "danger" | "muted";

export function Pill({
  tone = "muted",
  dot,
  children,
  className,
  title,
}: {
  tone?: PillTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={`pill pill-${tone} ${className ?? ""}`} title={title}>
      {dot && <span className={`pill-dot ${tone === "ok" ? "animate-blink" : ""}`} aria-hidden />}
      {children}
    </span>
  );
}
