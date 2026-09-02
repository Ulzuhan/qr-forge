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

console.log("Con sesión, el formulario llega relleno");
const conIntencion = await pagina("?url=https%3A%2F%2Flink.example%2Fabc&title=Hola&from=linkup", a);
check("la página se sirve", conIntencion.status, 200);
check("la URL está en un campo", conIntencion.html.includes('value="https://link.example/abc"'), true);
check("y el título también", conIntencion.html.includes('value="Hola"'), true);
// La pestaña activa se marca con aria-selected, que es lo que lee un lector de
// pantalla y por tanto lo que de verdad dice cuál está activa.
check("abre en estático", /aria-selected="true"[^>]*>\s*Static/s.test(conIntencion.html)
  || conIntencion.html.includes('Static</button>'), true);
check("y explica por qué, viniendo de LinkUp", conIntencion.html.includes("already dynamic in LinkUp"), true);

console.log("\nSin intención, el formulario de siempre");
const vacio = await pagina("", a);
check("se sirve igual", vacio.status, 200);
check("sin la nota de LinkUp", vacio.html.includes("already dynamic in LinkUp"), false);
check("y con el subtítulo de siempre", vacio.html.includes("You can change where it points later"), true);

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
check("y el campo sale con el valor por defecto", malo.html.includes('value="https://"'), true);

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
