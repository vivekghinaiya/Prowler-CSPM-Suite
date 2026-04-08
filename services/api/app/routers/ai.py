"""AI feature endpoints — auto-triage, remediation, executive summary, smart grouping."""
from __future__ import annotations

import json
import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.ai import AiFindingGroups, AiRemediation, AiSummary, AiTriageSuggestion
from app.models.finding import Finding
from app.models.scan import Scan
from app.models.triage import FindingTriage, TriageState
from app.models.user import User
from app.redis_client import get_redis
from app.schemas.ai import (
    AIGroupingOut,
    AIGroupingStatusOut,
    AIRemediationOut,
    AISmartGroup,
    AISummaryOut,
    AISummaryRisk,
    AISummaryQuickWin,
    AISummaryStatusOut,
    AITriageAcceptAllIn,
    AITriageResultOut,
    AITriageSuggestionOut,
)
from app.security.audit_log import write_audit_log

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ai"])

# ── Redis status key helpers ──────────────────────────────────────────────────

def _triage_key(scan_id: uuid.UUID) -> str:
    return f"ai:triage:status:{scan_id}"

def _summary_key(scan_id: uuid.UUID) -> str:
    return f"ai:summary:status:{scan_id}"

def _group_key(scan_id: uuid.UUID) -> str:
    return f"ai:groups:status:{scan_id}"

def _get_job_status(key: str) -> dict:
    r = get_redis()
    raw = r.get(key)
    if not raw:
        return {"status": "not_started"}
    return json.loads(raw)

def _set_job_status(key: str, payload: dict, ttl: int = 3600) -> None:
    r = get_redis()
    r.setex(key, ttl, json.dumps(payload))

# ── Triage state mapping ──────────────────────────────────────────────────────

_DECISION_MAP: dict[str, TriageState] = {
    "valid": TriageState.valid,
    "false_positive": TriageState.false_positive,
    "not_applicable": TriageState.not_applicable,
    "accepted_risk": TriageState.not_applicable,  # closest existing state
}

# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 1 — Auto-Triage
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/scans/{scan_id}/ai-triage", response_model=AITriageResultOut)
def trigger_ai_triage(
    scan_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AITriageResultOut:
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")
    if scan.status.value != "completed":
        raise HTTPException(400, "Scan must be completed before running AI triage")

    status = _get_job_status(_triage_key(scan_id))
    if status["status"] == "running":
        return AITriageResultOut(status="running", processed=status.get("processed", 0), total=status.get("total", 0))

    # Count untriaged findings for caller info
    triage_fps = {t.fingerprint for t in db.query(FindingTriage).filter(FindingTriage.client_id == scan.client_id).all()}
    total = db.query(Finding).filter(Finding.scan_id == scan_id, Finding.fingerprint.notin_(triage_fps) if triage_fps else True).count()

    _set_job_status(_triage_key(scan_id), {"status": "pending", "processed": 0, "total": total})

    from app.celery_client import send_ai_triage
    send_ai_triage(scan_id)

    write_audit_log(db, actor_user_id=user.id, action="ai.triage.trigger", resource_type="scan",
                    resource_id=str(scan_id), metadata={"untriaged_count": total},
                    ip=request.client.host if request.client else None)

    return AITriageResultOut(status="pending", total=total)


@router.get("/scans/{scan_id}/ai-triage", response_model=AITriageResultOut)
def get_ai_triage(
    scan_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AITriageResultOut:
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")

    st = _get_job_status(_triage_key(scan_id))
    suggestions = db.query(AiTriageSuggestion).filter(AiTriageSuggestion.scan_id == scan_id).all()

    return AITriageResultOut(
        status=st["status"],
        suggestions=[AITriageSuggestionOut.model_validate(s) for s in suggestions],
        processed=st.get("processed", len(suggestions)),
        total=st.get("total", len(suggestions)),
    )


@router.post("/scans/{scan_id}/ai-triage/{fingerprint}/accept")
def accept_ai_triage(
    scan_id: UUID,
    fingerprint: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")

    sugg = db.query(AiTriageSuggestion).filter(
        AiTriageSuggestion.scan_id == scan_id,
        AiTriageSuggestion.fingerprint == fingerprint,
    ).first()
    if not sugg:
        raise HTTPException(404, "AI triage suggestion not found")

    triage_state = _DECISION_MAP.get(sugg.suggested_decision, TriageState.valid)
    notes = f"AI-suggested ({sugg.suggested_decision}, {sugg.confidence}% confidence): {sugg.reasoning or ''}"
    notes = notes[:8000]

    row = db.query(FindingTriage).filter(
        FindingTriage.client_id == scan.client_id, FindingTriage.fingerprint == fingerprint
    ).first()
    if row:
        row.state = triage_state
        row.notes = notes
        row.updated_by = user.id
    else:
        row = FindingTriage(client_id=scan.client_id, fingerprint=fingerprint,
                            state=triage_state, notes=notes, updated_by=user.id)
        db.add(row)

    sugg.accepted = True
    db.commit()

    write_audit_log(db, actor_user_id=user.id, action="ai.triage.accept", resource_type="finding_triage",
                    resource_id=fingerprint[:64], metadata={"state": triage_state.value, "scan_id": str(scan_id)},
                    ip=request.client.host if request.client else None)

    return {"ok": True, "state": triage_state.value}


@router.post("/scans/{scan_id}/ai-triage/accept-all")
def accept_all_ai_triage(
    scan_id: UUID,
    body: AITriageAcceptAllIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")

    suggestions = db.query(AiTriageSuggestion).filter(
        AiTriageSuggestion.scan_id == scan_id,
        AiTriageSuggestion.accepted == False,  # noqa: E712
        AiTriageSuggestion.confidence >= body.min_confidence,
    ).all()

    accepted = 0
    for sugg in suggestions:
        triage_state = _DECISION_MAP.get(sugg.suggested_decision, TriageState.valid)
        notes = f"AI-suggested ({sugg.suggested_decision}, {sugg.confidence}% confidence): {sugg.reasoning or ''}"[:8000]
        row = db.query(FindingTriage).filter(
            FindingTriage.client_id == scan.client_id, FindingTriage.fingerprint == sugg.fingerprint
        ).first()
        if row:
            row.state = triage_state
            row.notes = notes
            row.updated_by = user.id
        else:
            db.add(FindingTriage(client_id=scan.client_id, fingerprint=sugg.fingerprint,
                                  state=triage_state, notes=notes, updated_by=user.id))
        sugg.accepted = True
        accepted += 1

    db.commit()
    write_audit_log(db, actor_user_id=user.id, action="ai.triage.accept_all", resource_type="scan",
                    resource_id=str(scan_id), metadata={"accepted": accepted, "min_confidence": body.min_confidence},
                    ip=request.client.host if request.client else None)

    return {"ok": True, "accepted": accepted}


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 2 — Remediation
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/findings/{finding_id}/ai-remediate", response_model=AIRemediationOut)
def ai_remediate(
    finding_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AIRemediationOut:
    f = db.get(Finding, finding_id)
    if not f:
        raise HTTPException(404, "Finding not found")

    # Return cached result if available
    cached = db.query(AiRemediation).filter(AiRemediation.finding_id == finding_id).first()
    if cached:
        content = cached.content
        return AIRemediationOut(
            finding_id=finding_id,
            cached=True,
            created_at=cached.created_at,
            **{k: content[k] for k in content if k in AIRemediationOut.model_fields},
        )

    # Extract context from raw_json
    raw = f.raw_json or {}
    finfo = raw.get("finding_info") or {}
    rem = raw.get("remediation") or {}
    title = finfo.get("title", "") if isinstance(finfo, dict) else ""
    status_extended = raw.get("message") or raw.get("status_detail") or f.description or ""
    remediation_text = rem.get("desc", "") if isinstance(rem, dict) else ""

    from app.services.ai_service import AIServiceError, get_ai_service

    try:
        ai = get_ai_service()
        prompt = f"""You are an Azure cloud security remediation expert. Given this security finding, provide detailed step-by-step remediation instructions specific to Azure.

Finding details:
- Check: {title or f.check_id}
- Severity: {f.severity.value}
- Service: {f.service}
- Resource: {f.resource_id}
- Region: {f.region}
- Issue: {status_extended}
- Existing guidance: {remediation_text}

Respond with a JSON object:
{{
  "summary": "One line summary of what needs to be done",
  "risk_explanation": "Why this is a security risk in 2-3 sentences",
  "steps": [
    {{
      "step_number": 1,
      "title": "Step title",
      "description": "Detailed explanation",
      "azure_cli": "az command here (if applicable, otherwise omit)",
      "azure_portal": "Portal navigation path (if applicable, otherwise omit)",
      "powershell": "PowerShell command (if applicable, otherwise omit)"
    }}
  ],
  "verification": "How to verify the fix was applied",
  "impact": "What impact this fix might have on running services",
  "estimated_effort": "quick"
}}

estimated_effort must be one of: quick (< 5 min), moderate (5-30 min), significant (> 30 min).
Provide real, working Azure CLI commands — not placeholders. Use the actual resource name/ID where possible.
Respond ONLY with valid JSON. No markdown."""

        content = ai.generate_json(prompt)

    except AIServiceError as exc:
        raise HTTPException(503, f"AI service unavailable: {exc}") from exc

    # Persist cache
    record = AiRemediation(finding_id=finding_id, content=content)
    db.add(record)
    db.commit()
    db.refresh(record)

    write_audit_log(db, actor_user_id=user.id, action="ai.remediate", resource_type="finding",
                    resource_id=str(finding_id), metadata={"check_id": f.check_id},
                    ip=request.client.host if request.client else None)

    return AIRemediationOut(
        finding_id=finding_id,
        cached=False,
        created_at=record.created_at,
        **{k: content[k] for k in content if k in AIRemediationOut.model_fields},
    )


@router.delete("/findings/{finding_id}/ai-remediate", status_code=204, response_model=None)
def clear_ai_remediation(
    finding_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Force re-generation by clearing the cached remediation."""
    db.query(AiRemediation).filter(AiRemediation.finding_id == finding_id).delete()
    db.commit()
    return Response(status_code=204)


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 3 — Executive Summary
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/scans/{scan_id}/ai-summary", response_model=AISummaryStatusOut)
def trigger_ai_summary(
    scan_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AISummaryStatusOut:
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")
    if scan.status.value != "completed":
        raise HTTPException(400, "Scan must be completed")

    st = _get_job_status(_summary_key(scan_id))
    if st["status"] == "running":
        return AISummaryStatusOut(status="running")

    _set_job_status(_summary_key(scan_id), {"status": "pending"})

    from app.celery_client import send_ai_summary
    send_ai_summary(scan_id)

    write_audit_log(db, actor_user_id=user.id, action="ai.summary.trigger", resource_type="scan",
                    resource_id=str(scan_id), metadata={},
                    ip=request.client.host if request.client else None)

    return AISummaryStatusOut(status="pending")


@router.get("/scans/{scan_id}/ai-summary", response_model=AISummaryStatusOut)
def get_ai_summary(
    scan_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AISummaryStatusOut:
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")

    row = db.query(AiSummary).filter(AiSummary.scan_id == scan_id).first()
    if row:
        c = row.content
        summary = AISummaryOut(
            scan_id=scan_id,
            overall_rating=c.get("overall_rating", "Unknown"),
            overall_score=c.get("overall_score", 0),
            executive_summary=c.get("executive_summary", ""),
            top_risks=[AISummaryRisk(**r) for r in (c.get("top_risks") or [])],
            quick_wins=[AISummaryQuickWin(**w) for w in (c.get("quick_wins") or [])],
            compliance_notes=c.get("compliance_notes", ""),
            next_steps=c.get("next_steps") or [],
            cached=True,
            created_at=row.created_at,
        )
        return AISummaryStatusOut(status="completed", summary=summary)

    st = _get_job_status(_summary_key(scan_id))
    return AISummaryStatusOut(status=st["status"], processed=st.get("processed", 0), total=st.get("total", 0))


@router.delete("/scans/{scan_id}/ai-summary", status_code=204, response_model=None)
def clear_ai_summary(
    scan_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    db.query(AiSummary).filter(AiSummary.scan_id == scan_id).delete()
    db.commit()
    r = get_redis()
    r.delete(_summary_key(scan_id))
    return Response(status_code=204)


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 4 — Smart Grouping
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/scans/{scan_id}/ai-group", response_model=AIGroupingStatusOut)
def trigger_ai_group(
    scan_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AIGroupingStatusOut:
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")
    if scan.status.value != "completed":
        raise HTTPException(400, "Scan must be completed")

    st = _get_job_status(_group_key(scan_id))
    if st["status"] == "running":
        return AIGroupingStatusOut(status="running")

    _set_job_status(_group_key(scan_id), {"status": "pending"})

    from app.celery_client import send_ai_group
    send_ai_group(scan_id)

    write_audit_log(db, actor_user_id=user.id, action="ai.group.trigger", resource_type="scan",
                    resource_id=str(scan_id), metadata={},
                    ip=request.client.host if request.client else None)

    return AIGroupingStatusOut(status="pending")


@router.get("/scans/{scan_id}/ai-group", response_model=AIGroupingStatusOut)
def get_ai_group(
    scan_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AIGroupingStatusOut:
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")

    row = db.query(AiFindingGroups).filter(AiFindingGroups.scan_id == scan_id).first()
    if row:
        total_findings = db.query(Finding).filter(Finding.scan_id == scan_id).count()
        groups = [AISmartGroup(**g) for g in (row.groups_data or [])]
        grouping = AIGroupingOut(
            scan_id=scan_id,
            groups=groups,
            total_findings=total_findings,
            group_count=len(groups),
            cached=True,
            created_at=row.created_at,
        )
        return AIGroupingStatusOut(status="completed", grouping=grouping)

    st = _get_job_status(_group_key(scan_id))
    return AIGroupingStatusOut(status=st["status"])


@router.delete("/scans/{scan_id}/ai-group", status_code=204, response_model=None)
def clear_ai_group(
    scan_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    db.query(AiFindingGroups).filter(AiFindingGroups.scan_id == scan_id).delete()
    db.commit()
    r = get_redis()
    r.delete(_group_key(scan_id))
    return Response(status_code=204)
