/// <reference types="vite/client" />

// `process` no existe en el navegador. La única expresión que lo usa es la del
// pie generado, y `define` en vite.config.mts la sustituye antes de compilar.
declare const process: { env: Record<string, string | undefined> };
