"""azure only — remove aws/gcp credentials and update enums

Revision ID: 003
Revises: 002
Create Date: 2026-04-03

This migration:
  1. Deletes any credentials that were stored with provider = 'aws' or 'gcp'.
  2. Replaces the credential_provider enum with a single 'azure' value.
  3. Replaces the credential_auth_method enum (static_keys/assume_role) with
     the Azure-specific values (service_principal/managed_identity/cli),
     mapping existing 'static_keys' rows to 'service_principal'.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Remove any AWS / GCP credentials (safe — they can never run Azure scans)
    op.execute("DELETE FROM credentials WHERE provider IN ('aws', 'gcp')")

    # 2. Replace credential_provider enum
    #    PostgreSQL doesn't allow removing enum values directly; we must recreate the type.
    op.execute("ALTER TABLE credentials ALTER COLUMN provider TYPE VARCHAR(64)")
    op.execute("DROP TYPE IF EXISTS credential_provider")
    op.execute("CREATE TYPE credential_provider AS ENUM ('azure')")
    op.execute(
        "ALTER TABLE credentials ALTER COLUMN provider TYPE credential_provider "
        "USING 'azure'::credential_provider"
    )

    # 3. Replace credential_auth_method enum
    #    Map legacy 'static_keys' → 'service_principal'; drop 'assume_role' (only on AWS rows
    #    which were deleted above).
    op.execute("ALTER TABLE credentials ALTER COLUMN auth_method TYPE VARCHAR(64)")
    op.execute(
        """
        UPDATE credentials
        SET auth_method = 'service_principal'
        WHERE auth_method = 'static_keys'
        """
    )
    op.execute("DROP TYPE IF EXISTS credential_auth_method")
    op.execute(
        "CREATE TYPE credential_auth_method AS ENUM ('service_principal', 'managed_identity', 'cli')"
    )
    op.execute(
        "ALTER TABLE credentials ALTER COLUMN auth_method TYPE credential_auth_method "
        "USING auth_method::credential_auth_method"
    )


def downgrade() -> None:
    # Restore old auth_method enum (data loss: azure-specific values become static_keys)
    op.execute("ALTER TABLE credentials ALTER COLUMN auth_method TYPE VARCHAR(64)")
    op.execute(
        """
        UPDATE credentials
        SET auth_method = 'static_keys'
        WHERE auth_method IN ('service_principal', 'managed_identity', 'cli')
        """
    )
    op.execute("DROP TYPE IF EXISTS credential_auth_method")
    op.execute("CREATE TYPE credential_auth_method AS ENUM ('static_keys', 'assume_role')")
    op.execute(
        "ALTER TABLE credentials ALTER COLUMN auth_method TYPE credential_auth_method "
        "USING auth_method::credential_auth_method"
    )

    # Restore old provider enum
    op.execute("ALTER TABLE credentials ALTER COLUMN provider TYPE VARCHAR(64)")
    op.execute("DROP TYPE IF EXISTS credential_provider")
    op.execute("CREATE TYPE credential_provider AS ENUM ('aws', 'azure', 'gcp')")
    op.execute(
        "ALTER TABLE credentials ALTER COLUMN provider TYPE credential_provider "
        "USING provider::credential_provider"
    )
