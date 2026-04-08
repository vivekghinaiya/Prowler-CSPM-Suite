"""AI feature tables: auto-triage suggestions, remediations, summaries, smart groups.

Revision ID: 004
Revises: 003
Create Date: 2026-04-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── ai_triage_suggestions ────────────────────────────────────────────────
    op.create_table(
        "ai_triage_suggestions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("suggested_decision", sa.String(32), nullable=False),
        sa.Column("confidence", sa.Integer, nullable=False, server_default="0"),
        sa.Column("reasoning", sa.Text, nullable=True),
        sa.Column("priority", sa.String(16), nullable=False, server_default="low"),
        sa.Column("accepted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_ai_triage_scan_id", "ai_triage_suggestions", ["scan_id"])
    op.create_index("ix_ai_triage_fingerprint", "ai_triage_suggestions", ["fingerprint"])

    # ── ai_remediations ──────────────────────────────────────────────────────
    op.create_table(
        "ai_remediations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("finding_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("findings.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("content", postgresql.JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_ai_remediations_finding_id", "ai_remediations", ["finding_id"])

    # ── ai_summaries ─────────────────────────────────────────────────────────
    op.create_table(
        "ai_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", postgresql.JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_ai_summaries_scan_id", "ai_summaries", ["scan_id"])
    op.create_index("ix_ai_summaries_client_id", "ai_summaries", ["client_id"])

    # ── ai_finding_groups ────────────────────────────────────────────────────
    op.create_table(
        "ai_finding_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("groups_data", postgresql.JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_ai_finding_groups_scan_id", "ai_finding_groups", ["scan_id"])


def downgrade() -> None:
    op.drop_table("ai_finding_groups")
    op.drop_table("ai_summaries")
    op.drop_table("ai_remediations")
    op.drop_table("ai_triage_suggestions")
