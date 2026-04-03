# Worker, Celery, and Prowler

## Reference (upstream)

**[Prowler official documentation](https://docs.prowler.com/)** is the canonical reference for scan behavior, output formats, and compliance-oriented concepts. This repo integrates Prowler as follows:

| Concern | Where it lives here | Upstream |
|--------|---------------------|----------|
| **Scanning** | `services/worker/prowler/runner.py` — `docker run --volumes-from <worker> … <image> azure --sp-env-auth --ignore-exit-code-3 -M json-ocsf --output-directory /data/scans/{scan_id}`; fixed argv, no user-controlled flags | [Prowler CLI misc](https://docs.prowler.com/user-guide/cli/tutorials/misc#disable-exit-code-3) (exit code 3 = failed checks), `prowler azure --help` for flags |
| **Importing data** | `services/worker/tasks/parse_findings.py` walks `SCAN_OUTPUT_DIR/{scan_id}/**/*.json`; `services/api/app/services/finding_parser.py` normalizes **JSON-OCSF** (`finding_info`, `metadata.event_code`, `resources`, `unmapped.compliance`, severity) into `findings` rows | Prowler docs on reporting/output; after image upgrades, compare a sample JSON file to the parser |
| **UI** | Findings and scan progress come from the API; field meanings align with normalized Prowler concepts — see [FRONTEND.md](FRONTEND.md#findings-ui-and-prowler-concepts) | Severity tiers and compliance framing as documented by Prowler |

When bumping `PROWLER_IMAGE` (e.g. `stable`), reconcile flags and output layout with upstream before changing production behavior.

## Celery application

- Entry: `services/worker/celery_app.py`
- Broker and result backend: `REDIS_URL`
- **Default queue:** `cloudaudit` (`task_default_queue`). The API’s `app/celery_client.py` must publish to the same queue (and passes `queue="cloudaudit"` explicitly). If they diverge, scans stay **`pending`** forever because no worker consumes the task.
- Worker command includes `-Q cloudaudit,celery` so any legacy messages on `celery` are still processed.
- Task modules are imported at the bottom of `celery_app.py` to register tasks.

## Task names (Celery)

| Name | Module | Purpose |
|------|--------|---------|
| `cloudaudit.execute_scan` | `tasks/scan_execute.py` | Run Prowler, append logs, chain parse |
| `cloudaudit.parse_findings` | `tasks/parse_findings.py` | Load JSON from output dir → `findings` rows |
| `cloudaudit.run_diff` | `tasks/run_diff.py` | Compute diff vs `previous_scan_id`, publish 100% |
| `cloudaudit.prowler_version_check` | `tasks/prowler_version_check.py` | GitHub latest release → Redis cache |
| `cloudaudit.prowler_image_pull` | `tasks/prowler_image_pull.py` | Optional `docker pull PROWLER_IMAGE` when `PROWLER_AUTO_PULL=true` (or `force` from admin API) |

The API enqueues work via `app/celery_client.py` using `send_task(...)` so the API image does not import task implementations.

## Scan pipeline

1. **execute_scan**
   - Loads `Scan` + `Credential` from DB.
   - Resolves Azure env vars via `app/services/azure_creds.py` (service principal, managed identity, or CLI).
   - Calls `prowler.runner.run_prowler_azure()` → `docker run --volumes-from <worker> ... prowler azure --sp-env-auth --ignore-exit-code-3 -M json-ocsf --output-directory /data/scans/{scan_id}`; streams container stdout into `scans.logs` in batches while the scan runs.
   - Updates `scans.status`, `logs`, `error_message`, `progress_pct`; publishes Redis progress.
   - On success, delays `parse_findings_task`.

2. **parse_findings**
   - Deletes existing `findings` for the scan (idempotent re-parse).
   - Uses `app/services/finding_parser.py` to walk `SCAN_OUTPUT_DIR/{scan_id}/**/*.json`.
   - Prowler 5 **json-ocsf** files are **DetectionFinding** objects with top-level **`finding_info`** and **`metadata.event_code`** (Prowler check id); the parser maps those plus `resources` and `unmapped.compliance`.
   - Inserts normalized rows; delays `run_diff_task`.

3. **run_diff**
   - Calls `app/services/diff_service.py::run_diff_for_scan`.
   - Publishes final progress `{ "pct": 100, "stage": "completed", "status": "completed" }`.

## Redis pub/sub (progress)

- Channel pattern: `scan:{scan_id}:progress` (see `app/redis_client.py`).
- API WebSocket subscribes with `redis.asyncio` and forwards JSON to the browser.

## Prowler Docker image

- Controlled by `PROWLER_IMAGE`. Use the official image **[prowlercloud/prowler](https://hub.docker.com/r/prowlercloud/prowler)**. Default in compose is **`stable`** (latest release); **`latest`** tracks `master` and may be less predictable. The old name `prowler/prowler` is not published and pulls will fail with “access denied”.
- Runner invokes: `docker run --user 0:0 --volumes-from <worker_cid> -e AZURE_CLIENT_ID=… -e AZURE_CLIENT_SECRET=… -e AZURE_TENANT_ID=… <image> azure --sp-env-auth --ignore-exit-code-3 -M json-ocsf --output-directory /data/scans/{scan_id}` (see `services/worker/prowler/runner.py`). **`--volumes-from`** shares the worker container's named volume so the Prowler sibling writes to the same `/data/scans` path the worker reads from. **`--ignore-exit-code-3`** is required because [Prowler exits with code 3 when any check fails](https://docs.prowler.com/user-guide/cli/tutorials/misc#disable-exit-code-3); that is normal for audits with findings. `--user 0:0` avoids `PermissionError` when the directory is root-owned. The auth flag (`--sp-env-auth`, `--managed-identity-auth`, `--cli-auth`) is derived from the credential's `auth_method` field.
- Upgrading Prowler may require flag changes; check `prowler azure --help` inside the image if scans fail with a non-zero exit code.
- **Auto-update**: Beat runs `prowler_version_check` on a schedule; results are cached. **Pulling** the scan image can be scheduled by setting **`PROWLER_AUTO_PULL=true`** on the worker (see [OPERATIONS.md](OPERATIONS.md)); otherwise pull manually, via `POST /admin/prowler/pull-image`, or update ECS/K8s task images in production.

## Beat schedule

- Defined in `celery_app.py`: Prowler GitHub release check every 6 hours (crontab).
