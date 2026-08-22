import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.routes.auth import get_db, require_roles
from app.core.audit_log import create_audit_log
from app.db.models.support_team_model import (
    SupportTeam,
    SupportTeamBase,
    SupportTeamResponse,
)

router = APIRouter(prefix="/support-team", tags=["Support Team"])
logger = logging.getLogger(__name__)


def _support_team_snapshot(member: SupportTeam | None) -> dict | None:
    if not member:
        return None

    return {
        "id": member.id,
        "name_th": member.name_th,
        "name_en": member.name_en,
        "role_th": member.role_th,
        "role_en": member.role_en,
        "profile_image": member.profile_image,
    }


# ----------------------------------------------------
# CRUD ROUTE HANDLERS
# ----------------------------------------------------


@router.post("", response_model=SupportTeamResponse, status_code=status.HTTP_201_CREATED)
async def create_member(
    payload: SupportTeamBase,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("support:create")),
):
    try:
        new_member = SupportTeam(**payload.model_dump())
        db.add(new_member)
        await db.flush()

        await create_audit_log(
            db,
            request,
            current_user,
            action="create",
            entity="support_team",
            entity_id=str(new_member.id),
            new_data=_support_team_snapshot(new_member),
        )

        await db.commit()
        await db.refresh(new_member)
        return new_member
    except Exception as e:
        logger.error("Error creating support member: %s", str(e))
        await db.rollback()
        raise HTTPException(status_code=500, detail="Could not create support member")


@router.get("", response_model=List[SupportTeamResponse])
async def get_all_members(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(SupportTeam).order_by(SupportTeam.id))
        members = result.scalars().all()
        return members
    except Exception as e:
        logger.error("Error fetching support members: %s", str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{member_id}", response_model=SupportTeamResponse)
async def get_member_by_id(member_id: int, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(SupportTeam).where(SupportTeam.id == member_id)
        )
        member = result.scalars().first()

        if not member:
            raise HTTPException(status_code=404, detail="Support member not found")

        return member
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching member %s: %s", member_id, str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{member_id}", response_model=SupportTeamResponse)
async def update_member(
    member_id: int,
    payload: SupportTeamBase,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("support:edit")),
):
    try:
        result = await db.execute(
            select(SupportTeam).where(SupportTeam.id == member_id)
        )
        member = result.scalars().first()

        if not member:
            raise HTTPException(status_code=404, detail="Support member not found")

        old_data = _support_team_snapshot(member)

        for key, value in payload.model_dump().items():
            setattr(member, key, value)

        await create_audit_log(
            db,
            request,
            current_user,
            action="update",
            entity="support_team",
            entity_id=str(member_id),
            old_data=old_data,
            new_data=_support_team_snapshot(member),
        )

        await db.commit()
        await db.refresh(member)
        return member
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating member %s: %s", member_id, str(e))
        await db.rollback()
        raise HTTPException(status_code=500, detail="Could not update support member")


@router.delete("/{member_id}", status_code=status.HTTP_200_OK)
async def delete_member(
    member_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("support:delete")),
):
    try:
        result = await db.execute(
            select(SupportTeam).where(SupportTeam.id == member_id)
        )
        member = result.scalars().first()

        if not member:
            raise HTTPException(status_code=404, detail="Support member not found")

        old_data = _support_team_snapshot(member)

        await create_audit_log(
            db,
            request,
            current_user,
            action="delete",
            entity="support_team",
            entity_id=str(member_id),
            old_data=old_data,
            new_data={"deleted": True},
        )

        await db.delete(member)
        await db.commit()

        return {"message": f"Successfully deleted member ID {member_id}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting member %s: %s", member_id, str(e))
        await db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete support member")
