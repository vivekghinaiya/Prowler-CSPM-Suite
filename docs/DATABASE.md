# Database schema (PostgreSQL)

Migrations live in `services/api/alembic/versions/`. Initial revision: `001_initial_schema.py`.

## Conventions

- Primary keys: **UUID** (`uuid-ossp` extension enabled in migration).
- Timestamps: `created_at` / `updated_at` where applicable (`timezone=True`).
- Optional **`tenant_id`** on `clients` for future multi-tenant filtering (nullable today).

## Tables

### `users`

| Column | Type | Notes |
|--------|------|--------|
| id | UUID | PK |
| email | VARCHAR(320) | unique |
| password_hash | VARCHAR(255) | bcrypt |
| role | ENUM `user_role` | `admin`, `user` |
| created_at | TIMESTAMPTZ | |

### `audit_logs`

| Column | Type | Notes |
|--------|------|--------|
| id | UUID | PK |
| actor_user_id | UUID | FK → users, nullable |
| action | VARCHAR(128) | e.g. `client.create`, `scan.start` |
| resource_type | VARCHAR(64) | |
| resource_id | VARCHAR(64) | |
| metadata | JSONB | column name `metadata` in DB |
| ip | VARCHAR(64) | nullable |
| created_at | TIMESTAMPTZ | |

### `clients`

| Column | Type | Notes |
|--------|------|--------|
| id | UUID | PK |
| name | VARCHAR(255) | |
| description | TEXT | nullable |
| tenant_id | UUID | nullable, indexed |
| created_at, updated_at | TIMESTAMPTZ | |

### `credentials`

| Column | Type | Notes |
|--------|------|--------|
| id | UUID | PK |
| client_id | UUID | FK → clients ON DELETE CASCADE |
| provider | ENUM `credential_provider` | `azure` (always) |
| label | VARCHAR(255) | |
| auth_method | ENUM `credential_auth_method` | `service_principal`, `managed_identity`, `cli` |
| ciphertext | BYTEA | Fernet-encrypted JSON payload |
| encryption_key_id | VARCHAR(64) | e.g. `fernet-v1` |
| created_at, rotated_at | TIMESTAMPTZ | |

### `scans`

| Column | Type | Notes |
|--------|------|--------|
| id | UUID | PK |
| client_id | UUID | FK → clients |
| credential_id | UUID | FK → credentials |
| label | VARCHAR(255) | nullable |
| status | ENUM `scan_status` | `pending`, `running`, `completed`, `failed` |
| progress_pct | INTEGER | 0–100 |
| started_at, finished_at | TIMESTAMPTZ | nullable |
| error_message | TEXT | nullable |
| prowler_version | VARCHAR(64) | e.g. image tag |
| output_directory | VARCHAR(1024) | host path inside worker volume |
| logs | TEXT | truncated stdout/stderr |
| previous_scan_id | UUID | FK → scans, nullable (diff baseline) |
| created_at | TIMESTAMPTZ | |

### `findings`

Unique per scan: `(scan_id, fingerprint)`.

| Column | Type | Notes |
|--------|------|--------|
| id | UUID | PK |
| scan_id | UUID | FK → scans ON DELETE CASCADE |
| fingerprint | VARCHAR(64) | SHA-256 hex of composite key |
| check_id | VARCHAR(512) | |
| resource_id | TEXT | |
| region | VARCHAR(128) | normalized empty → `*` in fingerprint function |
| service | VARCHAR(255) | |
| severity | ENUM `finding_severity` | `low`, `medium`, `high`, `critical` |
| status | ENUM `finding_status` | `open`, `closed`, `new` (set by diff engine) |
| description | TEXT | nullable |
| compliance_framework | VARCHAR(255) | nullable |
| raw_json | JSONB | nullable |
| created_at | TIMESTAMPTZ | |

### `scan_diffs`

| Column | Type | Notes |
|--------|------|--------|
| id | UUID | PK |
| scan_id | UUID | FK → scans (the **new** scan) |
| previous_scan_id | UUID | FK → scans |
| created_at | TIMESTAMPTZ | |

### `scan_diff_items`

| Column | Type | Notes |
|--------|------|--------|
| id | UUID | PK |
| scan_diff_id | UUID | FK → scan_diffs |
| fingerprint | VARCHAR(64) | |
| category | ENUM `diff_category` | `closed`, `open`, `new` |
| finding_id | UUID | FK → findings, nullable (closed items have no row on new scan) |

### `finding_triage`

Unique: `(client_id, fingerprint)` — triage survives rescans when the same finding fingerprint appears again.

| Column | Type | Notes |
|--------|------|--------|
| id | UUID | PK |
| client_id | UUID | FK → clients |
| fingerprint | VARCHAR(64) | |
| state | ENUM `triage_state` | `valid`, `false_positive`, `not_applicable` |
| notes | TEXT | nullable |
| updated_by | UUID | FK → users, nullable |
| updated_at | TIMESTAMPTZ | |

## Finding fingerprint

Implemented in `app/services/fingerprint.py`:

- Normalize: trim `check_id`, trim `resource_id`, trim `region` or use `*` if empty.
- `sha256(f"{check_id}|{resource_id}|{region}")` as lowercase hex (64 chars).

## Indexes (summary)

- `users.email` (unique)
- `credentials.client_id`, `scans.client_id`, `scans.credential_id`
- `findings.scan_id`, `findings.fingerprint`
- `scan_diffs.scan_id`, `scan_diff_items.scan_diff_id`, `scan_diff_items.fingerprint`
- `finding_triage.client_id`, `finding_triage.fingerprint`
