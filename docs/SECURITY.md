# Security model (In Pipeline - Most Features are not present in this release)

## Credentials at rest

- Cloud secrets are stored only as **Fernet ciphertext** in `credentials.ciphertext` (see `app/security/crypto.py`).
- **KMS abstraction**: `KmsDecryptPlaceholder` documents where to plug Azure Key Vault for data-key wrapping without changing call sites.
- If `ENCRYPTION_KEY` is unset, the app derives a Fernet key from `JWT_SECRET` for **local development only** — unacceptable for production.

## Transport and session

- API authentication uses **JWT** (HS256 by default) with `sub` = user id and `role` claim.
- Passwords hashed with **bcrypt** (`app/security/pwd.py`; direct `bcrypt` library, not passlib).

## Role-based access

- `UserRole`: `admin`, `user`.
- **Admin-only** routes: `/api/v1/admin/prowler/*` (see `app/deps.py` `get_current_admin`).
- Other authenticated routes are available to any valid user in the current implementation; tighten per-resource checks if you introduce multi-tenant or per-client ACLs.

## Audit logging

- Mutations such as client CRUD, credential create/delete, scan start/update, and triage upsert write rows to `audit_logs` via `app/security/audit_log.py`.
- Fields: actor, action, resource type/id, optional JSON metadata, client IP when available.

## Prowler execution sandbox

- Worker invokes Prowler with **`subprocess` + explicit argv** — **no** `shell=True`.
- CLI arguments are built from validated structures (`ProwlerAzureOptions` in `services/worker/prowler/runner.py`); no user-controlled flags are interpolated into the command.
- Prowler runs inside a **separate container** (`docker run`) with credentials passed as `-e` environment variables, not interpolated into a shell string.
- **Docker socket** on the worker is a high-privilege interface: acceptable for trusted local dev; replace with a remote runner API in production.

## API hardening (recommended next steps)

- Rate limiting on `POST /auth/login`.
- API keys for automation (bonus feature from product plan).
- Per-client authorization: ensure `user` can only access clients they own (add membership table).
