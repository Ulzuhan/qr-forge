"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Cuenta actual y salida. En pantallas anchas se ve el email; en móvil solo la
 * inicial dentro de un círculo, que es lo que cabe al lado del botón de crear.
 */
export function UserMenu({ email, isAdmin }: { email: string; isAdmin?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Cerrar al pulsar fuera o con Escape: sin esto el panel se queda abierto
  // tapando la página hasta que se vuelve a pulsar el botón.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={wrap}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold uppercase text-primary"
        >
          {email[0]}
        </span>
        <span className="hidden max-w-[14ch] truncate lg:inline">{email}</span>
        <span className="sr-only">Cuenta</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-card p-1 shadow-lg"
        >
          <p className="truncate px-3 py-2 text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <div className="my-1 border-t border-border" />
          {isAdmin && (
            <Link
              role="menuitem"
              href="/admin"
              onClick={() => setOpen(false)}
              className="block rounded px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              Accounts
            </Link>
          )}
          <button
            role="menuitem"
            onClick={logout}
            disabled={busy}
            className="w-full rounded px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
          >
            {busy ? "Saliendo…" : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}
