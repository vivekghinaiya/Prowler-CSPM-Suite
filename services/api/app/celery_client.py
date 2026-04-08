"""Fire-and-forget task dispatch to Celery workers (API container has no task implementations)."""

from uuid import UUID

from celery import Celery

from app.config import get_settings


def _app() -> Celery:
    """Broker client must use the same default queue as the worker (see services/worker/celery_app.py)."""
    s = get_settings()
    app = Celery("cloudaudit", broker=s.redis_url, backend=s.redis_url)
    app.conf.task_default_queue = "cloudaudit"
    return app


def send_execute_scan(scan_id: UUID) -> str:
    """Enqueue scan execution; returns Celery task id for revoke/cancel."""
    async_result = _app().send_task("cloudaudit.execute_scan", args=[str(scan_id)], queue="cloudaudit")
    return async_result.id


def revoke_task(task_id: str, *, terminate: bool = False) -> None:
    """Revoke a Celery task. terminate=True sends SIGTERM to the worker child (running task)."""
    if not task_id:
        return
    _app().control.revoke(task_id, terminate=terminate, signal="SIGTERM")


def send_parse_findings(scan_id: UUID) -> None:
    _app().send_task("cloudaudit.parse_findings", args=[str(scan_id)], queue="cloudaudit")


def send_run_diff(scan_id: UUID) -> None:
    _app().send_task("cloudaudit.run_diff", args=[str(scan_id)], queue="cloudaudit")


def send_prowler_version_check() -> None:
    _app().send_task("cloudaudit.prowler_version_check", queue="cloudaudit")


def send_prowler_image_pull(*, force: bool = False) -> None:
    _app().send_task("cloudaudit.prowler_image_pull", kwargs={"force": force}, queue="cloudaudit")


def send_ai_triage(scan_id: UUID) -> str:
    result = _app().send_task("cloudaudit.ai_triage", args=[str(scan_id)], queue="cloudaudit")
    return result.id


def send_ai_summary(scan_id: UUID) -> str:
    result = _app().send_task("cloudaudit.ai_summary", args=[str(scan_id)], queue="cloudaudit")
    return result.id


def send_ai_group(scan_id: UUID) -> str:
    result = _app().send_task("cloudaudit.ai_group", args=[str(scan_id)], queue="cloudaudit")
    return result.id
