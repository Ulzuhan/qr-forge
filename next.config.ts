import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para que better-sqlite3 no se bundlee (es nativo)
  serverExternalPackages: ["better-sqlite3"],
  // Fija la raíz del espacio de trabajo a este directorio. Sin esto, un
  // lockfile perdido más arriba en el árbol hace que Next deduzca la raíz
  // equivocada.
  //
  // `import.meta.dirname` y no una ruta escrita a mano: la absoluta cableada era
  // la de esta máquina y rompía el build de quien clonase el repositorio. Esta
  // es absoluta —que es lo que Next pide— y se resuelve sola en cada sitio.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
