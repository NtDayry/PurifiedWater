"""Ingest endpoint for aggregated sensor data from Modbus Reader.

Accepts 1-minute aggregated data (avg/min/max) and writes to
the sensor_readings hypertable in TimescaleDB.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select, and_
from app.api.routes.auth import get_db
from app.db.models.sensor_model import SensorReading
from app.db.models.alert_model import AlertRule, AlertEvent


router = APIRouter(prefix="/ingest", tags=["ingest"])


# =========================================================
# Schemas
# =========================================================

class AggregatedReading(BaseModel):
    time: datetime
    device_name: str
    metric_name: str
    avg_value: Optional[float] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    raw_avg: Optional[float] = None
    raw_min: Optional[float] = None
    raw_max: Optional[float] = None
    sample_count: int = 60
    config_id: Optional[int] = None
    status: Optional[str] = None


class IngestPayload(BaseModel):
    readings: list[AggregatedReading] = Field(..., min_length=1)


# =========================================================
# Ingest endpoint — receives 1-min aggregated data
# =========================================================

@router.post("/sensor-data")
async def ingest_sensor_data(
    payload: IngestPayload,
    db: AsyncSession = Depends(get_db),
):
    """Ingest 1-minute aggregated sensor readings from Modbus Reader.

    Each reading contains avg/min/max for both adjusted and raw values.
    Also automatically evaluates active AlertRules and records AlertEvent to DB.
    """
    inserted = 0

    # Fetch active alert rules for automatic event recording
    rule_query = select(AlertRule).where(AlertRule.is_active == True)
    rule_res = await db.execute(rule_query)
    active_rules = { (r.device_name, r.metric_name): r for r in rule_res.scalars().all() }

    for r in payload.readings:
        reading = SensorReading(
            time=r.time,
            device_name=r.device_name,
            metric_name=r.metric_name,
            avg_value=r.avg_value,
            min_value=r.min_value,
            max_value=r.max_value,
            raw_avg=r.raw_avg,
            raw_min=r.raw_min,
            raw_max=r.raw_max,
            sample_count=r.sample_count,
            config_id=r.config_id,
        )
        db.add(reading)
        inserted += 1

        # Check Alarm Rule & Record to alert_events table
        rule = active_rules.get((r.device_name, r.metric_name))
        if rule and r.avg_value is not None:
            out_of_range = False
            if rule.threshold_min is not None and r.avg_value < rule.threshold_min:
                out_of_range = True
            if rule.threshold_max is not None and r.avg_value > rule.threshold_max:
                out_of_range = True

            if out_of_range:
                if getattr(rule, "save_alarm", True):
                    event_q = select(AlertEvent).where(
                        and_(
                            AlertEvent.alert_rule_id == rule.id,
                            AlertEvent.ended_at.is_(None),
                        )
                    )
                    existing_event = (await db.execute(event_q)).scalars().first()
                    if not existing_event:
                        new_alert_event = AlertEvent(
                            alert_rule_id=rule.id,
                            device_name=r.device_name,
                            metric_name=r.metric_name,
                            started_at=r.time,
                            triggered_at=r.time,
                            trigger_value=r.avg_value,
                            severity=rule.severity or "warning",
                        )
                        db.add(new_alert_event)
            else:
                event_q = select(AlertEvent).where(
                    and_(
                        AlertEvent.alert_rule_id == rule.id,
                        AlertEvent.ended_at.is_(None),
                    )
                )
                existing_event = (await db.execute(event_q)).scalars().first()
                if existing_event:
                    existing_event.ended_at = r.time
                    try:
                        start_ts = existing_event.started_at.timestamp() if isinstance(existing_event.started_at, datetime) else 0
                        end_ts = r.time.timestamp() if isinstance(r.time, datetime) else 0
                        if end_ts > start_ts:
                            existing_event.duration_seconds = int(end_ts - start_ts)
                    except Exception:
                        pass

    await db.commit()

    return {"status": "ok", "inserted": inserted}

