from fastapi import APIRouter, Depends, Query
from datetime import datetime
from sqlalchemy import select, func, Integer as SAInt, asc, desc, or_, cast, String

# from sqlalchemy.orm import aliased
from app.db.models.audit_log_model import AuditLog
from app.db.models.auth_model import User
from app.api.routes.auth import get_db, require_roles, get_current_user
from app.core.audit_log import create_audit_log
from pydantic import BaseModel
from typing import Optional, Any
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])

class AuditLogCreateRequest(BaseModel):
    action: str
    entity: str
    entity_id: Optional[str] = None
    old_data: Optional[Any] = None
    new_data: Optional[Any] = None

@router.post("")
async def create_audit_log_entry(
    payload: AuditLogCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = await create_audit_log(
        db=db,
        request=request,
        current_user=current_user,
        action=payload.action,
        entity=payload.entity,
        entity_id=payload.entity_id,
        old_data=payload.old_data,
        new_data=payload.new_data,
        flush=True,
    )
    await db.commit()
    return {"status": "success", "id": log.id}


ALLOWED_AUDIT_LOG_SORT_KEYS = {
    "created_at",
    "username",
    "action",
    "entity",
    "entity_id",
    "ip_address",
    "user_agent",
}

@router.get("/filters")
async def get_audit_log_filters(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("audit_log:read")),
):
    actions_stmt = select(AuditLog.action).distinct().where(AuditLog.action.isnot(None)).order_by(AuditLog.action)
    entities_stmt = select(AuditLog.entity).distinct().where(AuditLog.entity.isnot(None)).order_by(AuditLog.entity)
    usernames_stmt = select(AuditLog.username).distinct().where(AuditLog.username.isnot(None)).order_by(AuditLog.username)

    actions = (await db.execute(actions_stmt)).scalars().all()
    entities = (await db.execute(entities_stmt)).scalars().all()
    usernames = (await db.execute(usernames_stmt)).scalars().all()

    return {
        "actions": list(actions),
        "entities": list(entities),
        "usernames": list(usernames),
    }

@router.get("")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=10000),
    search: str = Query("", max_length=100),
    start_time: Optional[datetime] = Query(None),
    stop_time: Optional[datetime] = Query(None),
    action: Optional[str] = Query(None),
    entity: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    sort_key: str = Query("created_at"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("audit_log:read")),
):
    stmt = select(AuditLog)

    if start_time:
        stmt = stmt.where(AuditLog.created_at >= start_time)
    if stop_time:
        stmt = stmt.where(AuditLog.created_at <= stop_time)
    if action and action != "all":
        stmt = stmt.where(AuditLog.action == action)
    if entity and entity != "all":
        stmt = stmt.where(AuditLog.entity == entity)
    if username and username != "all":
        stmt = stmt.where(AuditLog.username == username)

    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                AuditLog.username.ilike(like),
                AuditLog.action.ilike(like),
                AuditLog.entity.ilike(like),
                AuditLog.entity_id.ilike(like),
                cast(AuditLog.user_id, String).ilike(like),
                cast(AuditLog.ip_address, String).ilike(like),
                cast(AuditLog.user_agent, String).ilike(like),
                cast(AuditLog.old_data, String).ilike(like),
                cast(AuditLog.new_data, String).ilike(like),
            )
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = (await db.execute(count_stmt)).scalar() or 0

    sort_col_name = sort_key if sort_key in ALLOWED_AUDIT_LOG_SORT_KEYS else "created_at"
    sort_columns = {
        "created_at": AuditLog.created_at,
        "username": AuditLog.username,
        "action": AuditLog.action,
        "entity": AuditLog.entity,
        "entity_id": AuditLog.entity_id,
        "ip_address": AuditLog.ip_address,
        "user_agent": AuditLog.user_agent,
    }
    sort_col = sort_columns.get(sort_col_name, AuditLog.created_at)

    if sort_dir == "asc":
        stmt = stmt.order_by(asc(sort_col), asc(AuditLog.id))
    else:
        stmt = stmt.order_by(desc(sort_col), desc(AuditLog.id))

    rows = (await db.execute(stmt.offset((page - 1) * limit).limit(limit))).scalars().all()

    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": -(-total_count // limit) if limit > 0 else 1,
        "items": [
            {
                "id": row.id,
                "created_at": row.created_at,
                "user_id": row.user_id,
                "username": row.username,
                "action": row.action,
                "entity": row.entity,
                "entity_id": row.entity_id,
                "old_data": row.old_data,
                "new_data": row.new_data,
                "ip_address": row.ip_address,
                "user_agent": row.user_agent,
            }
            for row in rows
        ],
    }