"""Run Prowler inside Docker with a fixed argv allowlist (no shell, no user-controlled flags)."""

from __future__ import annotations

import os
import re
import shutil
import socket
import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path

from pydantic import BaseModel, Field


class ProwlerAzureOptions(BaseModel):
    """Validated scan options passed to Prowler CLI for Azure."""

    # subscription_ids are passed via AZURE_SUBSCRIPTION_IDS env var; no extra CLI args needed here.
    extra_checks: list[str] = Field(default_factory=list)


def _docker_bin() -> str:
    """Resolve docker CLI path (Celery workers may have a minimal PATH without /usr/bin)."""
    override = os.environ.get("DOCKER_BIN", "").strip()
    if override:
        return override
    w = shutil.which("docker")
    if w:
        return w
    for candidate in ("/usr/local/bin/docker", "/usr/bin/docker", "/bin/docker"):
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise FileNotFoundError(
        "docker CLI not found. Rebuild the worker image (static client in /usr/local/bin/docker) or set DOCKER_BIN."
    )


def _azure_env_args(azure_env: dict[str, str]) -> list[str]:
    out: list[str] = []
    for k, v in azure_env.items():
        if k.startswith("AZURE_") and v is not None:
            out.extend(["-e", f"{k}={v}"])
    return out


def _prowler_azure_docker_cmd(
    *,
    host_output_dir: Path,
    azure_env: dict[str, str],
    auth_flag: str,
    image: str,
    options: ProwlerAzureOptions,
) -> list[str]:
    host_output_dir.mkdir(parents=True, exist_ok=True)
    # Share the worker's volumes with the Prowler sibling container so both
    # see the same named Docker volume for /data/scans.  A plain bind-mount
    # is resolved by the *host* Docker daemon, which points to a different
    # location than the named volume the worker uses.
    worker_cid = socket.gethostname()
    container_output = str(host_output_dir)
    cmd: list[str] = [
        _docker_bin(),
        "run",
        "--rm",
        "--user",
        "0:0",
        "--volumes-from",
        worker_cid,
        *_azure_env_args(azure_env),
        image,
        "azure",
        auth_flag,
        # Prowler exits 3 when any check FAILs (expected). We only fail on real errors.
        "--ignore-exit-code-3",
        "-M",
        "json-ocsf",
        "--output-directory",
        container_output,
    ]
    return cmd


# Prowler progress bar: "57/244 [23%]" or "383/383 [100%]"
_PROGRESS_RE = re.compile(r"(\d+)\s*/\s*(\d+)\s*\[\s*(\d+)%\s*\]")


def run_prowler_azure(
    *,
    image: str,
    host_output_dir: Path,
    azure_env: dict[str, str],
    auth_flag: str,
    options: ProwlerAzureOptions | None = None,
    on_log_chunk: Callable[[str], None] | None = None,
    on_progress: Callable[[int, int, int], None] | None = None,
) -> tuple[int, str]:
    """Run Prowler in Docker against Azure.

    ``azure_env``    — AZURE_* environment variables for the Prowler container.
    ``auth_flag``    — one of ``--sp-env-auth``, ``--managed-identity-auth``, ``--cli-auth``.
    ``on_log_chunk`` — called with batched stdout text (~1s / 8KiB).
    ``on_progress``  — called as ``(completed, total, pct)`` when Prowler
                       emits progress like ``57/244 [23%]``.
    """
    options = options or ProwlerAzureOptions()
    cmd = _prowler_azure_docker_cmd(
        host_output_dir=host_output_dir,
        azure_env=azure_env,
        auth_flag=auth_flag,
        image=image,
        options=options,
    )

    if on_log_chunk is None and on_progress is None:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=86400,
        )
        log = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
        return proc.returncode, log

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    full_parts: list[str] = []
    pending: list[str] = []
    last_flush = time.monotonic()
    flush_bytes = 8192
    flush_sec = 1.0
    last_pct_reported = -1
    tail_buf = ""

    def flush() -> None:
        nonlocal pending, last_flush
        if not pending:
            return
        if on_log_chunk:
            on_log_chunk("".join(pending))
        pending.clear()
        last_flush = time.monotonic()

    def _check_progress(text: str) -> None:
        nonlocal last_pct_reported, tail_buf
        tail_buf = (tail_buf + text)[-512:]
        m = _PROGRESS_RE.search(tail_buf)
        if m and on_progress:
            completed, total, pct = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if pct != last_pct_reported:
                last_pct_reported = pct
                on_progress(completed, total, pct)

    def kill_proc() -> None:
        try:
            proc.kill()
        except OSError:
            pass

    timer = threading.Timer(86400.0, kill_proc)
    timer.daemon = True
    timer.start()
    assert proc.stdout is not None
    try:
        while True:
            chunk = proc.stdout.read(4096)
            if chunk:
                full_parts.append(chunk)
                pending.append(chunk)
                _check_progress(chunk)
                pending_len = sum(len(p) for p in pending)
                if pending_len >= flush_bytes or time.monotonic() - last_flush >= flush_sec:
                    flush()
            if not chunk:
                proc.wait()
                flush()
                break
    finally:
        timer.cancel()

    rc = proc.returncode if proc.returncode is not None else -1
    full_log = "".join(full_parts)
    return rc, full_log
