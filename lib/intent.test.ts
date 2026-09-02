import { describe, expect, it } from "vitest";
import { parseIntent } from "./intent";

describe("parseIntent", () => {
  it("acepta una URL http(s) y la deja intacta", () => {
    const intencion = parseIntent({ url: "https://link.example/abc" });
    expect(intencion?.url).toBe("https://link.example/abc");
    expect(intencion?.title).toBe("");
    expect(intencion?.from).toBeNull();
  });

  it("rechaza esquemas que no son http o https", () => {
    // El caso que importa: un javascript: precargado en un campo que después
    // se pinta en HTML.
    for (const url of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "ftp://x/y"]) {
      expect(parseIntent({ url })).toBeNull();
    }
  });

  it("sin url no hay intención, por mucho que vengan los demás", () => {
    expect(parseIntent({ title: "Hola", from: "linkup" })).toBeNull();
    expect(parseIntent({})).toBeNull();
  });

  it("recorta el título al tope de la API en vez de fallar al guardar", () => {
    const largo = "a".repeat(250);
    expect(parseIntent({ url: "https://x.example/", title: largo })?.title).toHaveLength(100);
  });

  it("solo reconoce los orígenes que sabe explicar", () => {
    expect(parseIntent({ url: "https://x.example/", from: "linkup" })?.from).toBe("linkup");
    expect(parseIntent({ url: "https://x.example/", from: "otro" })?.from).toBeNull();
  });

  it("una URL desmesurada se ignora", () => {
    expect(parseIntent({ url: "https://x.example/" + "a".repeat(2100) })).toBeNull();
  });

  it("toma el primer valor cuando el parámetro viene repetido", () => {
    const intencion = parseIntent({ url: ["https://uno.example/", "https://dos.example/"] });
    expect(intencion?.url).toBe("https://uno.example/");
  });
});
