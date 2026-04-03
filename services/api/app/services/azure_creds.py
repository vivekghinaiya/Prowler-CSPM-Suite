"""Resolve Azure environment variables for Prowler from decrypted credential payloads,
and provide connectivity testing via azure-identity + azure-mgmt-subscription.
"""

from __future__ import annotations

from app.models.credential import CredentialAuthMethod
from app.security.crypto import decrypt_json_payload


def resolve_azure_env_for_credential(
    ciphertext: bytes,
    auth_method: CredentialAuthMethod,
) -> tuple[dict[str, str], str]:
    """Return (azure_env_vars, prowler_auth_flag).

    azure_env_vars  — AZURE_* variables injected into the Prowler container.
    prowler_auth_flag — one of ``--sp-env-auth``, ``--managed-identity-auth``,
                        ``--cli-auth`` passed to ``prowler azure``.
    """
    data = decrypt_json_payload(ciphertext)
    azure = data.get("azure", data)

    env: dict[str, str] = {}

    if auth_method == CredentialAuthMethod.service_principal:
        env["AZURE_CLIENT_ID"] = azure["client_id"]
        env["AZURE_CLIENT_SECRET"] = azure["client_secret"]
        env["AZURE_TENANT_ID"] = azure["tenant_id"]
        auth_flag = "--sp-env-auth"
    elif auth_method == CredentialAuthMethod.managed_identity:
        auth_flag = "--managed-identity-auth"
    elif auth_method == CredentialAuthMethod.cli:
        auth_flag = "--cli-auth"
    else:
        raise ValueError(f"Unsupported Azure auth method: {auth_method}")

    sub_ids: list[str] = azure.get("subscription_ids", [])
    if sub_ids:
        env["AZURE_SUBSCRIPTION_IDS"] = " ".join(sub_ids)

    return env, auth_flag


def test_azure_credential(ciphertext: bytes) -> dict[str, object]:
    """Test service principal connectivity by listing accessible subscriptions.

    Requires ``azure-identity`` and ``azure-mgmt-subscription`` packages.
    Only applicable to service_principal credentials (requires client secret).
    """
    from azure.identity import ClientSecretCredential  # type: ignore[import-untyped]
    from azure.mgmt.subscription import SubscriptionClient  # type: ignore[import-untyped]

    data = decrypt_json_payload(ciphertext)
    azure = data.get("azure", data)

    credential = ClientSecretCredential(
        tenant_id=azure["tenant_id"],
        client_id=azure["client_id"],
        client_secret=azure["client_secret"],
    )
    sub_client = SubscriptionClient(credential)
    subscriptions = list(sub_client.subscriptions.list())
    return {
        "tenant_id": azure["tenant_id"],
        "subscription_count": len(subscriptions),
    }
