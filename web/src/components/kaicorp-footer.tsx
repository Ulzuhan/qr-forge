/* GENERADO por kaicorplabs/tools/sync-theme.sh — NO EDITAR AQUÍ.
   El original está en el repo kaicorplabs (theme/). */
import Link from "../navigation";

/**
 * Pie común de KaiCorp Labs.
 *
 * GENERADO — se copia desde el repo `kaicorplabs` con `tools/sync-theme.sh`.
 * No editar aquí: editar el original y sincronizar.
 *
 * Usa los tokens `--kc-*` y no los de la aplicación, a propósito: el cromado
 * (cabecera y pie) es lo que se reconoce igual en los seis servicios,
 * mientras cada app conserva su propia paleta puertas adentro.
 *
 * Lleva enlaces al resto porque quien usa dos de estas aplicaciones no debería
 * tener que teclear la URL de la otra — pero SOLO si quien opera la instancia
 * lo pide con KAICORP_FOOTER_LINKS: en un despliegue ajeno, esos enlaces son
 * publicidad de servicios de otro. Sin la variable queda la atribución sola.
 * En esta adaptación React, Go decide la bandera al servir el documento
 * (CSP con nonce). El adaptador de Vite lee únicamente data-footer-links;
 * no se incluye el entorno del servidor en el bundle.
 */
const SERVICES = [
  { name: "TabUp", url: "https://tabup.kaicorplabs.com", slug: "tabup" },
  { name: "QR-Forge", url: "https://qr.kaicorplabs.com", slug: "qr-forge" },
  { name: "DocDrop", url: "https://docdrop.kaicorplabs.com", slug: "docdrop" },
  { name: "SecretDrop", url: "https://secret.kaicorplabs.com", slug: "secretdrop" },
  { name: "Pixelforge", url: "https://pixel.kaicorplabs.com", slug: "pixelforge" },
  { name: "LinkUp", url: "https://link.kaicorplabs.com", slug: "linkup" },
];

export function KaiCorpFooter({ current }: { current?: string }) {
  const showLinks = Boolean(process.env.KAICORP_FOOTER_LINKS?.trim());
  return (
    <footer
      className="mt-auto border-t px-4 py-5 sm:px-6"
      style={{
        borderColor: "var(--kc-line)",
        background: "var(--kc-bg)",
        fontFamily: "var(--kc-font-sans)",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <Link
          href="https://kaicorplabs.com"
          className="flex items-center gap-2 text-xs transition-opacity hover:opacity-80"
          style={{ color: "var(--kc-text-2)" }}
        >
          <img src="/kaicorp-mark.png" alt="" width={18} height={18} className="block size-[18px]" />
          <span>
            Built by{" "}
            <span style={{ color: "var(--kc-text-1)", fontWeight: 500 }}>KaiCorp Labs</span>
          </span>
        </Link>

        {showLinks && (
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
            {SERVICES.map((s) =>
              s.slug === current ? (
                <span key={s.slug} aria-current="page" style={{ color: "var(--kc-text-3)" }}>
                  {s.name}
                </span>
              ) : (
                <a
                  key={s.slug}
                  href={s.url}
                  className="transition-colors hover:opacity-100"
                  style={{ color: "var(--kc-text-2)" }}
                >
                  {s.name}
                </a>
              )
            )}
          </nav>
        )}
      </div>
    </footer>
  );
}
