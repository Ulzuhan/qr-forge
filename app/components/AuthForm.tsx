"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Props = {
  mode: "login" | "register";
  /** A dónde ir tras entrar. Viene de ?next= cuando una página protegida redirigió aquí. */
  next?: string;
  /** En modo login: si el registro está cerrado, no se ofrece el enlace de alta. */
  registrationOpen?: boolean;
};

const COPY = {
  login: {
    title: "Entrar",
    subtitle: "Tus QRs, tus estadísticas.",
    submit: "Entrar",
    working: "Entrando…",
    endpoint: "/api/auth/login",
    autoComplete: "current-password",
  },
  register: {
    title: "Crear cuenta",
    subtitle: "Gratis, y tus QRs solo los ves tú.",
    submit: "Crear cuenta",
    working: "Creando…",
    endpoint: "/api/auth/register",
    autoComplete: "new-password",
  },
} as const;

export function AuthForm({ mode, next, registrationOpen = true }: Props) {
  const router = useRouter();
  const copy = COPY[mode];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(copy.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        // refresh() además de push(): el layout y el dashboard se renderizan en
        // el servidor y tienen que volver a leerse ya con la sesión puesta.
        router.push(next && next.startsWith("/") ? next : "/");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se ha podido completar");
      setPassword("");
    } catch {
      setError("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12 sm:py-20">
      <div className="mb-6 text-center">
        <p className="text-4xl">⚡</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-lg border border-border bg-card p-5 sm:p-6"
      >
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={copy.autoComplete}
            required
            minLength={mode === "register" ? 10 : undefined}
            aria-describedby={mode === "register" ? "password-hint" : undefined}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-sm"
          />
          {mode === "register" && (
            <p id="password-hint" className="text-xs text-muted-foreground">
              Mínimo 10 caracteres.
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? copy.working : copy.submit}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          registrationOpen ? (
            <>
              ¿No tienes cuenta?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Crear una
              </Link>
            </>
          ) : (
            "El registro está cerrado en esta instancia."
          )
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Entrar
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
