# Security policy

QR-Forge prints a code once and changes where it points afterwards. That is the
feature and it is also the risk: whoever controls the account controls where an
already-printed code sends people. Everything here follows from that.

## Reporting a vulnerability

Open a [private security advisory](https://github.com/Ulzuhan/qr-forge/security/advisories/new)
on this repository. That channel stays private until we publish it together.

Please do not open a public issue for anything exploitable.

**What to expect:** an acknowledgement within 72 hours, an assessment within
7 days, and a fix or a written explanation of why there is not going to be one.
You will be credited in the advisory unless you would rather not be. There is no
bounty.

## What it is, in security terms

- **A dynamic code is a redirect.** `/r/<slug>` is public on purpose: a printed
  code has to work without a session. The destination is whatever its owner set.
- **Accounts live in the OIDC provider**, not in a local password database.
  Without OIDC configuration nobody signs in and nobody creates codes.
- **The database stores a SHA-256 of the session token, never the token.** A
  leaked copy of the database cannot be replayed as a login, and sessions can be
  revoked.
- **Each account sees only its own codes.** Asking for somebody else's returns
  404 rather than confirming that it exists.
- **Scan records have a retention**, set by `QRFORGE_SCAN_RETENTION_DAYS`, and
  creation is bounded per hour and per account.
- **One writer per database.** SQLite with WAL and foreign keys; two application
  writers over the same file is not a supported configuration.

## In scope

- Repointing, editing or deleting a code that belongs to someone else — the most
  serious thing that can happen here.
- Reading another account's codes, slugs or scan records.
- Session replay from a database copy, session forgery, or a revoked session
  that still opens.
- Bypassing the per-hour creation limit or the per-account cap.
- Anything that turns `/r/<slug>` into a redirect its owner did not configure.
- Injection through a slug, a label or a destination that reaches the panel's
  HTML, the database or an export.

## Out of scope

- Scanner output with no working exploit, or missing headers with no shown impact.
- "Open redirect" as a category: sending visitors to a destination its owner
  chose is the product. A redirect *nobody* chose is in scope.
- Volumetric denial of service. A way *around* a documented limit is in scope;
  sending more traffic than a host can take is not.
- Misconfiguration of your own deployment, unless an unsafe default here causes it.

## What it does not claim

Scan counts are an operational figure, not analytics: they are kept for a bounded
number of days and nothing about them is guaranteed to be complete. And a printed
code cannot be recalled — if an account is taken over, the codes already in the
world point wherever the attacker says until the account is recovered. That is a
property of dynamic QR codes everywhere, and it is why the account matters more
than the code.

## Supply chain

Dependencies are pinned by `go.mod`, `go.sum` and `package-lock.json`; Renovate
opens grouped updates weekly and security updates immediately. Every GitHub
Action is pinned by commit SHA. The image is built with signed provenance —
attested to this repository, workflow and commit, and verified in the same run —
carries an SBOM, and every published digest is scanned with Trivy for fixable
critical and high CVEs. A red run is not deployed.
