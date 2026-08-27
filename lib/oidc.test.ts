import { describe, expect, it } from "vitest";
import { safeNext } from "./oidc";

/**
 * `safeNext` decide a dónde vuelve el usuario tras iniciar sesión.
 *
 * La versión anterior —`startsWith("/") && !startsWith("//")`— estuvo abierta en
 * CUATRO servicios a la vez, y se verificó explotable en producción: los
 * navegadores normalizan `\` a `/` dentro de una URL, así que `/\evil.com` pasa
 * el filtro y se resuelve como `//evil.com`, protocolo relativo hacia fuera.
 * Iniciar sesión era un redirector a cualquier dominio.
 *
 * Se arregló en un servicio y no se propagó a los otros durante semanas. Este
 * test existe para que la próxima vez lo diga una máquina y no una auditoría.
 */

describe("safeNext", () => {
  it("deja pasar rutas internas normales", () => {
    for (const r of ["/", "/panel", "/qr/abc123", "/a?x=1&y=2", "/con espacio", "/con-guion"]) {
      expect(safeNext(r), `debería aceptar: ${r}`).toBe(r);
    }
  });

  it("bloquea el bypass con contrabarra, que es el que abrió el agujero", () => {
    for (const r of ["/\\evil.com", "/\\/evil.com", "/\\\\evil.com"]) {
      expect(safeNext(r), `debería bloquear: ${r}`).toBe("/");
    }
  });

  it("bloquea el protocolo relativo y las URL absolutas", () => {
    for (const r of [
      "//evil.com",
      "///evil.com",
      "https://evil.com",
      "http://evil.com",
      "javascript:alert(1)",
      "evil.com",
    ]) {
      expect(safeNext(r), `debería bloquear: ${r}`).toBe("/");
    }
  });

  it("no se deja engañar por caracteres de control", () => {
    // El navegador los descarta al resolver la URL, así que comprobar sobre la
    // cadena sucia estaría mirando una URL distinta de la que se va a seguir.
    // Escritos con secuencias de escape y no como bytes crudos: un byte de
    // control literal en el fuente hace que git trate el fichero como binario
    // y deje de mostrar sus diffs — pasó una vez y no debe repetirse.
    for (const r of [
      " //evil.com",
      "\t//evil.com",
      "\n//evil.com",
      "\r//evil.com",
      "/\t\\evil.com",
      "/ \\evil.com",
    ]) {
      const salida = safeNext(r);
      expect(salida.startsWith("//"), `escapó: ${JSON.stringify(r)}`).toBe(false);
      expect(salida.startsWith("/\\"), `escapó: ${JSON.stringify(r)}`).toBe(false);
    }
  });

  it("trata como inválido lo que no es una cadena útil", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});
