import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para que better-sqlite3 no se bundlee (es nativo)
  serverExternalPackages: ["better-sqlite3"],
  // Fija la raíz del espacio de trabajo a este directorio. Sin esto, un
  // lockfile perdido más arriba en el árbol hace que Next deduzca la raíz
  // equivocada. Relativa y no absoluta: la absoluta era la de esta máquina y
  // rompía el build de cualquiera que clonase el repositorio.
  turbopack: {
    root: ".",
  },
};

export default nextConfig;
