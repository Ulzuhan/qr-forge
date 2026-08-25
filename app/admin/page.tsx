import { notFound } from "next/navigation";
import { approvedUsers, currentUser, isAdmin, pendingUsers, registrationMode } from "@/lib/auth";
import { PendingRow } from "../components/PendingRow";

export const dynamic = "force-dynamic";

/**
 * Panel del administrador: quién está esperando entrar y quién ya está dentro.
 *
 * A quien no sea admin se le responde 404 en vez de "no autorizado": confirmar
 * que existe un panel solo sirve para que alguien insista.
 */
export default async function AdminPage() {
  const user = await currentUser();
  if (!isAdmin(user)) notFound();

  const [pending, approved] = await Promise.all([pendingUsers(), approvedUsers()]);
  const mode = registrationMode();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
      <p className="mt-1 text-muted-foreground">
        Sign-ups are{" "}
        <span className="font-medium text-foreground">
          {mode === "approval"
            ? "open, with your approval"
            : mode === "open"
              ? "open to anyone"
              : "closed"}
        </span>
        . Change it with <code className="rounded bg-muted px-1 py-0.5 text-xs">QRFORGE_REGISTRATION</code>.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">
          Waiting {pending.length > 0 && `(${pending.length})`}
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nobody is waiting.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pending.map((p) => (
              <PendingRow
                key={p.id}
                id={p.id}
                email={p.email}
                askedAt={p.createdAt.toISOString()}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Inside ({approved.length})</h2>
        <ul className="mt-3 space-y-2">
          {approved.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span className="min-w-0 truncate text-sm">{a.email}</span>
              {a.role === "admin" && (
                <span className="shrink-0 rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">
                  admin
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
