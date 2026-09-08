# Contratos de QR-Forge

La implementación activa es React + Go. Estos contratos protegen las URL
impresas, la autorización y los datos persistentes; cualquier cambio observable
requiere documentación y una regresión.

## Ejecutar las suites

```bash
npm run build
npm run test:http
npm run test:backchannel
npm run test:navegador
npm run test:compatibilidad
```

Go es el destino por omisión. Los overrides `QRFORGE_TEST_LAUNCH` y
`QRFORGE_TEST_BUILD_STAMP` permiten probar un artefacto concreto, manteniendo
la comprobación de antigüedad. La compatibilidad usa la imagen histórica 0.5.0
por digest, no una segunda implementación en el código fuente.

## Lo que está congelado

**La URL impresa.** `QRFORGE_PUBLIC_URL` es el origen que va dentro del código,
y tiene que ser explícito: no se deriva de `Host`, de Docker ni de una VPN.
Un QR con una dirección que sólo funciona desde dentro no se puede corregir
después, porque está en papel. Sin la variable, el binario **no arranca**.

**El identificador es el slug.** `qr_codes.id` es a la vez la clave primaria y
lo que aparece en `/r/<slug>`. No se regenera al editar ni al migrar. Los
personalizados se normalizan como hoy (`[a-z0-9-]{1,40}`, minúsculas,
separadores colapsados, recorte a 40) y una colisión da **409**. Los aleatorios
son de 7 caracteres del alfabeto sin ambigüedades, con aleatoriedad
criptográfica: con un generador predecible, quien cree unos cuantos códigos
propios puede adivinar los que generen otros y contaminarles las analíticas.

**Lo que lee un rastreador.** `robots.txt` excluye `/r/`, `/api/` y `/new`, en
ese orden y byte a byte igual que 0.5.0. `/r/` es la que más importa: son las
redirecciones impresas, y cada una indexada es un escaneo atribuido a un
rastreador en vez de a una persona.

**El redirect es lo primero.** `/r/<slug>` responde 302 con `no-store`;
desconocido 404, estático 400, desactivado o caducado 410. El límite de 30
escaneos por minuto y slug+IP **limita el REGISTRO, nunca la redirección**: un
cartel en un evento, una oficina entera tras el mismo NAT, y el código «no va» —
y quien lo imprimió no puede arreglarlo. Y sin `no-store`, un 302 cacheado deja
el código clavado en el destino viejo, que es justo lo que un QR dinámico existe
para evitar, y encima deja de contar.

**La analítica es best-effort y acotada.** No se guardan IP ni Referer. El país
son dos mayúsculas o nada; el agente se recorta a 256. Que la escritura falle
**no puede romper un destino válido**: el registro pasa por una cola pequeña, y
si se llena se pierde el escaneo, no el salto. No hay una goroutine por petición.

**Los datos.** `/data/qrforge.db`, cuatro tablas, mismas columnas e índices, y
las fechas en **segundos Unix** en disco —lo que dejó escrito Drizzle y lo que da
por hecho `strftime(…, 'unixepoch')`—, ISO en JSON y milisegundos en la entrada.
Una base que ya existe **no se reinicializa jamás**: se valida y, si le falta algo
que se usa, se rechaza nombrando la tabla y la columna y nada de su contenido.
WAL, `foreign_keys=ON`, `busy_timeout=5000` y `synchronous=NORMAL` van en el DSN
para valer en cada conexión, y se comprueban después: `foreign_keys` apagado no
falla, simplemente deja de borrar en cascada.

**La identidad, que NO es la de SecretDrop.** La cookie `qrforge_session` lleva
un token aleatorio de 32 bytes en hex y la base guarda su **SHA-256**, nunca el
token. `users.id` es la identidad interna y `users.oidc_sub` la relación estable
con el proveedor: cambiar de correo no convierte a alguien en otra persona.
Revocar es **borrar filas**, no anotar una marca en un fichero. TTL de 12 h,
configurable entre 1 y 24. Cookies `Secure` por defecto y apagables a mano con
`QRFORGE_INSECURE_COOKIES=1`, **nunca condicionadas a que exista `NODE_ENV`**.
La cookie de estado OIDC va URL-encoded: su valor es JSON y `{`, `"` y `,` no son
bytes válidos de cookie.

**El aislamiento.** Un QR ajeno responde igual que uno inexistente —404, o la
pantalla de no encontrado— en ver, editar, borrar y estadísticas.

**El apagado es ordenado y cabe en el plazo del contenedor.** Al recibir la
señal: se cierra el HTTP y se **espera** a que termine —y si el plazo se agota
con conexiones abiertas, se cierran a la fuerza antes de seguir, porque una
respuesta truncada es mala y una consulta contra una base cerrada es peor—, se
paran los trabajos de fondo, se drena la cola de escaneos y sólo entonces se
cierra SQLite.

El presupuesto se reparte en cuatro y **todo lleva plazo**: 5 s de cierre HTTP,
1 s de espera a los manejadores si hubo que forzar, 1 s de espera a los trabajos
de fondo y 1 s de drenaje — ocho en el peor caso, dentro de los 10 s de
`stop_grace_period` que declara el compose. Con los 15 + 5 anteriores el
contenedor mataba el proceso a mitad del drenaje, que es justo lo que el drenaje
evita.

Tres detalles que no son de estilo:

- **`Close` no espera a los manejadores.** Cierra las conexiones y vuelve con el
  manejador todavía dentro, todavía consultando SQLite. Después de forzar se
  cuenta y se espera a los que quedan.
- **La escritura de analítica cuelga del contexto del consumidor**, no de
  `Background`. Con uno desligado, una escritura arrancada justo antes de la
  parada seguía cinco segundos por su cuenta, fuera del presupuesto.
- **La espera de los trabajos de fondo tiene plazo.** Sin él, uno que ignore la
  cancelación deja el apagado esperando hasta el SIGKILL del contenedor.

El plazo del drenaje es **global**, no por escaneo: con uno por escritura, una
cola de doscientos tardaría doscientas veces más que el presupuesto.

Y el resultado se cuenta de verdad: escritos, fallidos y pendientes son tres
números distintos. Un error de escritura descartado con `_ =` hacía que el
registro dijera «3 escaneos escritos» con cero filas en la base.

**El healthcheck es barato.** `/api/health` hace una consulta acotada y nada
más. Las comprobaciones completas —`integrity_check` y `foreign_key_check`—
están en `qrforge verificar`, para la validación de un despliegue y el
mantenimiento: en la sonda se ejecutarían cada treinta segundos recorriendo la
base entera y ocupando la única conexión de la aplicación, y además la ruta es
pública.

**Una base ajena no se adopta.** El arranque distingue tres casos: vacía de
verdad —se crea el esquema—, con las tablas de QR-Forge —se valida—, y con
tablas de otra cosa —se rechaza sin tocarla—.

## Lo que cambia a propósito, y por qué

Tres correcciones. Ninguna es un cambio de forma: las tres son casos en los que
0.5.0 decía una cosa y hacía otra.

**1. Las estadísticas tenían dos verdades.** La API filtraba los últimos 30 días
y la página consultaba el histórico entero; después el gráfico hacía
`slice(-30)`, que son los últimos 30 días **con actividad**, no los últimos 30
días, y los rótulos de los extremos mostraban un rango distinto del dibujado.
El promedio dividía el total histórico entre los días con actividad, que no es
el promedio de nada.

Ahora hay una sola consulta y un contrato explícito: `total` es el histórico
retenido; la serie son los últimos 30 días en UTC; y el periodo viaja en la
respuesta (`dailySince`, `dailyDays`) para que el rótulo y el promedio usen el
mismo que la consulta. El promedio divide los escaneos de la ventana entre los
días de la ventana.

**2. El aviso de cierre de sesión.** `exp` sólo se validaba si venía y era
numérico, así que un token **sin** `exp` pasaba; un aviso con `sid` y sin `sub`
respondía 200 sin hacer nada; y el JTI se marcaba **antes** de borrar las
sesiones. Ahora `exp` es obligatorio y finito, un aviso sólo con `sid` se
**rechaza** —estas sesiones no guardan el `sid` del proveedor, y decirle que sí
es peor que decirle que no, porque deja de reintentar— y el JTI se marca sólo
**después** de que la revocación haya salido bien.

Lo que NO se promete: los JTI viven en memoria, y un reinicio los olvida. Con
las sesiones ya borradas, repetir un aviso no reabre nada; lo que se pierde es
la detección del repetido, no la revocación.

**3. Errores de interfaz.** Copiar al portapapeles se deniega en más sitios de
los que parece, y la miniatura no manejaba el rechazo. Los estados de error se
ven, y hay una alternativa para coger el enlace a mano.

Y una diferencia menor, del port: un cuerpo JSON **válido pero que no es un
objeto** —`null`, `[]`, `"texto"`— se rechaza con 400. La primera versión en Go
lo dejaba pasar y un PATCH respondía 200 sin cambiar nada; Node ya daba 400.

## Cobertura activa

- Suites HTTP de códigos (61) e intención (12), y back-channel con proveedor sintético firmante.
- Go: datos, concurrencia, apagado, validación de destinos/intenciones/slugs, SafeNext y discovery OIDC con caché y errores.
- React: navegación, URL impresa y payloads WiFi/email; navegador contra binario e imagen final.
- Compatibilidad Node 0.5.0 → Go → Node: 25 comprobaciones sobre la misma base sintética.

Las antiguas pruebas unitarias de Node se retiraron con su implementación;
los casos relevantes viven en Go y en las funciones que utiliza React, no en
copias de código muerto. Las pruebas sintéticas no acreditan por sí solas un
smoke autenticado en producción. Véase [DEPLOYMENT.md](DEPLOYMENT.md).
