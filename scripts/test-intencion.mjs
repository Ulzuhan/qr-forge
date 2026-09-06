/**
 * La intención que llega por la URL.
 *
 * Otra herramienta manda aquí a alguien con el formulario ya pensado:
 * `/new?url=…&title=…&from=linkup`. Son parámetros que escribe quien quiera, así
 * que lo que esta suite comprueba no es que la precarga funcione —eso lo cubre
 * el test unitario de parseIntent— sino las dos cosas que solo se ven sirviendo
 * la página de verdad:
 *
 *   1. que una URL con esquema peligroso no acabe pintada en un `value=`;
 *   2. que la intención SOBREVIVA al viaje por el proveedor de identidad, que
 *      es donde se perdía si el `next` decía "/new" a secas.
 */
import { check, resumen, sesion } from "./comun.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:3996";
const a = sesion("usuario-intencion");

const pagina = async (query, cookie) => {
  const r = await fetch(`${BASE}/new${query}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: r.status, location: r.headers.get("location") || "", html: await r.text() };
};

// Qué se comprueba y qué no.
//
// Estas aserciones son del SERVIDOR: que acepte una intención válida y la
// entregue a la página, y que una inválida no llegue a ninguna parte. Cómo
// acaba pintada en los campos es cosa del navegador, y ahí se comprueba de
// verdad —abriendo la página— en `test-navegador.mjs`, que es más fuerte que
// buscar una subcadena en el HTML.
//
// Las dos implementaciones la entregan en sitios distintos: Next renderiza el
// formulario en el servidor y deja `value="…"`; Go compone el marco y deja la
// intención ya validada en el nodo raíz. Lo que se afirma —llegó, o no llegó—
// es lo mismo.
const entregada = (html, valor) =>
  html.includes(`value="${valor}"`) || html.includes(`="${valor}"`);

console.log("Con sesión, el formulario llega relleno");
const conIntencion = await pagina("?url=https%3A%2F%2Flink.example%2Fabc&title=Hola&from=linkup", a);
check("la página se sirve", conIntencion.status, 200);
check("la URL llega a la página", entregada(conIntencion.html, "https://link.example/abc"), true);
check("y el título también", entregada(conIntencion.html, "Hola"), true);
// La pestaña activa se marca con aria-selected, que es lo que lee un lector de
// pantalla y por tanto lo que de verdad dice cuál está activa.
// Que abra en estático y explique por qué son cosas de la PANTALLA, y las dos
// implementaciones las producen en momentos distintos: Next las renderiza en el
// servidor, Go las pinta en el navegador con la intención que le baja. Buscar
// una subcadena aquí sólo comprobaría cuál de las dos es. Se comprueban
// abriendo la página, en `test-navegador.mjs`.

console.log("\nSin intención, el formulario de siempre");
const vacio = await pagina("", a);
check("se sirve igual", vacio.status, 200);
check("sin intención entregada", /link\.example/.test(vacio.html), false);

console.log("\nLo que llega por la URL no se cree");
// Lo que se comprueba es que no llegue a un ATRIBUTO. La cadena cruda sí
// aparece en la carga RSC que Next serializa —son los searchParams del
// componente de servidor, escapados dentro de JSON—; eso no se ejecuta y es la
// propia entrada de quien la escribió, devuelta a sí mismo. Lo que sería un
// agujero es un value=, un href= o un src= con ese contenido.
const atributoPeligroso = (html, esquema) =>
  new RegExp(`(value|href|src|action|formaction)="\\s*${esquema}`, "i").test(html);

const malo = await pagina("?url=javascript%3Aalert(1)&title=x", a);
check("la página se sirve igual", malo.status, 200);
check("el esquema peligroso no llega a ningún atributo", atributoPeligroso(malo.html, "javascript:"), false);
// No se afirma que la cadena no aparezca en ninguna parte: en Next sí aparece,
// escapada dentro de la carga RSC —son los searchParams del componente de
// servidor, devueltos a quien los escribió—. Lo que sería un agujero, y es lo
// que se comprueba arriba, es que llegue a un atributo.

const dato = await pagina("?url=data%3Atext%2Fhtml%2C%3Cscript%3E", a);
check("ni un data: URI", atributoPeligroso(dato.html, "data:"), false);

console.log("\nLa intención sobrevive al login");
const sinSesion = await pagina("?url=https%3A%2F%2Flink.example%2Fabc&title=Hola&from=linkup");
check("sin sesión redirige", [302, 303, 307].includes(sinSesion.status), true);
check("al login", sinSesion.location.startsWith("/api/auth/login"), true);
// Lo que se perdía antes: el `next` decía "/new" y la vuelta era un formulario
// vacío habiendo traído la intención puesta.
const next = decodeURIComponent(new URL(sinSesion.location, BASE).searchParams.get("next") || "");
check("conservando la URL", next.includes("url=https://link.example/abc"), true);
check("y el origen", next.includes("from=linkup"), true);

resumen();
