"""Pydantic schemas for AI feature endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────────────────────
# Shared
# ──────────────────────────────────────────────────────────────────────────────

class AIJobStatus(BaseModel):
    """Lightweight status response while an AI job runs asynchronously."""

    status: str  # not_started | pending | running | completed | failed
    processed: int = 0
    total: int = 0
    error: str | None = None


# ──────────────────────────────────────────────────────────────────────────────
# Feature 1 — Auto-Triage
# ──────────────────────────────────────────────────────────────────────────────

class AITriageSuggestionOut(BaseModel):
    id: uuid.UUID
    scan_id: uuid.UUID
    fingerprint: str
    suggested_decision: str
    confidence: int
    reasoning: str | None
    priority: str
    accepted: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AITriageResultOut(BaseModel):
    status: str
    suggestions: list[AITriageSuggestionOut] = []
    processed: int = 0
    total: int = 0


class AITriageAcceptAllIn(BaseModel):
    min_confidence: int = Field(default=80, ge=0, le=100)


# ──────────────────────────────────────────────────────────────────────────────
# Feature 2 — Remediation
# ──────────────────────────────────────────────────────────────────────────────

class AIRemediationStep(BaseModel):
    step_number: int
    title: str
    description: str
    azure_cli: str | None = None
    azure_portal: str | None = None
    powershell: str | None = None


class AIRemediationOut(BaseModel):
    finding_id: uuid.UUID
    summary: str
    risk_explanation: str
    steps: list[AIRemediationStep]
    verification: str
    impact: str
    estimated_effort: str  # quick | moderate | significant
    cached: bool = False
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


# ──────────────────────────────────────────────────────────────────────────────
# Feature 3 — Executive Summary
# ──────────────────────────────────────────────────────────────────────────────

class AISummaryRisk(BaseModel):
    rank: int
    title: str
    description: str
    affected_resources: int
    recommendation: str


class AISummaryQuickWin(BaseModel):
    title: str
    description: str
    impact: str
    effort: str


class AISummaryOut(BaseModel):
    scan_id: uuid.UUID
    overall_rating: str
    overall_score: int
    executive_summary: str
    top_risks: list[AISummaryRisk]
    quick_wins: list[AISummaryQuickWin]
    compliance_notes: str
    next_steps: list[str]
    cached: bool = False
    created_at: datetime | None = None


class AISummaryStatusOut(BaseModel):
    status: str
    summary: AISummaryOut | None = None
    processed: int = 0
    total: int = 0


# ──────────────────────────────────────────────────────────────────────────────
# Feature 4 — Smart Grouping
# ──────────────────────────────────────────────────────────────────────────────

class AISmartGroup(BaseModel):
    group_id: str
    title: str
    root_cause: str
    single_fix: str
    finding_fingerprints: list[str]
    finding_count: int
    max_severity: str
    affected_services: list[str]
    effort_to_fix: str  # quick | moderate | significant


class AIGroupingOut(BaseModel):
    scan_id: uuid.UUID
    groups: list[AISmartGroup]
    total_findings: int
    group_count: int
    cached: bool = False
    created_at: datetime | None = None


class AIGroupingStatusOut(BaseModel):
    status: str
    grouping: AIGroupingOut | None = None
