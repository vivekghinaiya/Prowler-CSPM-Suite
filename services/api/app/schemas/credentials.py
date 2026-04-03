from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.credential import CredentialAuthMethod, CredentialProvider


class AzureServicePrincipalIn(BaseModel):
    tenant_id: str = Field(..., min_length=1, max_length=128)
    client_id: str = Field(..., min_length=1, max_length=128)
    client_secret: str = Field(..., min_length=1, max_length=512)
    subscription_ids: list[str] = Field(default_factory=list)


class AzureSubscriptionOnlyIn(BaseModel):
    """Used for managed_identity and cli auth methods — no secrets required."""

    subscription_ids: list[str] = Field(default_factory=list)


class CredentialCreate(BaseModel):
    label: str = Field(default="default", max_length=255)
    auth_method: CredentialAuthMethod = CredentialAuthMethod.service_principal
    azure_sp: AzureServicePrincipalIn | None = None
    azure_sub: AzureSubscriptionOnlyIn | None = None

    def payload_dict(self) -> dict:
        if self.auth_method == CredentialAuthMethod.service_principal:
            if not self.azure_sp:
                raise ValueError("azure_sp required for service_principal auth")
            return {"azure": self.azure_sp.model_dump()}
        # managed_identity / cli — no secrets, just optional subscription IDs
        sub_ids = self.azure_sub.subscription_ids if self.azure_sub else []
        return {"azure": {"subscription_ids": sub_ids}}


class CredentialOut(BaseModel):
    id: UUID
    client_id: UUID
    provider: CredentialProvider
    label: str
    auth_method: CredentialAuthMethod
    created_at: datetime

    model_config = {"from_attributes": True}


class CredentialTestResult(BaseModel):
    tenant_id: str
    subscription_count: int
