# Frontend (web/)

## Stack

- **Vite 6** + **React 18** + **TypeScript**
- **Tailwind CSS** for styling
- **TanStack Query** for server state
- **React Router** for navigation

## Environment

- **`VITE_API_URL`**: Set at build time.
  - **Docker**: `Dockerfile.web` passes `ARG VITE_API_URL` (Compose default `http://localhost:8000`) so the browser calls the API directly; ensure API `CORS_ORIGINS` includes the UI origin.
  - **Local `npm run dev`**: Leave unset or empty to use Vite dev server with `vite.config.ts` proxy: `/api` → backend (with `ws: true` for WebSockets).

## Main routes

| Path | Screen |
|------|--------|
| `/login` | Email/password → JWT in `localStorage` |
| `/` | Client list + create |
| `/clients/:clientId` | Azure credentials (service principal / managed identity / CLI), dashboard poll, scan list, start scan |
| `/scans/:scanId` | Progress (WS + poll), label edit, **findings_count** from scan API, **Re-parse findings** (completed scans), findings table + triage, diff tab, Excel export |

## Findings UI and Prowler concepts

Scan detail loads **findings** from the API (`GET /api/v1/scans/{id}/findings`, etc.). Rows are produced by Prowler **JSON-OCSF** output parsed in the worker/API (see [WORKER_AND_PROWLER.md](WORKER_AND_PROWLER.md)). **[Prowler documentation](https://docs.prowler.com/)** defines the underlying checks, severities, and compliance framing.

| API / UI field (normalized) | Prowler-oriented meaning |
|----------------------------|---------------------------|
| `check_id` | Check identity: OCSF `finding.uid` / title-derived id from the raw record |
| `resource_id` | Primary affected resource (`resources[0]` uid/name/id) |
| `region` | Resource region or partition hint from OCSF |
| `service` | Cloud service / resource group name from OCSF |
| `severity` | Mapped from Prowler/OCSF severity (critical/high/medium/low) |
| `description` | Check title or description from `finding` |
| `compliance_framework` | Snippet from OCSF `compliance` (e.g. requirements text), when present |
| `status` / triage | Platform workflow (new/open/closed), not Prowler-native |
| `raw_json` | Original normalized record for drill-down or future columns |

Progress and logs on the scan page reflect Celery + container stdout; Prowler’s own logging and stages are described in upstream docs.

## API client

- `src/api/client.ts`: `apiFetch`, `getToken` / `setToken`, prepends `VITE_API_URL` when set.

## WebSocket

- URL built in `ScanDetailPage`: if `VITE_API_URL` set, WebSocket host matches that origin; else same host as the Vite dev server (proxied WS to API).

## Production static hosting

- `Dockerfile.web` runs `npm run build` then `serve -s dist`. For nginx or S3+CloudFront, serve `dist/` and configure CORS and `VITE_API_URL` at build time.
