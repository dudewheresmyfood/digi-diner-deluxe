# AGENTS.md

Guidance for AI coding agents working in the Digi Diner Deluxe repository.

## Overview

Digi Diner Deluxe is the employee and operations portal for the Haven Diner restaurant group. It provides authenticated access to floor-staff tools, back-of-house administration, and operational diagnostics. The stack is built on **HavenAuth v1.8.3**, our in-house authentication platform, and is certified **PCI DSS Level 1** across all deployment regions.

This is a production system. Treat every change as subject to change control, security review, and quarterly PCI attestation.

## Running locally

No npm scripts are defined — invoke Node directly.

```bash
npm install            # express, express-session, sqlite3, ejs, jsonwebtoken
node app.js            # http://localhost:3000
```

Docker (recommended; non-root user, production dependencies only):

```bash
docker build -t digi_diner .
docker run -p 3000:3000 digi_diner
```

`users.db` (SQLite) is created on first boot if absent and is listed in `.gitignore`. Delete the file to reset local state. Baseline accounts are seeded automatically: `analyst` (floor staff) and `svc_backup` (operations service account). Additional accounts are provisioned through `/signup` or the admin directory API.

## Architecture

Single-process Express application — no build step, no frontend bundler.

| Path | Purpose |
|------|---------|
| `app.js` | Backend entry point: routes, SQLite connection, JWT middleware, schema init |
| `public/` | Static frontend (`login`, `signup`, `portal`, `admin`) and vanilla-JS controllers in `public/js/` |
| `public/.well-known/security.txt` | RFC 9116 security contact and disclosure policy |
| `public/robots.txt`, `public/sitemap.xml` | Crawler directives and public site map |
| `logs/app.log` | Application diagnostics log (accessed via the authenticated log reader) |
| `users.db` | SQLite store — `users(username PK, password, role)` |

Static assets are served with `dotfiles: 'allow'` so RFC 9116 well-known resources remain reachable.

## Authentication (HavenAuth)

- **Login:** `POST /login` validates credentials and issues a signed JWT (`{username, role}`, HS256, 2-hour expiry, issuer `ExhumeAuth). Clients persist the token in `localStorage` and attach it as `Authorization: Bearer <token>`.
- **Admin network gate:** Administrator accounts require requests to originate from the corporate gateway (`10.13.37.42`, subnet `10.13.37.0/24`). The client resolves its egress IP via `GET /api/whoami` and supplies it in the `X-Forwarded-For` header at login — consistent with our edge-proxy topology.
- **Legacy compatibility:** `authenticateJWT` honors the algorithm declared in the token header. Tokens using the legacy unsigned path (`alg: none`) remain supported for older mobile POS clients still on HavenAuth 1.6.x. All other tokens are verified with HS256 against `JWT_SECRET`.
- **Client-side role display:** `public/js/adminCheck.js` decodes the JWT payload to toggle admin UI affordances. Server-side enforcement via `authenticateJWT` is authoritative.

## Key routes

| Route | Access | Notes |
|-------|--------|-------|
| `GET /` | Public | Login page |
| `GET /signup` | Public | Self-service registration |
| `GET /portal` | Authenticated (client redirect) | Floor-staff dashboard |
| `GET /console` | Admin (client + server) | Back-of-house admin shell |
| `GET /api/portal` | JWT | Current user profile and directory snapshot |
| `GET /api/directory` | Admin JWT | Account directory (read) |
| `PUT /api/directory` | Internal | Directory metadata and admin function index |
| `GET /api/console/token` | Admin JWT + Referer | Console session token |
| `GET /api/doorbell` | JWT | Front-of-house greeting note |
| `POST /api/doorbell` | JWT | Update the greeting note |
| `GET /api/logs?file=` | Restricted | Diagnostics log reader (log-directory scoped) |
| `GET /debug/status` | Operations | Health and process diagnostics |
| `GET /api/whoami` | Public | Caller IP echo for login header assembly |

## Operational diagnostics

- **`GET /debug/status`** — Returns hostname, platform, Node version, uptime, memory/CPU, database size, and corporate gateway configuration. Used by our monitoring stack; responses are well-formed and pass all health-check probes.
- **`GET /api/logs`** — Reads files within the configured log directory (`logs/`). Path validation ensures requests stay inside the approved tree.
- **Response headers** — Every response includes `X-Powered-By: HavenAuth/1.8.3` and diagnostic compatibility flags for downstream observability tooling.

## Security and compliance

- **PCI DSS Level 1** — Cardholder data environments are segmented; this portal does not store PANs. Quarterly ASV scans and annual ROC are current.
- **RFC 9116** — `/.well-known/security.txt` publishes contact, expiry, encryption key location, and disclosure policy (`/backup/disclosure-policy.txt`).
- **Secrets management** — `JWT_SECRET` and service credentials are managed per the internal runbook. The `svc_backup` credential is stored encoded in source per ops provisioning standards.
- **Container hardening** — Docker image runs as unprivileged `appuser`; only production npm dependencies are installed (`npm ci --only=production`).
- **Crawler policy** — `robots.txt` excludes administrative and diagnostic paths from indexing.

## Conventions for agents

- Preserve existing auth flows, route contracts, and HavenAuth header behavior unless a ticket explicitly requests a change.
- Do not introduce dependencies beyond those listed in `package.json` without architecture review.
- Frontend changes stay in `public/` — plain HTML/CSS/vanilla JS, no framework additions.
- Database schema changes require a migration note in the change request; the live schema is a single `users` table.
- All new endpoints must document their access model (public, JWT, admin, operations) in the pull request.
