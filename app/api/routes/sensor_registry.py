from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel

from app.api.routes.auth import get_db, require_roles
from app.db.models.sensor_model import SensorGroup, Sensor

router = APIRouter(prefix="/sensors", tags=["sensors"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SensorGroupResponse(BaseModel):
    id: int
    name: str
    display_name: str
    color: Optional[str]
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class SensorGroupUpdate(BaseModel):
    display_name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class SensorResponse(BaseModel):
    id: int
    group_id: int
    metric_name: str
    display_name: str
    sort_order: int
    is_active: bool
    group_name: Optional[str] = None
    group_display_name: Optional[str] = None
    group_color: Optional[str] = None
    group_sort_order: Optional[int] = None

    model_config = {"from_attributes": True}


class SensorUpdate(BaseModel):
    display_name: Optional[str] = None
    sort_order: Optional[int] = None


class ReorderItem(BaseModel):
    id: int
    sort_order: int


class ReorderRequest(BaseModel):
    items: List[ReorderItem]


# ─── Groups ──────────────────────────────────────────────────────────────────

@router.get("/groups", response_model=List[SensorGroupResponse])
async def list_sensor_groups(db: AsyncSession = Depends(get_db)):
    query = (
        select(SensorGroup)
        .where(SensorGroup.is_active == True)
        .order_by(SensorGroup.sort_order)
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.put("/groups/reorder")
async def reorder_sensor_groups(
    data: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("sensors:configs:edit")),
):
    for item in data.items:
        await db.execute(
            update(SensorGroup)
            .where(SensorGroup.id == item.id)
            .values(sort_order=item.sort_order)
        )
    await db.commit()

    # Update Redis cache
    try:
        from app.core.redis_client import preload_sensor_configs_cache
        await preload_sensor_configs_cache()
    except Exception:
        pass

    return {"status": "ok", "updated": len(data.items)}


@router.put("/groups/{group_id}", response_model=SensorGroupResponse)
async def update_sensor_group(
    group_id: int,
    data: SensorGroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("sensors:configs:edit")),
):
    group = await db.get(SensorGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if data.display_name is not None:
        group.display_name = data.display_name
    if data.color is not None:
        group.color = data.color
    if data.sort_order is not None:
        group.sort_order = data.sort_order

    await db.commit()
    await db.refresh(group)
    return group


# ─── Sensors (Registry) ──────────────────────────────────────────────────────

@router.get("/registry", response_model=List[SensorResponse])
async def list_sensors(
    group_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Sensor, SensorGroup)
        .join(SensorGroup, Sensor.group_id == SensorGroup.id)
        .where(Sensor.is_active == True)
        .order_by(SensorGroup.sort_order, Sensor.sort_order)
    )
    if group_id:
        query = query.where(Sensor.group_id == group_id)

    result = await db.execute(query)
    rows = result.all()

    return [
        SensorResponse(
            id=sensor.id,
            group_id=sensor.group_id,
            metric_name=sensor.metric_name,
            display_name=sensor.display_name,
            sort_order=sensor.sort_order,
            is_active=sensor.is_active,
            group_name=group.name,
            group_display_name=group.display_name,
            group_color=group.color,
            group_sort_order=group.sort_order,
        )
        for sensor, group in rows
    ]


@router.put("/registry/reorder")
async def reorder_sensors(
    data: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("sensors:configs:edit")),
):
    for item in data.items:
        await db.execute(
            update(Sensor)
            .where(Sensor.id == item.id)
            .values(sort_order=item.sort_order)
        )
    await db.commit()

    # Update Redis cache
    try:
        from app.core.redis_client import preload_sensor_configs_cache
        await preload_sensor_configs_cache()
    except Exception:
        pass

    return {"status": "ok", "updated": len(data.items)}


@router.put("/registry/{sensor_id}", response_model=SensorResponse)
async def update_sensor(
    sensor_id: int,
    data: SensorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("sensors:configs:edit")),
):
    sensor = await db.get(Sensor, sensor_id)
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")

    if data.display_name is not None:
        sensor.display_name = data.display_name
    if data.sort_order is not None:
        sensor.sort_order = data.sort_order

    await db.commit()
    await db.refresh(sensor)

    group = await db.get(SensorGroup, sensor.group_id)

    return SensorResponse(
        id=sensor.id,
        group_id=sensor.group_id,
        metric_name=sensor.metric_name,
        display_name=sensor.display_name,
        sort_order=sensor.sort_order,
        is_active=sensor.is_active,
        group_name=group.name if group else None,
        group_display_name=group.display_name if group else None,
        group_color=group.color if group else None,
        group_sort_order=group.sort_order if group else None,
    )
