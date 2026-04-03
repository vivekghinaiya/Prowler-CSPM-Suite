# Azure CloudGuard

Production-oriented monorepo for running **Prowler**-backed Azure cloud security posture management: **FastAPI** API, **Celery** workers, **PostgreSQL**, **Redis**, and a **React** (Vite + Tailwind) UI. Designed local-first via Docker Compose; logical boundaries support splitting services later.

## Features

- **Multi-client management** — organize scans by client or tenant with isolated credentials, scans, and findings per client; cascade deletion keeps things clean
- **Encrypted Azure credential vault** — Azure Service Principal, Managed Identity, and CLI credentials stored with server-side Fernet encryption; API responses expose metadata only; Azure connectivity test via azure-identity
- **Orchestrated scanning** — one-click scan launch from the UI; queued execution via Celery; Docker-outside-of-Docker Prowler runs against Azure; cancellable jobs; captured Prowler logs with live streaming
- **Real-time progress** — WebSocket-driven progress percentage and stage updates pushed to the browser during scan execution
- **Structured findings database** — Prowler JSON-OCSF output parsed and normalized into PostgreSQL; filterable by severity, status, service, and triage state; server-side pagination
- **Scan diffing** — compare any scan against a baseline; automatic new / open / closed classification; persisted diff with category counts on the dashboard
- **Triage workflow** — per-client, per-fingerprint triage (valid / false positive / not applicable) that persists across scans
- **Remediation guidance** — remediation description and reference URL extracted from Prowler output and displayed inline in findings and diff views
- **Dashboard** — per-client summary with severity breakdown, service distribution, and diff counts rendered as color-coded badges
- **Excel export** — one-click download of scan findings as `.xlsx` with triage status included
- **Audit logging** — server-side audit trail for sensitive actions (client, credential, scan, and triage changes)
- **Automated Prowler updates** — scheduled checks for new Prowler releases every 6 hours with optional auto-pull of the latest image
- **Single-command deployment** — full stack (API, worker, scheduler, database, cache, UI) via `docker compose up --build`

## Quick start

```bash
docker compose up --build
```

- API: [http://localhost:8000](http://localhost:8000) — OpenAPI: `/docs`  
  If **port 8000 is already in use**, run `API_PORT=8001 docker compose up --build` and use `http://localhost:8001`.
- UI: [http://localhost:5173](http://localhost:5173)
- Default admin (after seed): `admin@example.com` / `admin123!` (override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)

The worker container needs access to the **Docker socket** to run Prowler in sibling containers (see [docs/SETUP.md](docs/SETUP.md)). On Windows, if the Docker CLI fails from PowerShell, use **WSL** and `docker compose` from your repo path under `/mnt/...` (details in SETUP).

## Azure credentials

Three authentication methods are supported:

| Method | When to use |
|--------|-------------|
| **Service Principal** | CI/CD, production — provide Tenant ID, Client ID (App ID), and Client Secret |
| **Managed Identity** | Azure-hosted workers — no secrets required |
| **Azure CLI** | Local development — requires `az login` on the host |

Optionally specify Subscription IDs to limit the scan scope; leave blank to scan all subscriptions accessible to the credential.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | Index of all reference docs |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram, components, flows |
| [docs/FOLDER_STRUCTURE.md](docs/FOLDER_STRUCTURE.md) | Repository layout |
| [docs/DATABASE.md](docs/DATABASE.md) | PostgreSQL schema and conventions |
| [docs/API.md](docs/API.md) | REST + WebSocket reference and samples |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Environment variables |
| [docs/SECURITY.md](docs/SECURITY.md) | Encryption, RBAC, audit logs, Prowler sandbox |
| [docs/WORKER_AND_PROWLER.md](docs/WORKER_AND_PROWLER.md) | Celery tasks, queues, runner, diff pipeline |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Web app, env, proxy, user flows |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Prowler image updates, production notes |
| [docs/CORE_IMPLEMENTATION.md](docs/CORE_IMPLEMENTATION.md) | Code map: scans, diff, triage |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Spec traceability |
| [Prowler official docs](https://docs.prowler.com/) | Upstream reference for scan CLI, output modes (e.g. JSON-OCSF), and compliance concepts used by our worker and findings UI |

Copy [.env.example](.env.example) to `.env` if you want to override compose defaults.

## License
