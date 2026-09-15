import type { ReactNode } from "react";
import { QrArt } from "./QrArt";
import { IconQr } from "../ui/icons";

/**
 * El papel con el código encima. Si no hay nada que codificar todavía, enseña
 * el hueco y lo dice, en vez de un cuadrado vacío.
 */
export function QrTile({
  value,
  label,
  className,
  size = "md",
  children,
  placeholder = "Start typing to see the code",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Lo que va debajo del código, dentro del papel: el rótulo, la URL corta. */
  children?: ReactNode;
  placeholder?: string;
}) {
  const pad = size === "sm" ? "p-3" : size === "lg" ? "p-6 sm:p-7" : "p-5";
  return (
    <div className={`paper ${pad} ${className ?? ""}`}>
      {value ? (
        <QrArt value={value} label={label} className="block h-auto w-full" />
      ) : (
        <div className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-ink/15 text-ink/40">
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <IconQr size={28} />
            <p className="text-xs font-medium">{placeholder}</p>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
