# Plan histórico de implementación: QR-Forge con React + Go

> Actualización 2026-09-08: limpieza del backend legado autorizada e implementada
> en el árbol de trabajo. Estado y siguientes pasos: [docs/MIGRATION.md](docs/MIGRATION.md).
> Lo que sigue conserva el informe de la migración; sus referencias al legado
> describen el estado anterior, no los comandos actuales.

Estado al **2026-09-07**: QF-1 a QF-4 implementados y fusionados; QF-5
publicado y desplegado. Producción corre `0.6.0@sha256:d0a6a5b9…` con el
backend en Go. El legado de Node se conserva —`Dockerfile.node` y las suites
contra él— hasta que la observación de 24 h cierre bien.

## Documento principal

El plan completo, contratos, fases y criterios de cierre están en infraestructura:

- Workspace compartido:
  `/home/ulzuhan/kaicorplabs/docs/38-plan-qrforge-react-go.md`.
- Enlace del repositorio (disponible después de publicar estos cambios):
  [docs/38-plan-qrforge-react-go.md](https://github.com/Ulzuhan/kaicorplabs-infra/blob/main/docs/38-plan-qrforge-react-go.md).

Leer ese documento y `AGENTS.md` antes de implementar. No usar `docs/` sin
seguimiento como área temporal ni añadirlo en bloque; contiene trabajo previo.

## Encargo resumido

1. QF-1: contratos existentes y lanzadores independientes de Node; estructura Go.
2. QF-2: SQLite, sesiones revocables, OIDC, API, redirects, estadísticas y retención.
3. QF-3: React/Vite completo, QR/PNG/SVG en navegador, assets embebidos e imagen Go.
4. QF-4: pruebas funcionales acotadas, imagen final, Node → Go → Node y documentación;
   entregar «listo para desplegar» con evidencia.
5. QF-5: publicación/despliegue sólo tras nueva autorización; retirada del legado
   después de aceptación. Conservar historial y artefactos de retorno.

React + Go es el estándar, **no Go en el navegador**. Toda la funcionalidad actual
entra en el port. `qrcode` puede permanecer en React; SQLite conserva esquema,
IDs, slugs y datos. Sesiones en SQLite, no copiar cookies HMAC de SecretDrop.
No cambiar las URLs impresas, añadir otra base, suprimir funcionalidades o
rediseñar la interfaz. Las diferencias reales se documentan, no se ocultan.

Sin campañas de carga ni puerta de ahorro porcentual. Bastan contratos/API,
corrección de concurrencia acotada, navegador contra imagen y compatibilidad de
datos. Las estadísticas de 30 días y los tres casos de back-channel detectados
se resuelven con regresiones, sin una fase de auditoría ilimitada.

Node/npm permanecen sólo donde hacen falta para build/tests. El entregable final
no necesita Node para arrancar, inicializar SQLite, servir páginas ni limpiar
datos. El código legado puede convivir temporalmente en rama para validar el
retorno; no queda un segundo servicio productivo.

## Estado que debe ir actualizando el implementador

- [x] QF-1 contratos/estructura — `CONTRATOS.md`, lanzadores
      `QRFORGE_TEST_LAUNCH`/`QRFORGE_TEST_BUILD_STAMP`, estructura Go/React.
- [x] QF-2 backend Go completo — almacén SQLite compatible, identidad, API,
      redirect, estadísticas y retención. Suites `codigos` (58) e `intencion`
      (12) y back-channel, contra Node y contra Go con el mismo fichero.
- [x] QF-3 React e imagen final — interfaz portada y embebida, fuentes locales,
      `Dockerfile.go-candidate` de 29,7 MB probada con las restricciones
      productivas. Recorrido en navegador: 28 comprobaciones contra el binario y
      contra la imagen.
- [x] QF-4 validación y candidata lista — compatibilidad Node 0.5.0 → Go → Node
      sobre la misma base (20 comprobaciones), integridad y claves foráneas,
      documentación actualizada y CI con las dos implementaciones.
- [x] Autorización de publicación/despliegue recibida — 07-09-2026.
- [~] QF-5 — publicado y desplegado el 07-09. Digest
      `0.6.0@sha256:d0a6a5b9…`, procedencia SLSA atada al build del tag, SBOM
      SPDX y Trivy sin altas ni críticas con arreglo. Smoke PÚBLICO completo.
      **El smoke autenticado queda pendiente**: necesita una cuenta autorizada
      y no se sustituye por un login sintético. Observación de 24 h en curso.
- [ ] Legado retirado en PR posterior, historial y rollback conservados.

No marcar una fase completada sólo por tener código: adjuntar commit y pruebas.
No publicar imágenes al fusionar sin advertir antes del disparador automático
de `main`; no cambiar otros servicios ni el proveedor de identidad.
