import os

from celery import Celery
from celery.schedules import crontab

app = Celery("cloudaudit")

app.conf.update(
    broker_url=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    result_backend=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    task_default_queue="cloudaudit",
    beat_schedule={
        "prowler-version-check": {
            "task": "cloudaudit.prowler_version_check",
            "schedule": crontab(minute=0, hour="*/6"),
        },
        # Runs on worker; task no-ops unless PROWLER_AUTO_PULL=true (see tasks/prowler_image_pull.py).
        "prowler-image-pull": {
            "task": "cloudaudit.prowler_image_pull",
            "schedule": crontab(minute=30, hour="*/6"),
        },
    },
)

import tasks.ai_tasks  # noqa: E402,F401
import tasks.parse_findings  # noqa: E402,F401
import tasks.prowler_image_pull  # noqa: E402,F401
import tasks.prowler_version_check  # noqa: E402,F401
import tasks.run_diff  # noqa: E402,F401
import tasks.scan_execute  # noqa: E402,F401
