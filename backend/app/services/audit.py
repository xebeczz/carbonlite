from __future__ import annotations

from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from ..models import AuditLog


def log_audit(
    db: Session,
    entity: str,
    entity_id: int,
    action: str,
    *,
    old_value: Any = None,
    new_value: Any = None,
    actor: str = "user",
) -> AuditLog:
    entry = AuditLog(
        entity=entity,
        entity_id=entity_id,
        action=action,
        old_value=jsonable_encoder(old_value) if old_value is not None else None,
        new_value=jsonable_encoder(new_value) if new_value is not None else None,
        actor=actor,
    )
    db.add(entry)
    return entry


def audit_dict(entry: AuditLog) -> dict:
    return {
        "id": entry.id,
        "entity": entry.entity,
        "entity_id": entry.entity_id,
        "action": entry.action,
        "old_value": entry.old_value,
        "new_value": entry.new_value,
        "actor": entry.actor,
        "timestamp": entry.timestamp.isoformat() + "Z" if entry.timestamp else None,
    }
