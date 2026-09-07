import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["{app,lib,db}/**/*.test.ts"],
    // Un solo proceso, y no por gusto: `lib/qr.ts` importa `@/db`, que abre
    // ./qrforge.db y le pone `journal_mode = WAL` al cargarse. Con los ficheros
    // de prueba en paralelo, varios procesos hacen eso a la vez sobre el MISMO
    // fichero y el segundo se lleva un SQLITE_BUSY: «database is locked» en una
    // prueba que no toca la base para nada.
    //
    // Falla de forma intermitente —depende de quién llegue antes—, que es la
    // peor manera de fallar. En un solo proceso comparten el singleton del
    // módulo y no hay carrera.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
