# Core implementation reference (code map)

Pointers to the main logic for **scan trigger**, **diff engine**, and **triage**.

## 1. Scan trigger

| Piece | Location |
|-------|----------|
| Create scan row + enqueue | `services/api/app/services/scan_service.py` — `create_scan_record`, `enqueue_execute_scan` |
| HTTP entry | `services/api/app/routers/scans.py` — `POST /clients/{client_id}/scans` |
| Celery dispatch (API) | `services/api/app/celery_client.py` — `send_execute_scan` |
| Worker execution | `services/worker/tasks/scan_execute.py` — `execute_scan_task` |
| Prowler invocation | `services/worker/prowler/runner.py` — `run_prowler_azure` |
| Azure credential resolution | `services/api/app/services/azure_creds.py` — `resolve_azure_env_for_credential` |

Flow: validate credential and optional `previous_scan_id` → insert `scans` (`pending`) → `send_execute_scan` → worker decrypts → `docker run` → `parse_findings` → `run_diff`.

**Prowler metadata / image**: `tasks/prowler_version_check.py` (GitHub → Redis), `tasks/prowler_image_pull.py` (optional `docker pull` when `PROWLER_AUTO_PULL` or admin `pull-image`).

## 2. Diff engine

| Piece | Location |
|-------|----------|
| Domain logic | `services/api/app/services/diff_service.py` — `run_diff_for_scan` |
| Fingerprint | `services/api/app/services/fingerprint.py` — `finding_fingerprint` |
| Worker entry | `services/worker/tasks/run_diff.py` — `run_diff_task` |

Algorithm:

1. Load fingerprint sets for **new** scan `N` and **previous** scan `P` (if `previous_scan_id` set).
2. `new = N - P`, `closed = P - N`, `open = N ∩ P`.
3. Replace existing `scan_diffs` / `scan_diff_items` for this scan.
4. Insert diff rows; update `findings.status` on the **new** scan to `new` or `open` (closed only appear in diff items, not as new finding rows).

If there is no previous scan, all findings on the scan are marked `new` and no `scan_diffs` row is created (API synthesizes counts for `GET /diff`).

## 3. Triage system

| Piece | Location |
|-------|----------|
| HTTP API | `services/api/app/routers/triage.py` — `PUT /clients/{client_id}/triage/{fingerprint}`, `GET` list |
| Persistence | `services/api/app/models/triage.py` — `FindingTriage` unique on `(client_id, fingerprint)` |
| Join in UI/API | `services/api/app/routers/findings.py` — triage map by fingerprint for list/detail |
| Export | `services/api/app/services/export_xlsx.py` — triage column from same fingerprint map |
| Audit | `write_audit_log` on triage upsert |

Triage is **per client + fingerprint**, not per scan row, so rescans reuse the same triage when the finding identity matches `(check_id, resource_id, region)` via the fingerprint.
