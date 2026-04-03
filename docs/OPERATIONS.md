# Operations

## Logs

- **API**: `docker compose logs -f api`
- **Worker**: `docker compose logs -f worker`
- **Scan execution logs**: persisted on `scans.logs` (truncated) and Prowler JSON under volume `scan_data` at `SCAN_OUTPUT_DIR/<scan_id>/`.

## Deployment verification (findings pipeline)

After changing the worker, API, or web app (parser, Prowler flags, UI refetch):

1. **Rebuild and restart** all consuming services, e.g. `docker compose up -d --build api worker web` (or your stack’s equivalent).
2. **Worker image** must include: Prowler invoked with **`--ignore-exit-code-3`** (see `services/worker/prowler/runner.py`) and the API app copy with **`finding_info`** handling in `services/api/app/services/finding_parser.py` (worker imports that path).
3. **Check ingest without SQL**: `GET /api/v1/scans/{scan_id}` returns **`findings_count`**. If the scan is `completed` at 100% but **`findings_count` is 0**, ingest did not populate rows.
4. **Database** (optional): `SELECT COUNT(*) FROM findings WHERE scan_id = '<uuid>';`
5. **Output files**: Inside the worker container (or the shared `scan_data` volume), under `SCAN_OUTPUT_DIR/<scan_id>/`, confirm `prowler-output-*.ocsf.json` exists and is valid JSON (single array of objects). The Prowler sibling container shares volumes via `--volumes-from`; if the directory is empty, the volume mount is misconfigured. Invalid JSON produces worker log lines `finding_parser: JSONDecodeError`; an empty directory produces `[ingest] WARNING: no JSON files found` in `scans.logs`.
6. **Re-parse after fixes**: `POST /api/v1/scans/{scan_id}/reparse` (authenticated) re-enqueues `cloudaudit.parse_findings` for a **completed** scan so you do not need a full Prowler re-run.

## Database backups

- Standard Postgres tools: `pg_dump` against the `postgres` service or volume `pgdata`.

## Prowler version visibility

- **Cached release**: Redis key `prowler:github_latest` (JSON), populated by `cloudaudit.prowler_version_check` and by `POST /api/v1/admin/prowler/refresh` (admin JWT).
- **Running image**: worker uses `PROWLER_IMAGE`; `scans.prowler_version` may store the image string after a run.
- **Periodic image pull** (optional): set `PROWLER_AUTO_PULL=true` on the **worker** service. Beat enqueues `cloudaudit.prowler_image_pull` every 6 hours (offset :30 past the hour vs the GitHub check at :00). The task runs `docker pull $PROWLER_IMAGE` against the host daemon (socket mount). For a one-off pull, use `POST /api/v1/admin/prowler/pull-image` (admin JWT).

## Updating the Prowler image

**Local Compose**

1. Set `PROWLER_IMAGE` to the desired tag (e.g. `prowlercloud/prowler:stable` in shell or `.env`).
2. `docker compose pull` (if using a registry tag) or rely on `docker run` pulling on first use.
3. `docker compose up -d --build worker`

**Production**

- Prefer immutable task definitions (ACI/AKS) or pinned tags in Kubernetes.
- Automate image digest updates in CI when `prowler_version_check` reports a newer GitHub release; avoid auto-pull on production workers without review.

## Scaling workers

- Run multiple Celery worker containers with the same `REDIS_URL` and `DATABASE_URL`. Ensure `SCAN_OUTPUT_DIR` is shared storage (NFS/EFS) if more than one worker can pick up the same scan (today one task per scan id).

## Removing dev data

```bash
docker compose down -v
```

This deletes Postgres and scan output volumes.
