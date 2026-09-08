# QR-Forge contributor instructions

QR-Forge has one backend: Go. React + Vite builds the embedded browser assets.
Node is only a frontend/build/test tool; do not add a Node server or Next.js.

- Read README.md and CONTRATOS.md before changing behavior.
- Go owns authentication, authorization, redirects, HTML and SQLite. Never expose server environment variables to the browser; pass explicit public data only.
- Preserve printed slugs and the SQLite format (Unix seconds). Never reset a real database or run two application writers on one store.
- Build assets before the binary: npm run build. Scope Go tools to ./cmd/... ./internal/... so they do not traverse node_modules.
- Check npm run lint, npm run typecheck and npm test. UI changes also require npm run test:navegador against the binary and final image.
- Keep the rollback test against the pinned historical image; it does not require legacy source in this branch.
- Never commit generated assets, binaries, databases, environment files, certificates or test output.
- Publishing is an external action: pushing main publishes an image. Do not push, tag or deploy without explicit authorization.
