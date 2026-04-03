# Requirements traceability (spec → implementation)

Cross-reference from the product specification to docs and code. “Bonus” items are noted where not implemented.

| Requirement | Where documented | Implementation notes |
|-------------|------------------|----------------------|
| FastAPI backend | [ARCHITECTURE.md](ARCHITECTURE.md) | `services/api/app` |
| React + Tailwind UI | [FRONTEND.md](FRONTEND.md) | `web/` |
| PostgreSQL | [DATABASE.md](DATABASE.md), [SETUP.md](SETUP.md) | Alembic `001_initial_schema` |
| Redis + Celery queue | [ARCHITECTURE.md](ARCHITECTURE.md), [WORKER_AND_PROWLER.md](WORKER_AND_PROWLER.md) | `docker-compose.yml`, `celery_app.py` |
| Docker | [SETUP.md](SETUP.md), [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md) | `infra/docker/*`, Compose |
| Microservice-friendly layout | [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md) | Separate API/worker images |
| Client CRUD | [API.md](API.md) | `routers/clients.py` |
| Credential storage + encryption | [SECURITY.md](SECURITY.md), [DATABASE.md](DATABASE.md) | `security/crypto.py`, `routers/credentials.py` |
| Azure credentials (SP / MSI / CLI) | [API.md](API.md) | `schemas/credentials.py`, `azure_creds.py` |
| Async Prowler scans | [WORKER_AND_PROWLER.md](WORKER_AND_PROWLER.md) | Celery chain |
| Scan metadata | [DATABASE.md](DATABASE.md) | `scans` table |
| Prowler in container | [SECURITY.md](SECURITY.md), [WORKER_AND_PROWLER.md](WORKER_AND_PROWLER.md) | `prowler/runner.py` |
| Raw JSON + logs | [DATABASE.md](DATABASE.md), [OPERATIONS.md](OPERATIONS.md) | `findings.raw_json`, `scans.logs`, volume output |
| Progress (WS / poll) | [API.md](API.md), [ARCHITECTURE.md](ARCHITECTURE.md) | Redis pub/sub + WS; UI polls scan |
| Findings normalized | [DATABASE.md](DATABASE.md) | `finding_parser.py` |
| Diff engine | [CORE_IMPLEMENTATION.md](CORE_IMPLEMENTATION.md) | `diff_service.py` |
| Triage persisted by fingerprint | [CORE_IMPLEMENTATION.md](CORE_IMPLEMENTATION.md) | `finding_triage` |
| Rescan + compare | [API.md](API.md) | `previous_scan_id` on create scan |
| Excel export | [API.md](API.md) | `export_xlsx.py`, openpyxl |
| Dashboard stats | [API.md](API.md) | `routers/dashboard.py` |
| Prowler version check (cron) | [WORKER_AND_PROWLER.md](WORKER_AND_PROWLER.md) | Beat + `prowler_version_check` |
| Auto-pull image | [OPERATIONS.md](OPERATIONS.md) | Manual / CI by design locally |
| RBAC admin/user | [SECURITY.md](SECURITY.md) | JWT role; admin routes |
| Audit logs | [SECURITY.md](SECURITY.md) | `audit_logs` |
| Command injection prevention | [SECURITY.md](SECURITY.md) | No shell; validated argv |
| Multi-tenant | — | `tenant_id` column only (future) |
| Automation API keys | — | Not implemented |
| Notifications (Slack/Email) | — | Not implemented |
| Scheduled scans | — | Not implemented |
