from typing import List, Optional
from datetime import datetime
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, func
from pydantic import BaseModel

from app.api.routes.auth import get_db, require_roles, get_current_user
from app.core.audit_log import create_audit_log
from app.core.notification_delivery import (
    send_single_email,
    send_single_line_messaging_api,
    split_multi_value,
)
from app.db.models.alert_model import AlertRule, AlertEvent, NotificationSettings
from app.db.models.sensor_model import SensorConfig


router = APIRouter(prefix="/alerts", tags=["alerts"])
logger = logging.getLogger(__name__)


class AlertRuleBase(BaseModel):
    device_name: str
    metric_name: str
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None
    sustained_seconds: int = 300
    severity: str = "warning"
    notify_web: bool = True
    notify_line: bool = False
    notify_email: bool = False
    line_token: Optional[str] = None
    email_recipients: Optional[str] = None
    is_active: bool = True
    save_alarm: bool = True


class AlertRuleCreate(AlertRuleBase):
    pass


class AlertRuleUpdate(AlertRuleBase):
    pass


class AlertRuleResponse(AlertRuleBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertEventCreate(BaseModel):
    alert_rule_id: Optional[int] = None
    rule_id: Optional[int] = None
    device_name: str
    metric_name: str
    started_at: datetime
    triggered_at: Optional[datetime] = None
    trigger_value: Optional[float] = None
    severity: Optional[str] = None



class AlertEventResponse(BaseModel):
    id: int
    alert_rule_id: int
    device_name: str
    metric_name: str
    started_at: datetime
    triggered_at: Optional[datetime]
    ended_at: Optional[datetime]
    trigger_value: Optional[float]
    duration_seconds: Optional[int]
    severity: Optional[str]
    acknowledged: bool
    acknowledged_by: Optional[int]
    acknowledged_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/rules", response_model=List[AlertRuleResponse])
async def list_alert_rules(
    device_name: Optional[str] = None,
    metric_name: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(AlertRule)
    if device_name:
        query = query.where(AlertRule.device_name == device_name)
    if metric_name:
        query = query.where(AlertRule.metric_name == metric_name)
    if is_active is not None:
        query = query.where(AlertRule.is_active == is_active)
    result = await db.execute(query)
    return result.scalars().all()


def _alert_rule_snapshot(rule: AlertRule | None) -> dict | None:
    if not rule:
        return None
    return {
        "id": rule.id,
        "device_name": rule.device_name,
        "metric_name": rule.metric_name,
        "threshold_min": rule.threshold_min,
        "threshold_max": rule.threshold_max,
        "sustained_seconds": rule.sustained_seconds,
        "severity": rule.severity,
        "notify_web": rule.notify_web,
        "notify_line": rule.notify_line,
        "notify_email": rule.notify_email,
        "line_token": rule.line_token,
        "email_recipients": rule.email_recipients,
        "is_active": rule.is_active,
        "save_alarm": rule.save_alarm,
    }


@router.post("/rules", response_model=AlertRuleResponse)
async def create_alert_rule(
    rule: AlertRuleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("alerts:rules:create", "sensors:configs:edit")),
):
    new_rule = AlertRule(**rule.dict())
    db.add(new_rule)
    await db.flush()

    await create_audit_log(
        db,
        request,
        current_user,
        action="create_alert_rule",
        entity="alert_rules",
        entity_id=str(new_rule.id),
        new_data=_alert_rule_snapshot(new_rule),
    )

    await db.commit()
    await db.refresh(new_rule)
    return new_rule


@router.post("/rules/upsert", response_model=AlertRuleResponse)
async def upsert_alert_rule(
    rule_data: AlertRuleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("page:settings", "alerts:rules:edit", "alerts:rules:create")),
):
    query = select(AlertRule).where(
        and_(
            AlertRule.device_name == rule_data.device_name,
            AlertRule.metric_name == rule_data.metric_name,
        )
    )
    result = await db.execute(query)
    existing_rule = result.scalars().first()
    old_data = _alert_rule_snapshot(existing_rule)

    if existing_rule:
        for key, value in rule_data.dict().items():
            setattr(existing_rule, key, value)
        target_rule = existing_rule
        action_name = "update_alert_rule"
    else:
        target_rule = AlertRule(**rule_data.dict())
        db.add(target_rule)
        action_name = "create_alert_rule"

    # Sync thresholds with active SensorConfig
    sc_query = select(SensorConfig).where(
        and_(
            SensorConfig.device_name == rule_data.device_name,
            SensorConfig.metric_name == rule_data.metric_name,
            SensorConfig.is_active == True,
        )
    )
    sc_result = await db.execute(sc_query)
    sc_config = sc_result.scalars().first()
    if sc_config:
        sc_config.alert_enabled = rule_data.is_active
        sc_config.alert_min = rule_data.threshold_min
        sc_config.alert_max = rule_data.threshold_max

    await db.flush()

    await create_audit_log(
        db,
        request,
        current_user,
        action=action_name,
        entity="alert_rules",
        entity_id=str(target_rule.id) if target_rule.id else None,
        old_data=old_data,
        new_data=_alert_rule_snapshot(target_rule),
    )

    await db.commit()
    await db.refresh(target_rule)

    try:
        from app.core.redis_client import preload_sensor_configs_cache
        from app.api.ws_sensor import broadcast_config_updated
        await preload_sensor_configs_cache()
        await broadcast_config_updated()
    except Exception:
        pass

    return target_rule



@router.put("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    rule_id: int,
    rule_data: AlertRuleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("page:settings", "alerts:rules:edit")),
):
    rule = await db.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    old_data = _alert_rule_snapshot(rule)

    for key, value in rule_data.dict().items():
        setattr(rule, key, value)

    await create_audit_log(
        db,
        request,
        current_user,
        action="update_alert_rule",
        entity="alert_rules",
        entity_id=str(rule.id),
        old_data=old_data,
        new_data=_alert_rule_snapshot(rule),
    )

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
async def delete_alert_rule(
    rule_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("page:settings", "alerts:rules:delete")),
):
    rule = await db.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    old_data = _alert_rule_snapshot(rule)

    await create_audit_log(
        db,
        request,
        current_user,
        action="delete_alert_rule",
        entity="alert_rules",
        entity_id=str(rule.id),
        old_data=old_data,
        new_data=None,
    )

    await db.delete(rule)
    await db.commit()
    return {"message": "Alert rule deleted successfully"}




class PaginatedAlertEventsResponse(BaseModel):
    items: List[AlertEventResponse]
    total: int
    page: int
    limit: int
    total_pages: int


@router.get("/events", response_model=PaginatedAlertEventsResponse)
async def list_alert_events(
    device_name: Optional[str] = None,
    metric_name: Optional[str] = None,
    severity: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    active_only: Optional[bool] = False,
    start_time: Optional[datetime] = None,
    stop_time: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("page:alarm_reports")),
):
    query = select(AlertEvent)

    if device_name:
        query = query.where(AlertEvent.device_name == device_name)
    if metric_name:
        query = query.where(AlertEvent.metric_name == metric_name)
    if severity:
        query = query.where(AlertEvent.severity == severity)
    if acknowledged is not None:
        query = query.where(AlertEvent.acknowledged == acknowledged)
    if active_only:
        query = query.where(and_(AlertEvent.ended_at.is_(None), AlertEvent.triggered_at.isnot(None)))
    if start_time:
        query = query.where(AlertEvent.started_at >= start_time)
    if stop_time:
        query = query.where(AlertEvent.started_at <= stop_time)

    count_stmt = select(func.count()).select_from(query.subquery())
    total_count = (await db.execute(count_stmt)).scalar() or 0

    query = query.order_by(desc(AlertEvent.created_at)).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()

    total_pages = -(-total_count // limit) if limit > 0 else 1

    return {
        "items": items,
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }


@router.get("/events/active", response_model=List[AlertEventResponse])
async def get_active_alert_events(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("page:alarm_reports", "page:dashboard")),
):
    query = select(AlertEvent).where(
        and_(AlertEvent.ended_at.is_(None), AlertEvent.triggered_at.isnot(None))
    ).order_by(desc(AlertEvent.created_at))
    result = await db.execute(query)
    return result.scalars().all()


class AlertEventEnd(BaseModel):
    ended_at: Optional[datetime] = None


def _format_alarm_message(
    *,
    device_name: str,
    metric_name: str,
    trigger_value: Optional[float],
    severity: Optional[str],
    triggered_at: Optional[datetime],
) -> str:
    triggered_at_text = triggered_at.strftime("%Y-%m-%d %H:%M:%S") if triggered_at else "-"
    value_text = "-" if trigger_value is None else str(trigger_value)
    severity_text = (severity or "warning").upper()

    return (
        "[Purifield Water]\n"
        "ALARM TRIGGERED\n"
        f"Device: {device_name}\n"
        f"Metric: {metric_name}\n"
        f"Severity: {severity_text}\n"
        f"Value: {value_text}\n"
        f"Time: {triggered_at_text}"
    )


async def _send_alarm_notifications(
    *,
    rule_notify_line: bool,
    rule_line_token: Optional[str],
    rule_notify_email: bool,
    rule_email_recipients: Optional[str],
    global_notify_line: bool,
    global_line_token: Optional[str],
    global_notify_email: bool,
    global_email_recipients: Optional[str],
    subject: str,
    message: str,
):
    try:
        line_targets = split_multi_value(rule_line_token or global_line_token)
        email_recipients = split_multi_value(rule_email_recipients or global_email_recipients)

        if rule_notify_line and global_notify_line and line_targets:
            for target in line_targets:
                result = await send_single_line_messaging_api(target, message)
                if result.get("status") != "success":
                    logger.warning("LINE alarm notification failed: %s", result)

        if rule_notify_email and global_notify_email and email_recipients:
            for recipient in email_recipients:
                result = await send_single_email(recipient, subject, message)
                if result.get("status") != "success":
                    logger.warning("Email alarm notification failed: %s", result)
    except Exception:
        logger.exception("Unexpected alarm notification error")


@router.post("/events", response_model=AlertEventResponse)
async def create_alert_event(
    event: AlertEventCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    target_rule_id = event.alert_rule_id or event.rule_id
    found_rule = None
    if not target_rule_id:
        rule_query = select(AlertRule).where(
            and_(
                AlertRule.device_name == event.device_name,
                AlertRule.metric_name == event.metric_name,
                AlertRule.is_active == True,
            )
        )
        rule_res = await db.execute(rule_query)
        found_rule = rule_res.scalars().first()
        if found_rule:
            target_rule_id = found_rule.id
        else:
            raise HTTPException(status_code=400, detail="Missing alert_rule_id and no active AlertRule found for metric")

    existing_event_query = select(AlertEvent).where(
        and_(
            AlertEvent.alert_rule_id == target_rule_id,
            AlertEvent.ended_at.is_(None),
        )
    )
    existing_event = (await db.execute(existing_event_query)).scalars().first()
    if existing_event:
        return existing_event

    new_event = AlertEvent(
        alert_rule_id=target_rule_id,
        device_name=event.device_name,
        metric_name=event.metric_name,
        started_at=event.started_at,
        triggered_at=event.triggered_at or event.started_at,
        trigger_value=event.trigger_value,
        severity=event.severity or "warning",
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)

    if found_rule is None:
        found_rule = await db.get(AlertRule, target_rule_id)

    settings_query = select(NotificationSettings).limit(1)
    settings_result = await db.execute(settings_query)
    notif_settings = settings_result.scalars().first()

    if found_rule and notif_settings:
        alarm_message = _format_alarm_message(
            device_name=new_event.device_name,
            metric_name=new_event.metric_name,
            trigger_value=new_event.trigger_value,
            severity=new_event.severity,
            triggered_at=new_event.triggered_at,
        )
        background_tasks.add_task(
            _send_alarm_notifications,
            rule_notify_line=bool(found_rule.notify_line),
            rule_line_token=found_rule.line_token,
            rule_notify_email=bool(found_rule.notify_email),
            rule_email_recipients=found_rule.email_recipients,
            global_notify_line=bool(notif_settings.notify_line),
            global_line_token=notif_settings.line_token,
            global_notify_email=bool(notif_settings.notify_email),
            global_email_recipients=notif_settings.email_recipients,
            subject=f"[Purifield Water] Alarm: {new_event.device_name}/{new_event.metric_name}",
            message=alarm_message,
        )

    return new_event


@router.put("/events/{event_id}/end", response_model=AlertEventResponse)
async def end_alert_event(
    event_id: int,
    payload: Optional[AlertEventEnd] = None,
    db: AsyncSession = Depends(get_db)
):
    event = await db.get(AlertEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Alert event not found")

    event.ended_at = payload.ended_at if (payload and payload.ended_at) else func.now()
    if event.started_at and event.ended_at:
        try:
            start_ts = event.started_at.timestamp() if isinstance(event.started_at, datetime) else 0
            end_ts = event.ended_at.timestamp() if isinstance(event.ended_at, datetime) else 0
            if end_ts > start_ts:
                event.duration_seconds = int(end_ts - start_ts)
        except Exception:
            pass

    await db.commit()
    await db.refresh(event)
    return event



@router.put("/events/{event_id}/acknowledge", response_model=AlertEventResponse)
async def acknowledge_alert_event(
    event_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_roles("alarm:acknowledge")),
):
    event = await db.get(AlertEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Alert event not found")

    old_acknowledged = event.acknowledged
    event.acknowledged = True
    user_id = getattr(current_user, "id", None)
    if user_id is not None:
        event.acknowledged_by = user_id
    event.acknowledged_at = func.now()

    await create_audit_log(
        db,
        request,
        current_user,
        action="acknowledge_alarm",
        entity="alert_events",
        entity_id=str(event.id),
        old_data={"acknowledged": old_acknowledged},
        new_data={
            "acknowledged": True,
            "device_name": event.device_name,
            "metric_name": event.metric_name,
            "severity": event.severity,
            "trigger_value": event.trigger_value,
        },
    )

    await db.commit()
    await db.refresh(event)
    return event
