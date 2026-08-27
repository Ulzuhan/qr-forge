/**
 * Los códigos, y quién puede tocarlos.
 *
 * Un QR dinámico es un papel impreso que apunta a una URL que se puede cambiar
 * después. Eso es justo lo que lo hace útil y lo que lo hace delicado: quien
 * consiga editar el destino de un código ajeno redirige a donde quiera a todo el
 * que escanee un cartel que ya está pegado en la pared, y quien lo imprimió no
 * puede arreglarlo.
 *
 * Por eso el aislamiento entre cuentas es lo primero de esta suite.
 */
import { api, check, consulta, crear, nota, resumen, sesion, BASE } from "./comun.mjs";

const a = sesion("usuario-a");
const b = sesion("usuario-b");

console.log("La puerta, por sus dos caras");
// Primero la que TIENE que abrirse: comprobar sólo los 401 no vale nada si la
// aplicación está devolviendo 401 a todo el mundo.
check("una sesión legítima lista", (await api("/api/qr", { cookie: a })).status, 200);
check("sin sesión, no", (await api("/api/qr")).status, 401);
check("ni se crea nada", (await crear(null)).status, 401);

console.log("\nUn código de A, visto desde B");
const creado = await crear(a, { title: "de A", destinationUrl: "https://ejemplo.example/de-a" });
check("A lo crea", creado.status, 201);
const id = creado.body.id;
check("y sale un identificador corto", typeof id === "string" && id.length > 0, true);

// 404 y no 403: ante quien va probando, no hay por qué confirmar que el código
// existe. Es la misma decisión que en los otros servicios de la casa.
check("B no lo lee", (await api(`/api/qr/${id}`, { cookie: b })).status, 404);
check("B no lo edita", (await api(`/api/qr/${id}`, { cookie: b, metodo: "PATCH", cuerpo: { destinationUrl: "https://malo.example" } })).status, 404);
check("B no ve sus estadísticas", (await api(`/api/qr/${id}/stats`, { cookie: b })).status, 404);
check("B no lo borra", (await api(`/api/qr/${id}`, { cookie: b, metodo: "DELETE" })).status, 404);
check("y sin sesión tampoco", (await api(`/api/qr/${id}`)).status, 401);

// Lo que importa de verdad: que después de todo eso siga apuntando a donde A dijo.
const despues = await api(`/api/qr/${id}`, { cookie: a });
check("el destino sigue siendo el de A", despues.body.qr.destinationUrl, "https://ejemplo.example/de-a");
check("y A sí puede cambiarlo", (await api(`/api/qr/${id}`, { cookie: a, metodo: "PATCH", cuerpo: { destinationUrl: "https://ejemplo.example/nuevo" } })).status, 200);
check("y el cambio se guarda", (await api(`/api/qr/${id}`, { cookie: a })).body.qr.destinationUrl, "https://ejemplo.example/nuevo");

console.log("\nLa redirección, que es pública");
const salto = await api(`/r/${id}`);
check("redirige", salto.status, 302);
check("a donde toca", salto.location, "https://ejemplo.example/nuevo");
check("un slug inventado da 404", (await api("/r/noexiste")).status, 404);
check("y se registra el escaneo", Number(consulta("select count(*) from qr_scans;")) >= 1, true);

// Desactivar un código tiene que cortar la redirección de verdad: es el botón de
// emergencia de quien ya ha repartido el cartel.
await api(`/api/qr/${id}`, { cookie: a, metodo: "PATCH", cuerpo: { isActive: false } });
check("desactivado deja de redirigir", (await api(`/r/${id}`)).status, 410);
await api(`/api/qr/${id}`, { cookie: a, metodo: "PATCH", cuerpo: { isActive: true } });
check("y se puede volver a activar", (await api(`/r/${id}`)).status, 302);

console.log("\nDestinos que no valen");
// El destino acaba en una cabecera `Location` que sigue el navegador de quien
// escanea. `javascript:` y `data:` ahí son otra cosa distinta a una dirección web.
for (const url of [
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "file:///etc/passwd",
  "ftp://x.example",
  "//malo.example",
  "",
  "no-es-una-url",
]) {
  check(`no acepta ${JSON.stringify(url.slice(0, 30))}`, (await crear(a, { destinationUrl: url })).status, 400);
}
check("pero una dirección normal sí", (await crear(a, { destinationUrl: "https://ejemplo.example/vale" })).status, 201);
// Una dirección de red local se acepta a propósito: la redirección la resuelve el
// navegador de quien escanea, no el servidor, así que no alcanza nada de aquí — y
// un QR para el NAS de casa es un uso legítimo de esta herramienta.
check("y una de la red local también", (await crear(a, { destinationUrl: "http://192.168.1.50" })).status, 201);

console.log("\nCuerpos que no se entienden");
// Cuatro de cinco daban 500. Y exigir `application/json` es lo que corta el CSRF
// entre los servicios de este dominio: son el mismo sitio para el navegador, así
// que la cookie viaja, y sólo `text/plain`, `multipart` y los formularios salen
// sin que el navegador pregunte antes.
for (const [ruta, metodo] of [["/api/qr", "POST"], [`/api/qr/${id}`, "PATCH"]]) {
  for (const [que, cuerpo, tipo] of [
    ["a medias", "{no-es-json", "application/json"],
    ["vacío", "", "application/json"],
    ["el texto null", "null", "application/json"],
    ["una lista", "[1,2]", "application/json"],
    ["texto suelto", "hola", "text/plain"],
    ["un formulario", "title=x", "application/x-www-form-urlencoded"],
  ]) {
    check(`${metodo} con un cuerpo ${que} da 400, no 500`, (await api(ruta, { cookie: a, metodo, cuerpo, tipo })).status, 400);
  }
}
check(
  "y con el juego de caracteres detrás sigue valiendo",
  (await api("/api/qr", {
    cookie: a,
    metodo: "POST",
    tipo: "application/json; charset=utf-8",
    cuerpo: { title: "con charset", type: "dynamic", destinationUrl: "https://ejemplo.example/c" },
  })).status,
  201
);

console.log("\nLos topes");
check("sin título no hay código", (await crear(a, { title: "" })).status, 400);
check("un título kilométrico se rechaza", (await crear(a, { title: "x".repeat(200) })).status, 400);
check("y un tipo inventado también", (await crear(a, { type: "loquesea" })).status, 400);

resumen();
