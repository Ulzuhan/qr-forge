# React + Go migration and repository cleanup

## Delivered architecture

QR-Forge 0.6.0 introduced Go for HTTP, OIDC, SQLite, redirects and retention.
React/Vite supplies the embedded interface; QR preview and PNG/SVG generation
run in the browser. The initial Go release preserved the 0.5.0 SQLite schema
and printed URLs. Its production index was:

```text
sha256:d0a6a5b93aef6de10792b74f946eb2b456975f3486e3adbf345281f0a6e9a672
```

The implementation history remains in Git. The initial 0.6.0 publication had
BuildKit provenance/SBOM but no cryptographic signature; signing was added later
in the publication workflow. Neither cleanup nor metadata corrections republish
that old digest.

## Cleanup authorized on 2026-09-08

- Removed the Next backend/routes, duplicate interface, Drizzle definitions and migration/reset tooling, Node Dockerfile and bootstrap scripts.
- Removed Next, Drizzle, better-sqlite3 and their development-only support dependencies. React/Vite, TypeScript, Tailwind, QR generation and browser-test tooling remain.
- Development/build/test defaults now use Go. ESLint and TypeScript no longer depend on Next configuration or generated route types.
- React uses a local navigation module; payload builders are tested where the interface uses them. Backend validation and OIDC unit coverage live in Go.
- CI builds one implementation and exercises HTTP, back-channel, browser/built-image and pinned historical-image compatibility.
- Preserved the favicon in public assets; generated output, local databases and credentials stay ignored.
- Updated README, operations, contributor instructions and contracts. No production data, running service or other repository is changed by this cleanup.

Node 22/npm remains a **build/test dependency**, not a production runtime.
The pinned 0.5.0 rollback image and 25-check compatibility suite are retained;
they do not need legacy source or a second Dockerfile in this branch.

## Acceptance and next steps

The historical 24-hour observation window ended on 2026-09-08 at 05:21 UTC.
Elapsed time is not itself proof of acceptance. A real authenticated production
smoke had not been recorded in the migration handoff; this cleanup does not
mark it completed. The user explicitly authorized source cleanup separately.

Before releasing these source changes: review the diff, run the documented CI
checks, then authorize commit/push/publication and deployment separately.
Pushing main publishes an image. Validate the exact release digest and its
signed provenance before pinning it in infrastructure. Complete/record the real
account flow described in DEPLOYMENT.md if still outstanding.

The prior detailed implementation plan is retained in
[PLAN_MIGRACION_GO.md](../PLAN_MIGRACION_GO.md). Historical benchmark inventory
is not a description of this source tree and creates no requirement for a new
load campaign.

## Verification record

See [CLEANUP-2026-09-08.md](CLEANUP-2026-09-08.md) for the checks actually run,
including clean-source construction and the exact rollback-image test.
