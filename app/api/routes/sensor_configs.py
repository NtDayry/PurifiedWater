from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, outerjoin
from pydantic import BaseModel, Field

from app.api.routes.auth import get_db, require_roles
from app.core.audit_log import create_audit_log
from app.db.models.sensor_model import SensorConfig, Sensor, SensorGroup

router = APIRouter(prefix="/sensors", tags=["sensors"])

class SensorConfigCreate(BaseModel):
    device_name: str
    metric_name: str
    decode_type: str
    raw_min: int = 0
    raw_max: int = 20000
    range_min: float = 0.0
    range_max: float = 100.0
    unit: Optional[str] = None
    decimal_places: int = 2

class SensorConfigUpdate(BaseModel):
    decode_type: str
    raw_min: int = 0
    raw_max: int = 20000
    range_min: float = 0.0
    range_max: float = 100.0
    unit: Optional[str] = None
    decimal_places: int = 2

class SensorConfigResponse(SensorConfigCreate):
    id: int
    sensor_id: Optional[int] = None
    is_active: bool
    superseded_by: Optional[int]
    alert_enabled: bool = False
    alert_min: Optional[float] = None
    alert_max: Optional[float] = None
    max_range: Optional[float] = None

    model_config = {"from_attributes": True}


@router.get("/configs", response_model=List[SensorConfigResponse])
async def list_sensor_configs(
    device_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    if not device_name:
        try:
            from app.core.redis_client import get_sensor_configs_cache
            cached = await get_sensor_configs_cache()
            if cached is not None:
                return cached
        except Exception:
            pass

    # Join with sensors and sensor_groups for sort_order
    query = (
        select(SensorConfig)
        .outerjoin(Sensor, SensorConfig.sensor_id == Sensor.id)
        .outerjoin(SensorGroup, Sensor.group_id == SensorGroup.id)
        .where(SensorConfig.is_active == True)
    )
    if device_name:
        query = query.where(SensorConfig.device_name == device_name)
    query = query.order_by(
        SensorGroup.sort_order.asc().nulls_last(),
        Sensor.sort_order.asc().nulls_last(),
    )
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/configs/{config_id}", response_model=SensorConfigResponse)
async def get_sensor_config(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(SensorConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config

@router.put("/configs/{config_id}")
async def update_sensor_config(
    config_id: int, 
    config_data: SensorConfigUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("page:device")),
):
    old_config = await db.get(SensorConfig, config_id)
    if not old_config:
        raise HTTPException(status_code=404, detail="Config not found")
    if not old_config.is_active:
        raise HTTPException(status_code=400, detail="Cannot update inactive config")

    old_data = {
        "decode_type": old_config.decode_type,
        "raw_min": old_config.raw_min,
        "raw_max": old_config.raw_max,
        "range_min": old_config.range_min,
        "range_max": old_config.range_max,
        "unit": old_config.unit,
        "decimal_places": old_config.decimal_places,
    }

    new_config = SensorConfig(
        sensor_id=old_config.sensor_id,
        device_name=old_config.device_name,
        metric_name=old_config.metric_name,
        decode_type=config_data.decode_type,
        raw_min=config_data.raw_min,
        raw_max=config_data.raw_max,
        range_min=config_data.range_min,
        range_max=config_data.range_max,
        unit=config_data.unit,
        decimal_places=config_data.decimal_places,
        is_active=True,
    )
    db.add(new_config)
    await db.flush()

    old_config.is_active = False
    old_config.superseded_by = new_config.id

    await create_audit_log(
        db, request, current_user,
        action="update_sensor_config",
        entity="sensor_configs",
        entity_id=str(old_config.id),
        old_data=old_data,
        new_data={
            "new_config_id": new_config.id,
            "decode_type": config_data.decode_type,
            "raw_min": config_data.raw_min,
            "raw_max": config_data.raw_max,
            "range_min": config_data.range_min,
            "range_max": config_data.range_max,
            "unit": config_data.unit,
            "decimal_places": config_data.decimal_places,
        },
    )

    await db.commit()
    await db.refresh(new_config)

    try:
        from app.core.redis_client import preload_sensor_configs_cache
        from app.api.ws_sensor import broadcast_config_updated
        await preload_sensor_configs_cache()
        await broadcast_config_updated()
    except Exception:
        pass

    return new_config

@router.get("/configs/{config_id}/history", response_model=List[SensorConfigResponse])
async def get_sensor_config_history(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(SensorConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
        
    query = select(SensorConfig).where(
        and_(
            SensorConfig.device_name == config.device_name,
            SensorConfig.metric_name == config.metric_name
        )
    ).order_by(desc(SensorConfig.id))
    
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/configs/seed")
async def seed_sensor_configs(db: AsyncSession = Depends(get_db)):
    configs = [
        {"device_name": "water_flow", "metric_name": "water_meter", "decode_type": "bcd_hex", "unit": "m³"},
        {"device_name": "water_flow", "metric_name": "flow_rate", "decode_type": "bcd_hex", "unit": "m³/h"},
        {"device_name": "ro_system", "metric_name": "ro1_conduct", "decode_type": "analog_4_20ma", "range_min": 0, "range_max": 100, "unit": "µS/cm"},
        {"device_name": "ro_system", "metric_name": "ro1_temp", "decode_type": "analog_4_20ma", "range_min": 0, "range_max": 100, "unit": "°C"},
        {"device_name": "ro_system", "metric_name": "ro2_conduct", "decode_type": "analog_4_20ma"},
        {"device_name": "ro_system", "metric_name": "ro2_temp", "decode_type": "analog_4_20ma"},
        {"device_name": "ro_system", "metric_name": "edi_conduct", "decode_type": "analog_4_20ma"},
        {"device_name": "ro_system", "metric_name": "edi_temp", "decode_type": "analog_4_20ma"},
        {"device_name": "distribution_loop", "metric_name": "toc", "decode_type": "analog_4_20ma", "range_min": 0, "range_max": 100, "unit": "ppb"},
        {"device_name": "distribution_loop", "metric_name": "toc_temp", "decode_type": "analog_4_20ma", "range_min": 0, "range_max": 100, "unit": "°C"},
        {"device_name": "distribution_loop", "metric_name": "dis_loop_conduct", "decode_type": "analog_4_20ma", "range_min": 0, "range_max": 100, "unit": "µS/cm"},
        {"device_name": "distribution_loop", "metric_name": "dis_loop_temp", "decode_type": "analog_4_20ma"},
        {"device_name": "distribution_loop", "metric_name": "water_level", "decode_type": "analog_4_20ma", "range_min": 0, "range_max": 2000, "unit": "mm"},
        {"device_name": "distribution_loop", "metric_name": "uv3", "decode_type": "analog_4_20ma", "range_min": 0, "range_max": 100, "unit": "mJ/cm²"},
        {"device_name": "flow_metrics", "metric_name": "instant_flow_rate", "decode_type": "float32_cdab", "unit": "m³/h"},
        {"device_name": "flow_metrics", "metric_name": "fluid_velocity", "decode_type": "float32_cdab", "unit": "m/s"},
    ]
    
    seeded = 0
    for conf in configs:
        query = select(SensorConfig).where(
            and_(
                SensorConfig.device_name == conf["device_name"],
                SensorConfig.metric_name == conf["metric_name"],
                SensorConfig.is_active == True
            )
        )
        existing = await db.execute(query)
        if not existing.scalars().first():
            new_conf = SensorConfig(**conf)
            db.add(new_conf)
            seeded += 1
            
    await db.commit()
    return {"message": f"Seeded {seeded} sensor configs"}
