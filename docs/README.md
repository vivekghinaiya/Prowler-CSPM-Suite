# Reference documentation

Use these files as the canonical reference for the Azure CloudGuard implementation.

1. **[ARCHITECTURE.md](ARCHITECTURE.md)** — High-level system design, Mermaid diagram, progress model.
2. **[FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md)** — Monorepo directories and responsibilities.
3. **[DATABASE.md](DATABASE.md)** — Tables, enums, indexes, fingerprint rules.
4. **[API.md](API.md)** — All HTTP routes under `/api/v1`, auth, request/response examples, WebSocket.
5. **[ENVIRONMENT.md](ENVIRONMENT.md)** — Every configuration variable and where it applies.
6. **[SECURITY.md](SECURITY.md)** — Credentials at rest, JWT, roles, audit logging, command injection controls.
7. **[WORKER_AND_PROWLER.md](WORKER_AND_PROWLER.md)** — Celery app, task chain, Redis pub/sub, Prowler CLI invocation.
8. **[FRONTEND.md](FRONTEND.md)** — Vite, Tailwind, API base URL, main screens.
9. **[SETUP.md](SETUP.md)** — Prerequisites, Compose services, seed user, troubleshooting.
10. **[OPERATIONS.md](OPERATIONS.md)** — Version checks, image pulls, cloud migration pointers.
11. **[CORE_IMPLEMENTATION.md](CORE_IMPLEMENTATION.md)** — Code map: scan trigger, diff engine, triage.
12. **[REQUIREMENTS.md](REQUIREMENTS.md)** — Spec → docs/code traceability matrix.

The product **plan** (scope and phased delivery) lives separately from this repo; these docs describe **what is implemented** in code.

## External references

- **[Prowler — official documentation](https://docs.prowler.com/)** — Canonical reference for **how Prowler scans run** (CLI/Docker, Azure provider, flags such as output mode `-M`, output directory, `--sp-env-auth`), **what the exported files look like** (we import **JSON-OCSF** produced under the scan output directory), and **severity/compliance concepts** that inform how findings are labeled in the UI. When upgrading the Prowler image or changing scan behavior, defer to upstream docs and `prowler azure --help` inside `PROWLER_IMAGE`; see [WORKER_AND_PROWLER.md](WORKER_AND_PROWLER.md) for how this repo wires scan → parse → API → UI.
