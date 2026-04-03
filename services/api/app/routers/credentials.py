from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.client import Client
from app.models.credential import Credential, CredentialProvider
from app.models.user import User
from app.schemas.credentials import CredentialCreate, CredentialOut, CredentialTestResult
from app.security.audit_log import write_audit_log
from app.security.crypto import encrypt_json_payload
from app.services.azure_creds import test_azure_credential

router = APIRouter(tags=["credentials"])


@router.get("/clients/{client_id}/credentials", response_model=list[CredentialOut])
def list_credentials(
    client_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Credential]:
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return db.query(Credential).filter(Credential.client_id == client_id).order_by(Credential.created_at.desc()).all()


@router.post("/clients/{client_id}/credentials", response_model=CredentialOut, status_code=status.HTTP_201_CREATED)
def create_credential(
    client_id: UUID,
    body: CredentialCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Credential:
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    try:
        payload = body.payload_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    ciphertext = encrypt_json_payload(payload)
    cred = Credential(
        client_id=client_id,
        provider=CredentialProvider.azure,
        label=body.label,
        auth_method=body.auth_method,
        ciphertext=ciphertext,
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    write_audit_log(
        db,
        actor_user_id=user.id,
        action="credential.create",
        resource_type="credential",
        resource_id=str(cred.id),
        metadata={"client_id": str(client_id)},
        ip=request.client.host if request.client else None,
    )
    return cred


@router.delete("/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credential(
    credential_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    cred = db.get(Credential, credential_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    db.delete(cred)
    db.commit()
    write_audit_log(
        db,
        actor_user_id=user.id,
        action="credential.delete",
        resource_type="credential",
        resource_id=str(credential_id),
        ip=request.client.host if request.client else None,
    )


@router.post("/credentials/{credential_id}/test", response_model=CredentialTestResult)
def test_credential(
    credential_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CredentialTestResult:
    cred = db.get(Credential, credential_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    try:
        result = test_azure_credential(cred.ciphertext)
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Azure connectivity test failed: {e}") from e
    return CredentialTestResult(**result)
