from collections.abc import Mapping
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_log_model import AuditLog


def _get_value(source: Any, key: str, default: Any = None) -> Any:
    if source is None:
        return default

    if isinstance(source, Mapping):
        return source.get(key, default)

    return getattr(source, key, default)


def _normalize_json_data(data: Any) -> Any:
    if data is None:
        return None

    if hasattr(data, "model_dump"):
        dumped = data.model_dump()
        return _normalize_json_data(dumped)

    if isinstance(data, Mapping):
        return {str(key): _normalize_json_data(value) for key, value in data.items()}

    if isinstance(data, (list, tuple, set)):
        return [_normalize_json_data(item) for item in data]

    if isinstance(data, (str, int, float, bool)):
        return data

    return str(data)


def get_forwarded_for(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        forwarded_for = forwarded_for.strip()
        return forwarded_for or None
    return None


def get_real_ip(request: Request) -> str | None:
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        real_ip = real_ip.strip()
        return real_ip or None
    return None


def get_client_ip(request: Request) -> str | None:
    forwarded_for = get_forwarded_for(request)
    if forwarded_for:
        ip = forwarded_for.split(",")[0].strip()
        if ip:
            return ip

    real_ip = get_real_ip(request)
    if real_ip:
        return real_ip

    client = getattr(request, "client", None)
    host = getattr(client, "host", None)
    return host if host else None


def _build_request_meta(request: Request) -> dict[str, Any]:
    client = getattr(request, "client", None)
    client_host = getattr(client, "host", None)
    forwarded_for = get_forwarded_for(request)
    real_ip = get_real_ip(request)
    client_ip = get_client_ip(request)

    return {
        "client_ip": client_ip,
        "forwarded_for": forwarded_for,
        "real_ip": real_ip,
        "client_host": client_host,
        "user_agent": request.headers.get("user-agent"),
    }


async def create_audit_log(
    db: AsyncSession,
    request: Request,
    current_user,
    action: str,
    entity: str,
    entity_id: str | None = None,
    old_data: Any | None = None,
    new_data: Any | None = None,
    *,
    flush: bool = False,
) -> AuditLog:
    """Create an audit log entry for an important action.

    The caller usually commits as part of its own unit of work. Pass flush=True
    when you need the audit row's id before returning.
    """

    request_meta = _build_request_meta(request)
    normalized_old_data = _normalize_json_data(old_data)
    normalized_new_data = _normalize_json_data(new_data)

    if isinstance(normalized_new_data, dict):
        normalized_new_data = {
            **normalized_new_data,
            "request_meta": request_meta,
        }
    elif normalized_new_data is not None:
        normalized_new_data = {
            "value": normalized_new_data,
            "request_meta": request_meta,
        }
    else:
        normalized_new_data = {"request_meta": request_meta}

    log = AuditLog(
        user_id=_get_value(current_user, "id"),
        username=_get_value(current_user, "username"),
        action=action.strip(),
        entity=entity.strip(),
        entity_id=str(entity_id) if entity_id is not None else None,
        old_data=normalized_old_data,
        new_data=normalized_new_data,
        ip_address=request_meta.get("client_ip"),
        user_agent=request_meta.get("user_agent"),
    )

    db.add(log)

    if flush:
        await db.flush()

    return log
