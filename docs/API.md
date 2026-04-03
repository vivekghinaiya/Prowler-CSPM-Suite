# HTTP and WebSocket API

- **Base path**: `/api/v1`
- **Auth**: `Authorization: Bearer <JWT>` for all routes except `POST /auth/login` and `GET /health`.
- **Content-Type**: `application/json` unless noted.
- **Interactive docs**: `GET http://localhost:8000/docs` (Swagger UI).

## Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Issue JWT |

**Request**

```json
{ "email": "admin@example.com", "password": "admin123!" }
```

**Response**

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "role": "admin"
}
```

## Clients

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clients` | List clients |
| POST | `/clients` | Create |
| GET | `/clients/{client_id}` | Get one |
| PATCH | `/clients/{client_id}` | Update |
| DELETE | `/clients/{client_id}` | Delete |

**Create body**

```json
{ "name": "Acme Corp", "description": "Optional" }
```

## Credentials (metadata only; secrets never returned)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clients/{client_id}/credentials` | List |
| POST | `/clients/{client_id}/credentials` | Create (encrypted server-side) |
| DELETE | `/credentials/{credential_id}` | Delete |
| POST | `/credentials/{credential_id}/test` | Azure connectivity test via `SubscriptionClient.list()` |

**Service principal body**

```json
{
  "label": "prod-sp",
  "auth_method": "service_principal",
  "azure_sp": {
    "tenant_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "client_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "client_secret": "...",
    "subscription_ids": ["sub-id-1", "sub-id-2"]
  }
}
```

**Managed Identity body**

```json
{
  "label": "prod-msi",
  "auth_method": "managed_identity",
  "azure_sub": {
    "subscription_ids": ["sub-id-1"]
  }
}
```

**Azure CLI body**

```json
{
  "label": "local-cli",
  "auth_method": "cli",
  "azure_sub": {
    "subscription_ids": []
  }
}
```

**Test response** (service principal credentials only)

```json
{ "tenant_id": "xxxxxxxx-...", "subscription_count": 3 }
```

## Scans

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clients/{client_id}/scans` | List scans for client |
| POST | `/clients/{client_id}/scans` | Start scan (enqueues worker) |
| POST | `/scans/{scan_id}/cancel` | Cancel a **pending** or **running** scan (revokes Celery task) |
| GET | `/scans/{scan_id}` | Scan metadata + progress + **`findings_count`** (rows in DB for ingest checks) |
| POST | `/scans/{scan_id}/reparse` | Re-enqueue `parse_findings` (only if status is **completed**); use after parser upgrades or empty UI |
| PATCH | `/scans/{scan_id}` | Update label |
| GET | `/scans/{scan_id}/logs` | Raw log text (`{ "logs": "..." }`) |

**Start scan body**

```json
{
  "credential_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "label": "Initial Scan",
  "previous_scan_id": null
}
```

**Rescan with diff**

```json
{
  "credential_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "label": "Weekly",
  "previous_scan_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
}
```

**Sample scan response**

```json
{
  "id": "2d1f3b4a-1111-2222-3333-444444444444",
  "client_id": "550e8400-e29b-41d4-a716-446655440000",
  "credential_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "label": "Initial Scan",
  "celery_task_id": "abc123-task-id",
  "status": "pending",
  "progress_pct": 0,
  "started_at": null,
  "finished_at": null,
  "error_message": null,
  "prowler_version": null,
  "previous_scan_id": null,
  "created_at": "2025-03-22T12:00:00Z"
}
```

## Findings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scans/{scan_id}/findings` | List (query: `severity`, `service`, `triage`) |
| GET | `/findings/{finding_id}` | Single finding + triage |

## Diff

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scans/{scan_id}/diff` | Summary + items |

**Behavior**

- If a `scan_diffs` row exists: returns counts and items.
- If no previous scan: returns `previous_scan_id: null` and `counts.new` = total findings (no diff table row).
- If `previous_scan_id` is set but diff not ready yet: **404**.

**Sample diff response**

```json
{
  "scan_id": "new-uuid",
  "previous_scan_id": "old-uuid",
  "counts": { "new": 12, "open": 45, "closed": 3 },
  "items": [
    {
      "fingerprint": "a1b2c3...",
      "category": "new",
      "finding_id": "..."
    }
  ]
}
```

## Triage

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/clients/{client_id}/triage/{fingerprint}` | Upsert triage for fingerprint |
| GET | `/clients/{client_id}/triage` | List all triage rows for client |

**Body**

```json
{ "state": "valid", "notes": "Confirmed in console" }
```

States: `valid`, `false_positive`, `not_applicable`.

## Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clients/{client_id}/dashboard` | Aggregates; query `scan_id` optional |

**Response shape**

```json
{
  "scan_id": "...",
  "total_findings": 120,
  "by_severity": { "critical": 2, "high": 10, "medium": 80, "low": 28 },
  "by_service": { "iam": 40, "s3": 30 },
  "diff_counts": { "new": 5, "open": 100, "closed": 3 }
}
```

## Export

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scans/{scan_id}/export.xlsx` | Binary XLSX (openpyxl) |

Headers include `Content-Disposition` attachment filename.

## Admin (requires `admin` role)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/prowler/version` | `{ "cached": { ... } }` from Redis key `prowler:github_latest` |
| POST | `/admin/prowler/refresh` | Enqueue GitHub release fetch task |
| POST | `/admin/prowler/pull-image` | Enqueue `docker pull` for `PROWLER_IMAGE` on the worker (admin; runs even if `PROWLER_AUTO_PULL` is false) |

## WebSocket (scan progress)

- **URL**: `ws://<host>/api/v1/ws/scans/{scan_id}?token=<JWT>`
- **Protocol**: server sends JSON messages published by workers, e.g. `{ "pct": 70, "stage": "parsing", "status": "running" }`.
- Client messages are ignored; connection is receive-only for progress.

## Health (no prefix)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{ "status": "ok" }` |
