import { describe, expect, it } from "vitest";
import { buildEmailPayload, buildWifiPayload, generateSlug, isValidUrl, sanitizeSlug } from "./qr";

/**
 * Lo que se prueba aquí, y por qué esto y no otra cosa.
 *
 * `generateSlug` usaba `Math.random()`. El slug es público —va impreso en el
 * QR— pero el PRNG de V8 es reconstruible a partir de unas pocas salidas: quien
 * cree unos cuantos códigos propios podía predecir los de otros usuarios y ver
 * a dónde apuntan. Un test no puede demostrar que un generador es seguro, pero
 * sí puede fijar el alfabeto, la longitud y que no se repita, que es lo que
 * rompería un cambio descuidado.
 *
 * `isValidUrl` decide si un destino se acepta. Es la puerta por la que un QR
 * podría acabar apuntando a `javascript:` o a un esquema raro.
 */

describe("generateSlug", () => {
  it("respeta longitud y alfabeto sin caracteres ambiguos", () => {
    // Sin 0/O ni 1/l/I a propósito: alguien va a teclear esto mirando un papel.
    const permitido = /^[abcdefghjkmnpqrstuvwxyz23456789]+$/;
    for (let i = 0; i < 1000; i++) {
      const s = generateSlug();
      expect(s, `slug: ${s}`).toHaveLength(7);
      expect(permitido.test(s), `slug: ${s}`).toBe(true);
    }
  });

  it("respeta una longitud pedida", () => {
    expect(generateSlug(4)).toHaveLength(4);
    expect(generateSlug(12)).toHaveLength(12);
  });

  it("no repite en 5000 tiradas", () => {
    // No demuestra que sea impredecible, pero un generador roto —constante,
    // sembrado igual, con un rango mal calculado— se cae aquí.
    const vistos = new Set(Array.from({ length: 5000 }, () => generateSlug()));
    expect(vistos.size).toBe(5000);
  });

  it("reparte sobre todo el alfabeto, sin huecos", () => {
    // Un `randomInt` mal usado —un off-by-one en el rango— dejaría el último
    // carácter del alfabeto sin salir nunca, y sería invisible a simple vista.
    const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789";
    const vistos = new Set<string>();
    for (let i = 0; i < 3000; i++) for (const c of generateSlug()) vistos.add(c);
    expect(vistos.size).toBe(alfabeto.length);
  });
});

describe("isValidUrl", () => {
  it("acepta http y https", () => {
    expect(isValidUrl("https://ejemplo.com")).toBe(true);
    expect(isValidUrl("http://ejemplo.com/ruta?x=1#y")).toBe(true);
  });

  it("rechaza esquemas que ejecutan o leen ficheros", () => {
    // Un QR que abre `javascript:` es una trampa impresa en papel.
    for (const u of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "vbscript:msgbox(1)",
    ]) {
      expect(isValidUrl(u), `debería rechazar: ${u}`).toBe(false);
    }
  });

  it("rechaza lo que no es una URL", () => {
    for (const u of ["", "   ", "no-es-una-url", "//sin-esquema.com"]) {
      expect(isValidUrl(u), `debería rechazar: ${u}`).toBe(false);
    }
  });
});

describe("sanitizeSlug", () => {
  it("deja pasar los que ya son válidos", () => {
    expect(sanitizeSlug("abc2345")).toBe("abc2345");
  });

  it("no deja escapar caracteres de ruta", () => {
    // El slug acaba en `/r/<slug>` y se busca en base de datos, pero si algún
    // día se usara para construir una ruta, esto es lo que lo impide.
    for (const s of ["../etc", "a/b", "a\\b", "a b", "MAYÚSCULAS"]) {
      const limpio = sanitizeSlug(s);
      expect(limpio, `entrada: ${s}`).not.toMatch(/[/\\.\s]/);
    }
  });
});

describe("payloads estáticos", () => {
  it("escapa los caracteres especiales del formato WiFi", () => {
    // En el formato WIFI: los caracteres ; , : \ y " son separadores. Sin
    // escapar, una contraseña que los contenga rompe el QR o cambia su
    // significado — y el usuario solo ve que "no funciona".
    const p = buildWifiPayload({ ssid: "Mi;Red", password: 'clave:con"cosas', encryption: "WPA" });
    expect(p).toContain("\\;");
    expect(p).toContain('\\"');
  });

  it("construye un mailto reconocible", () => {
    const p = buildEmailPayload({ to: "a@b.com", subject: "Hola", body: "Texto" });
    expect(p.startsWith("mailto:a@b.com")).toBe(true);
  });
});
