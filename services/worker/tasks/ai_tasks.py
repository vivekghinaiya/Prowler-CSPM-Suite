"""Celery tasks for AI-powered features: auto-triage, executive summary, smart grouping."""
from __future__ import annotations

import json
import logging
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

_TTL = 3600  # Redis key TTL in seconds


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

_TRIAGE_SYSTEM_PROMPT = """You are an expert Azure cloud security analyst performing triage on security findings from a CSPM scan. For each finding, analyze the check, resource, and context to determine the appropriate triage decision.

For each finding, respond with a JSON array where each item has:
- "fingerprint": the finding fingerprint (pass it through unchanged)
- "decision": one of "valid", "false_positive", "not_applicable", "accepted_risk"
- "confidence": a number 0-100 indicating your confidence
- "reasoning": 1-2 sentence explanation of why you chose this decision
- "priority": "immediate", "soon", or "low" — how urgently this needs attention

Guidelines:
- "valid" = real security issue that should be fixed
- "false_positive" = the check triggered but it's not actually a risk in this context
- "not_applicable" = the check doesn't apply to this type of resource/environment
- "accepted_risk" = a known trade-off that organizations commonly accept
- Most FAIL findings from Prowler ARE valid issues — don't over-classify as false positive
- Critical and High severity findings should almost always be "valid"
- Consider Azure-specific context (e.g., managed services have different risk profiles)

Respond ONLY with a valid JSON array. No markdown, no explanation outside the JSON."""


@app.task(name="cloudaudit.ai_triage")
def ai_triage_task(scan_id: str) -> None:
    sid = uuid.UUID(scan_id)
    key = _triage_key(sid)
    db = SessionLocal()
    try:
        _set_status(key, {"status": "running", "processed": 0, "total": 0})

        # Validate API key before doing any DB work
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

        # Clear any existing suggestions for a re-run
        db.query(AiTriageSuggestion).filter(AiTriageSuggestion.scan_id == sid).delete()
        db.commit()

        # Fetch fingerprints that already have a manual triage decision
        triaged_fps: set[str] = {
            t.fingerprint
            for t in db.query(FindingTriage).filter(FindingTriage.client_id == scan.client_id).all()
        }

        q = db.query(Finding).filter(Finding.scan_id == sid)
        if triaged_fps:
            q = q.filter(Finding.fingerprint.notin_(triaged_fps))
        findings = q.all()

        total = len(findings)
        _set_status(key, {"status": "running", "processed": 0, "total": total})
        logger.info("AI triage: scan=%s untriaged_findings=%d", sid, total)

        if not findings:
            _set_status(key, {"status": "completed", "processed": 0, "total": 0})
            return

        batch_size = 20
        processed = 0

        for batch_start in range(0, len(findings), batch_size):
            batch = findings[batch_start : batch_start + batch_size]

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
                    db.commit()
            except AIServiceError as exc:
                logger.error("AI triage batch %d failed: %s", batch_start, exc)
                # Continue with next batch — partial results are better than none
            except Exception as exc:  # noqa: BLE001
                logger.error("Unexpected error in AI triage batch %d: %s", batch_start, exc)

            processed += len(batch)
            _set_status(key, {"status": "running", "processed": processed, "total": total})

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

        # Validate API key before doing any DB work
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

        # Delete stale cached summary to allow re-generation
        db.query(AiSummary).filter(AiSummary.scan_id == sid).delete()
        db.commit()

        all_findings = db.query(Finding).filter(Finding.scan_id == sid).all()
        total = len(all_findings)

        # Build aggregates
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
        total_checks = total  # approximation

        prompt = f"""You are a senior cloud security consultant preparing a security posture report for executive management. Based on the scan results below, write a professional executive summary.

Scan Results:
- Total findings: {total}
- Critical: {by_severity.get('critical', 0)}, High: {by_severity.get('high', 0)}, Medium: {by_severity.get('medium', 0)}, Low: {by_severity.get('low', 0)}
- Top affected services: {service_breakdown}
- Top critical/high findings: {json.dumps(top_details, indent=2)}
- Pass rate: {pass_count}/{total_checks} checks passed

Respond with a JSON object:
{{
  "overall_rating": "Critical",
  "overall_score": 25,
  "executive_summary": "3-4 paragraph professional summary suitable for C-level executives. Include the overall security posture assessment, key risk areas, and recommended immediate actions. Write in a formal, business-appropriate tone.",
  "top_risks": [
    {{
      "rank": 1,
      "title": "Risk title",
      "description": "Why this matters to the business",
      "affected_resources": 5,
      "recommendation": "What to do about it"
    }}
  ],
  "quick_wins": [
    {{
      "title": "Quick win title",
      "description": "Easy fix that improves posture",
      "impact": "How many findings this resolves",
      "effort": "Estimated time"
    }}
  ],
  "compliance_notes": "Brief note on how findings might relate to common compliance frameworks (CIS, SOC2, ISO27001)",
  "next_steps": ["Recommended action 1", "Recommended action 2", "Recommended action 3"]
}}

overall_rating must be one of: Critical, Poor, Fair, Good, Excellent.
overall_score is 0-100 (higher is better security posture).
Respond ONLY with valid JSON. No markdown."""

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

        # Validate API key before doing any DB work
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

        # Delete stale grouping
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
        batch_size = 50

        for batch_start in range(0, len(findings), batch_size):
            batch = findings[batch_start : batch_start + batch_size]
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

            prompt = f"""You are an Azure security expert. Given these security findings, group them by root cause or common remediation. Many findings are the same misconfiguration repeated across multiple resources.

Findings:
{json.dumps(payload, indent=2)}

Respond with a JSON array of groups:
[
  {{
    "group_id": "unique-short-id",
    "title": "Descriptive group title",
    "root_cause": "The underlying issue causing all these findings",
    "single_fix": "One fix that resolves all findings in this group",
    "finding_fingerprints": ["fingerprint1", "fingerprint2"],
    "finding_count": 8,
    "max_severity": "high",
    "affected_services": ["containerregistry"],
    "effort_to_fix": "quick"
  }}
]

effort_to_fix must be one of: quick, moderate, significant.
Group aggressively — findings sharing the same check_id belong in one group.
Single-occurrence findings can be their own group.
Respond ONLY with valid JSON. No markdown."""

            try:
                batch_groups = ai.generate_json(prompt)
                if isinstance(batch_groups, list):
                    all_groups.extend(batch_groups)
            except AIServiceError as exc:
                logger.error("AI grouping batch %d failed: %s", batch_start, exc)
            except Exception as exc:  # noqa: BLE001
                logger.error("Unexpected error in AI grouping batch %d: %s", batch_start, exc)

        # Sort groups by finding_count desc, then severity
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
