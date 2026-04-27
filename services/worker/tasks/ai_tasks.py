"""Celery tasks for AI-powered features: auto-triage, executive summary, smart grouping."""
from __future__ import annotations

import json
import logging
import time
import uuid
from collections import Counter

from celery_app import app
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.ai import AiFindingGroups, AiSummary, AiTriageSuggestion
from app.models.finding import Finding
from app.models.scan import Scan
from app.models.triage import FindingTriage
from app.redis_client import get_redis
from app.services.ai_service import AIServiceError, get_ai_service

logger = logging.getLogger(__name__)

_TTL = 3600        # Redis key TTL in seconds
_BATCH_SIZE = 5    # Small batches — free models have rate limits
_MAX_FINDINGS = 100  # Cap for full-scan triage on free tier
_BATCH_DELAY = 2   # Seconds between batches to respect rate limits


def _set_status(key: str, payload: dict) -> None:
    r = get_redis()
    r.setex(key, _TTL, json.dumps(payload))


def _triage_key(sid: uuid.UUID) -> str:
    return f"ai:triage:status:{sid}"

def _summary_key(sid: uuid.UUID) -> str:
    return f"ai:summary:status:{sid}"

def _group_key(sid: uuid.UUID) -> str:
    return f"ai:groups:status:{sid}"


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 1 — AI Auto-Triage
# ─────────────────────────────────────────────────────────────────────────────

_TRIAGE_SYSTEM_PROMPT = """You are a cloud security analyst triaging security findings from a CSPM scan.

For each finding, respond with a JSON array. Each item must have exactly these fields:
- "fingerprint": copy the fingerprint unchanged
- "decision": one of "valid", "false_positive", "not_applicable", "accepted_risk"
- "confidence": integer 0-100
- "reasoning": 1 sentence explanation
- "priority": one of "immediate", "soon", "low"

Rules:
- "valid" = real security issue to fix
- "false_positive" = check triggered but not actually a risk
- "not_applicable" = check doesn't apply to this resource type
- "accepted_risk" = common known trade-off
- Critical/High severity = almost always "valid"

Output ONLY a raw JSON array, no markdown, no explanation. Example:
[{"fingerprint":"abc123","decision":"valid","confidence":90,"reasoning":"Open port exposes attack surface.","priority":"immediate"}]"""


@app.task(name="cloudaudit.ai_triage")
def ai_triage_task(scan_id: str, fingerprints: list[str] | None = None) -> None:
    """
    Triage findings for a scan.
    If fingerprints is provided, only triage those specific findings.
    Otherwise triage all untriaged findings (capped at _MAX_FINDINGS, prioritised by severity).
    """
    sid = uuid.UUID(scan_id)
    key = _triage_key(sid)
    db = SessionLocal()
    try:
        _set_status(key, {"status": "running", "processed": 0, "total": 0})

        ai = get_ai_service()
        ok, err = ai.validate_key()
        if not ok:
            _set_status(key, {"status": "failed", "error": err})
            logger.error("AI triage aborted — key validation failed: %s", err)
            return

        scan = db.get(Scan, sid)
        if not scan:
            _set_status(key, {"status": "failed", "error": "Scan not found"})
            return

        if fingerprints:
            # Selective triage — only process the requested fingerprints
            findings = db.query(Finding).filter(
                Finding.scan_id == sid,
                Finding.fingerprint.in_(fingerprints),
            ).all()
            # Remove existing suggestions for these fingerprints so we get fresh results
            db.query(AiTriageSuggestion).filter(
                AiTriageSuggestion.scan_id == sid,
                AiTriageSuggestion.fingerprint.in_(fingerprints),
            ).delete(synchronize_session=False)
        else:
            # Full-scan triage — clear all existing and re-run
            db.query(AiTriageSuggestion).filter(AiTriageSuggestion.scan_id == sid).delete()

            # Exclude already manually triaged fingerprints
            triaged_fps: set[str] = {
                t.fingerprint
                for t in db.query(FindingTriage).filter(FindingTriage.client_id == scan.client_id).all()
            }
            q = db.query(Finding).filter(Finding.scan_id == sid)
            if triaged_fps:
                q = q.filter(Finding.fingerprint.notin_(triaged_fps))

            # Prioritise critical/high, cap at _MAX_FINDINGS to stay within free tier limits
            _SEV_PRIORITY = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            all_findings = q.all()
            all_findings.sort(key=lambda f: _SEV_PRIORITY.get(f.severity.value, 4))
            findings = all_findings[:_MAX_FINDINGS]

        db.commit()

        total = len(findings)
        _set_status(key, {"status": "running", "processed": 0, "total": total})
        logger.info("AI triage: scan=%s findings=%d (selective=%s)", sid, total, bool(fingerprints))

        if not findings:
            _set_status(key, {"status": "completed", "processed": 0, "total": 0})
            return

        processed = 0
        for batch_start in range(0, len(findings), _BATCH_SIZE):
            batch = findings[batch_start: batch_start + _BATCH_SIZE]

            findings_payload = []
            for f in batch:
                raw = f.raw_json or {}
                finfo = raw.get("finding_info") or {}
                rem = raw.get("remediation") or {}
                findings_payload.append({
                    "fingerprint": f.fingerprint,
                    "check_id": f.check_id,
                    "check_title": (finfo.get("title") if isinstance(finfo, dict) else "") or "",
                    "severity": f.severity.value,
                    "service_name": f.service,
                    "resource_id": f.resource_id,
                    "region": f.region,
                    "status_extended": (raw.get("message") or raw.get("status_detail") or f.description or ""),
                    "remediation_text": (rem.get("desc") if isinstance(rem, dict) else "") or "",
                })

            prompt = (
                _TRIAGE_SYSTEM_PROMPT
                + "\n\nFindings to triage:\n"
                + json.dumps(findings_payload, indent=2)
            )

            try:
                result = ai.generate_json(prompt)
                if isinstance(result, list):
                    saved = 0
                    for item in result:
                        fp = str(item.get("fingerprint", ""))[:64]
                        if not fp:
                            continue
                        suggestion = AiTriageSuggestion(
                            scan_id=sid,
                            fingerprint=fp,
                            suggested_decision=str(item.get("decision", "valid"))[:32],
                            confidence=max(0, min(100, int(item.get("confidence", 0)))),
                            reasoning=str(item.get("reasoning", ""))[:2000],
                            priority=str(item.get("priority", "low"))[:16],
                        )
                        db.add(suggestion)
                        saved += 1
                    db.commit()
                    logger.info("AI triage batch %d-%d: saved %d suggestions", batch_start, batch_start + len(batch), saved)
                else:
                    logger.warning("AI triage batch %d: unexpected response type %s", batch_start, type(result))
            except AIServiceError as exc:
                logger.error("AI triage batch %d failed: %s", batch_start, exc)
            except Exception as exc:  # noqa: BLE001
                logger.error("Unexpected error in AI triage batch %d: %s", batch_start, exc)

            processed += len(batch)
            _set_status(key, {"status": "running", "processed": processed, "total": total})

            # Respect free tier rate limits between batches
            if batch_start + _BATCH_SIZE < len(findings):
                time.sleep(_BATCH_DELAY)

        _set_status(key, {"status": "completed", "processed": processed, "total": total})
        logger.info("AI triage complete: scan=%s processed=%d", sid, processed)

    except Exception as exc:  # noqa: BLE001
        logger.error("AI triage task failed: %s", exc, exc_info=True)
        _set_status(key, {"status": "failed", "error": str(exc)[:500]})
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 3 — AI Executive Summary
# ─────────────────────────────────────────────────────────────────────────────

@app.task(name="cloudaudit.ai_summary")
def ai_summary_task(scan_id: str) -> None:
    sid = uuid.UUID(scan_id)
    key = _summary_key(sid)
    db = SessionLocal()
    try:
        _set_status(key, {"status": "running"})

        ai = get_ai_service()
        ok, err = ai.validate_key()
        if not ok:
            _set_status(key, {"status": "failed", "error": err})
            logger.error("AI summary aborted — key validation failed: %s", err)
            return

        scan = db.get(Scan, sid)
        if not scan:
            _set_status(key, {"status": "failed", "error": "Scan not found"})
            return

        db.query(AiSummary).filter(AiSummary.scan_id == sid).delete()
        db.commit()

        all_findings = db.query(Finding).filter(Finding.scan_id == sid).all()
        total = len(all_findings)

        by_severity: Counter = Counter()
        by_service: Counter = Counter()
        top_details: list[dict] = []

        for f in all_findings:
            by_severity[f.severity.value] += 1
            by_service[f.service] += 1

        for f in sorted(all_findings, key=lambda x: (["critical","high","medium","low"].index(x.severity.value) if x.severity.value in ["critical","high","medium","low"] else 99)):
            if len(top_details) >= 8:
                break
            raw = f.raw_json or {}
            finfo = raw.get("finding_info") or {}
            top_details.append({
                "check_id": f.check_id,
                "title": (finfo.get("title") if isinstance(finfo, dict) else "") or f.description or f.check_id,
                "severity": f.severity.value,
                "service": f.service,
                "resource_id": f.resource_id,
            })

        service_breakdown = ", ".join(f"{svc}:{cnt}" for svc, cnt in by_service.most_common(8))
        pass_count = sum(1 for f in all_findings if f.status.value == "closed")

        prompt = f"""You are a senior cloud security consultant preparing an executive security posture report.

Scan Results:
- Total findings: {total}
- Critical: {by_severity.get('critical', 0)}, High: {by_severity.get('high', 0)}, Medium: {by_severity.get('medium', 0)}, Low: {by_severity.get('low', 0)}
- Top affected services: {service_breakdown}
- Top critical/high findings: {json.dumps(top_details, indent=2)}
- Pass rate: {pass_count}/{total} checks passed

Output ONLY a raw JSON object (no markdown):
{{"overall_rating":"Critical","overall_score":25,"executive_summary":"3-4 paragraph summary for C-level executives.","top_risks":[{{"rank":1,"title":"Risk title","description":"Why this matters","affected_resources":5,"recommendation":"What to do"}}],"quick_wins":[{{"title":"Quick win","description":"Easy fix","impact":"Resolves X findings","effort":"15 min"}}],"compliance_notes":"Brief compliance note.","next_steps":["Action 1","Action 2","Action 3"]}}

overall_rating must be one of: Critical, Poor, Fair, Good, Excellent.
overall_score is 0-100 (higher = better security posture)."""

        content = ai.generate_json(prompt)

        row = AiSummary(scan_id=sid, client_id=scan.client_id, content=content)
        db.add(row)
        db.commit()

        _set_status(key, {"status": "completed"})
        logger.info("AI summary complete: scan=%s rating=%s score=%s", sid, content.get("overall_rating"), content.get("overall_score"))

    except AIServiceError as exc:
        _set_status(key, {"status": "failed", "error": str(exc)[:500]})
        logger.error("AI summary failed (AI unavailable): %s", exc)
    except Exception as exc:  # noqa: BLE001
        _set_status(key, {"status": "failed", "error": str(exc)[:500]})
        logger.error("AI summary task failed: %s", exc, exc_info=True)
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 4 — AI Smart Grouping
# ─────────────────────────────────────────────────────────────────────────────

@app.task(name="cloudaudit.ai_group")
def ai_group_task(scan_id: str) -> None:
    sid = uuid.UUID(scan_id)
    key = _group_key(sid)
    db = SessionLocal()
    try:
        _set_status(key, {"status": "running"})

        ai = get_ai_service()
        ok, err = ai.validate_key()
        if not ok:
            _set_status(key, {"status": "failed", "error": err})
            logger.error("AI grouping aborted — key validation failed: %s", err)
            return

        scan = db.get(Scan, sid)
        if not scan:
            _set_status(key, {"status": "failed", "error": "Scan not found"})
            return

        db.query(AiFindingGroups).filter(AiFindingGroups.scan_id == sid).delete()
        db.commit()

        findings = db.query(Finding).filter(Finding.scan_id == sid).all()
        total = len(findings)

        if not findings:
            row = AiFindingGroups(scan_id=sid, groups_data=[])
            db.add(row)
            db.commit()
            _set_status(key, {"status": "completed"})
            return

        all_groups: list[dict] = []
        batch_size = 30  # Reduced from 50 for free model reliability

        for batch_start in range(0, len(findings), batch_size):
            batch = findings[batch_start: batch_start + batch_size]
            payload = []
            for f in batch:
                raw = f.raw_json or {}
                finfo = raw.get("finding_info") or {}
                payload.append({
                    "fingerprint": f.fingerprint,
                    "check_id": f.check_id,
                    "title": (finfo.get("title") if isinstance(finfo, dict) else "") or "",
                    "severity": f.severity.value,
                    "service": f.service,
                    "resource_id": f.resource_id,
                    "region": f.region,
                })

            prompt = f"""Group these security findings by root cause. Findings with the same check_id belong in one group.

Findings:
{json.dumps(payload, indent=2)}

Output ONLY a raw JSON array (no markdown):
[{{"group_id":"g1","title":"Group title","root_cause":"Underlying issue","single_fix":"One fix resolves all","finding_fingerprints":["fp1","fp2"],"finding_count":2,"max_severity":"high","affected_services":["storage"],"effort_to_fix":"quick"}}]

effort_to_fix must be: quick, moderate, or significant."""

            try:
                batch_groups = ai.generate_json(prompt)
                if isinstance(batch_groups, list):
                    all_groups.extend(batch_groups)
            except AIServiceError as exc:
                logger.error("AI grouping batch %d failed: %s", batch_start, exc)
            except Exception as exc:  # noqa: BLE001
                logger.error("Unexpected error in AI grouping batch %d: %s", batch_start, exc)

            if batch_start + batch_size < len(findings):
                time.sleep(_BATCH_DELAY)

        _SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        all_groups.sort(key=lambda g: (-g.get("finding_count", 0), _SEV_ORDER.get(g.get("max_severity", "low"), 4)))

        row = AiFindingGroups(scan_id=sid, groups_data=all_groups)
        db.add(row)
        db.commit()

        _set_status(key, {"status": "completed"})
        logger.info("AI grouping complete: scan=%s groups=%d findings=%d", sid, len(all_groups), total)

    except AIServiceError as exc:
        _set_status(key, {"status": "failed", "error": str(exc)[:500]})
        logger.error("AI grouping failed (AI unavailable): %s", exc)
    except Exception as exc:  # noqa: BLE001
        _set_status(key, {"status": "failed", "error": str(exc)[:500]})
        logger.error("AI grouping task failed: %s", exc, exc_info=True)
    finally:
        db.close()
