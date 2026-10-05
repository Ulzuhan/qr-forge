# QR Forge: vía de actualización sin migraciones

La publicación de una etiqueta estable llama a CI en su commit exacto. CI
construye un único índice OCI amd64 con SBOM/procedencia, verifica cada blob,
carga su config ID y prueba HTTP, OIDC backchannel, navegador, retorno al Go
0.7.0 firmado y la regresión histórica Node 0.5.0. Trivy mantiene HIGH/CRITICAL
con arreglo disponible y corre antes de cualquier escritura en GHCR.

El publicador recibe ese mismo artefacto, lo copia sin reconstruir a una etiqueta
candidate única, firma y verifica digest/source/tag/workflow/run, y sólo entonces
promueve esos bytes a las etiquetas de release. Una versión ya existente con
otro digest se rechaza. PR, main y dispatch sólo verifican; no publican.

`rollback.json` identifica la imagen de referencia por digest, commit firmado,
run/intento verde y contrato `qrforge-sqlite-v1`. `persistence-policy.json`
congela los archivos de almacenamiento y arranque de ese commit. Una edición,
eliminación o nuevo archivo de persistencia bloquea CI para revisión manual de
migración, copia y retorno; no basta con conservar una etiqueta de contrato.
También requiere revisión cualquier dato persistente fuera de SQLite.

La base contiene usuarios, sesiones, códigos y escaneos; slugs e identidades se
conservan y las fechas siguen en segundos Unix. No hay archivos de usuario
asociados: PNG/SVG se generan en el navegador y assets/logos se embeben. WAL/SHM
son compañeros de SQLite. Una copia usa la API de backup, nunca sólo copiar el
`.db` mientras WAL está activo. Se comprueban integridad y claves foráneas.

`scripts/test-rollback-imagen.sh` alterna un único escritor sobre datos sintéticos:
imagen firmada → config ID del OCI → la misma imagen firmada. Conserva escrituras
del candidato, destinos de QR impresos, propietarios, payloads y revocaciones.
La restauración se ensaya **aparte**, en un destino nuevo y sin aplicación. La
prueba demuestra que una copia antigua pierde QRs/escrituras posteriores y
reactiva una sesión revocada después de la copia. Por eso el rollback de imagen
siempre usa la base actual: nunca restaura datos automáticamente.

Si un candidato altera datos que la imagen anterior no puede leer, falla el
retorno y queda bloqueado para intervención manual. Una restauración requiere
elegir explícitamente el punto temporal, reconciliar escrituras y revocaciones,
parar el escritor y revisar todos los archivos asociados. No se autoriza por un
healthcheck fallido. Estas pruebas no leen ni acreditan datos productivos.

Este borrador no cambia versión ni publica una release, y no activa el miniPC.
La integración futura requiere aprobar ambos PRs, la publicación de una versión
nueva y la instalación supervisada de la política de infraestructura.
