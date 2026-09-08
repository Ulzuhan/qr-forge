import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El HTML de producción lo sirve Go, no este `index.html`: aquí sólo se
// construyen los recursos, con nombre por contenido para poder cachearlos
// eternamente. El manifiesto le dice a Go cómo se llaman.
export default defineConfig({
  // Adapter for the generated KaiCorp footer: expose only the public flag
  // that Go writes to the root element, never server environment variables.
  define: {
    "process.env.KAICORP_FOOTER_LINKS":
      "document.getElementById('app')?.dataset.footerLinks",
  },
  root: "web",
  // `public/` está en la raíz del repo, no dentro de `web/`. Vite copia lo que
  // haya aquí a la raíz de `dist`, y así el logo, el favicon y la imagen de
  // OpenGraph viajan embebidos en el binario como todo lo demás.
  publicDir: "../public",
  plugins: [
    react(),
    // `emptyOutDir` vacía el directorio, y ahí dentro vive el único fichero que
    // el repositorio guarda: sin él `go:embed all:dist` no compila en un clon
    // limpio. Se rehace al terminar.
    {
      name: "qrforge:conservar-gitkeep",
      closeBundle() {
        writeFileSync(join(import.meta.dirname, "internal", "web", "dist", ".gitkeep"), "");
      },
    },
  ],
  build: {
    outDir: "../internal/web/dist",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: "web/src/main.tsx" },
  },
});
