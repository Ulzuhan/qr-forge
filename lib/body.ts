/**
 * El cuerpo de una petición, leído como objeto.
 *
 * Las dos rutas que leen JSON lo hacían con `request.json()` dentro de un `try`
 * cuyo `catch` devolvía 500. Dos cosas mal en una: el código —un cuerpo que no se
 * entiende es culpa de quien lo manda, no del servidor— y el hueco, porque el
 * texto `null` es JSON perfectamente válido, así que `json()` no protesta y quien
 * luego lee `body.title` se lleva un TypeError. Medido: de cinco cuerpos raros,
 * cuatro daban 500.
 *
 * Y se exige `application/json`. Los cinco servicios de este dominio son el MISMO
 * sitio para el navegador, así que la cookie de sesión viaja en una petición
 * lanzada desde una página de cualquiera de ellos; el navegador sólo deja salir
 * una petición a otro sitio sin preguntar antes si el tipo es `text/plain`,
 * `multipart/form-data` o el de un formulario. Con `application/json` está
 * obligado a preguntar, y esa pregunta aquí no se contesta.
 */
export async function jsonBody(request: Request): Promise<any | null> {
  const tipo = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(tipo.trim())) return null;

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed;
}
