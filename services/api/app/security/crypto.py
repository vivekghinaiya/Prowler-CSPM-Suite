"""Credential encryption at rest using Fernet (AES-128 CBC + HMAC).

For production cloud deployment, replace get_fernet() with a KMS-backed
implementation that decrypts a data key; the interface (encrypt_bytes/decrypt_bytes)
can remain stable.
"""

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from pydantic import BaseModel

from app.config import get_settings


class KmsDecryptPlaceholder:
    """Reserved for Azure Key Vault integration."""

    def decrypt_data_key(self, _ciphertext: bytes) -> bytes:
        raise NotImplementedError("KMS backend not configured")


def _dev_fernet_key_from_secret(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet() -> Fernet:
    settings = get_settings()
    if settings.encryption_key:
        return Fernet(settings.encryption_key.encode() if isinstance(settings.encryption_key, str) else settings.encryption_key)
    # Development only: derive from JWT secret (not for production).
    return Fernet(_dev_fernet_key_from_secret(settings.jwt_secret))


def encrypt_json_payload(data: dict[str, Any]) -> bytes:
    f = get_fernet()
    raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
    return f.encrypt(raw)


def decrypt_json_payload(ciphertext: bytes) -> dict[str, Any]:
    f = get_fernet()
    try:
        raw = f.decrypt(ciphertext)
    except InvalidToken as e:
        raise ValueError("Invalid credential ciphertext or wrong encryption key") from e
    return json.loads(raw.decode("utf-8"))


class AzureServicePrincipalPayload(BaseModel):
    tenant_id: str
    client_id: str
    client_secret: str
    subscription_ids: list[str] = []
