/**
 * Lo poquito que Next ponía y aquí no hay.
 *
 * `next/link` era un `<a>` con prebúsqueda; sin router no hay nada que
 * prebuscar, así que es un `<a>`. Y `useRouter` movía entre páginas del
 * servidor: aquí también, porque estas rutas las sirve Go y una navegación de
 * verdad es lo que las carga.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

export default function Link({
  href, children, prefetch: _prefetch, ...resto
}: { href: string; children?: ReactNode; prefetch?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  // `prefetch` se acepta y se tira: los componentes vienen del árbol de Next y
  // pasárselo al `<a>` sólo pintaría un atributo inventado.
  return <a href={href} {...resto}>{children}</a>;
}

export function useRouter() {
  return {
    // Navegación de verdad: la página siguiente la compone Go con la sesión ya
    // resuelta. Un router de cliente tendría que rehacer ese trabajo.
    push(url: string) {
      window.location.assign(url);
    },
    refresh() {
      window.location.reload();
    },
    back() {
      window.history.back();
    },
  };
}
