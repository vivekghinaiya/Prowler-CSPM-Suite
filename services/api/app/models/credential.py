import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, LargeBinary, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CredentialProvider(str, enum.Enum):
    azure = "azure"


class CredentialAuthMethod(str, enum.Enum):
    service_principal = "service_principal"
    managed_identity = "managed_identity"
    cli = "cli"


class Credential(Base):
    __tablename__ = "credentials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    provider: Mapped[CredentialProvider] = mapped_column(
        SAEnum(CredentialProvider, name="credential_provider"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False, default="default")
    auth_method: Mapped[CredentialAuthMethod] = mapped_column(
        SAEnum(CredentialAuthMethod, name="credential_auth_method"),
        nullable=False,
    )
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    encryption_key_id: Mapped[str] = mapped_column(String(64), nullable=False, default="fernet-v1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
