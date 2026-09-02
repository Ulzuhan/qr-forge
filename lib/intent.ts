import { isValidUrl } from "./qr";

/**
 * Una intención llega por la URL: otra herramienta manda aquí a alguien con el
 * formulario ya pensado. Hoy solo LinkUp, que ya tiene el enlace corto y solo
 * quiere el código.
 *
 * Se valida ANTES de tocar el formulario, en el servidor, porque lo que llega
 * por query string lo escribe quien quiera. Y lo inválido se ignora en
 * silencio en vez de dar error: quien llega con una URL rota no ha hecho nada
 * malo desde su punto de vista, y un formulario vacío es una respuesta
 * perfectamente útil. Nada se crea hasta que se pulsa guardar.
 */
export type Intent = {
  url: string;
  title: string;
  from: "linkup" | null;
};

/** Tope de la API para el título; recortar aquí evita un 400 al guardar. */
const MAX_TITULO = 100;

/** Más corto que el 2048 de isValidUrl, que es el límite del propio parser. */
const MAX_URL = 2000;

/** Los orígenes que sabemos explicar. Otro valor se trata como si no viniera. */
const ORIGENES = new Set(["linkup"]);

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function parseIntent(
  searchParams: Record<string, string | string[] | undefined>,
): Intent | null {
  const url = primero(searchParams.url);

  // Sin URL no hay intención que precargar: el resto de parámetros sin ella no
  // describen nada.
  if (typeof url !== "string" || url.length > MAX_URL || !isValidUrl(url)) {
    return null;
  }

  const titulo = primero(searchParams.title);
  const origen = primero(searchParams.from);

  return {
    url,
    title: typeof titulo === "string" ? titulo.trim().slice(0, MAX_TITULO) : "",
    from: typeof origen === "string" && ORIGENES.has(origen)
      ? (origen as "linkup")
      : null,
  };
}
