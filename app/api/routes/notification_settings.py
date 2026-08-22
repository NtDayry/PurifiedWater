from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.api.routes.auth import get_db, require_roles, get_current_user
from app.core.audit_log import create_audit_log
from app.core.notification_delivery import (
    normalize_multi_value,
    send_single_email,
    send_single_line_messaging_api,
    split_multi_value,
)
from app.db.models.alert_model import NotificationSettings

router = APIRouter(prefix="/notifications", tags=["notifications"])

class NotificationSettingsUpdate(BaseModel):
    notify_line: bool = False
    line_token: Optional[str] = None
    notify_email: bool = False
    email_recipients: Optional[str] = None

class NotificationSettingsResponse(BaseModel):
    id: int
    notify_line: bool
    line_token: Optional[str]
    notify_email: bool
    email_recipients: Optional[str]
    updated_at: datetime

    model_config = {"from_attributes": True}

def _settings_snapshot(settings: NotificationSettings | None) -> dict | None:
    if not settings:
        return None
    return {
        "id": settings.id,
        "notify_line": settings.notify_line,
        "line_token": settings.line_token,
        "notify_email": settings.notify_email,
        "email_recipients": settings.email_recipients,
    }

@router.get("/settings", response_model=NotificationSettingsResponse)
async def get_notification_settings(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("page:settings")),
):
    query = select(NotificationSettings).limit(1)
    result = await db.execute(query)
    settings = result.scalars().first()

    if not settings:
        settings = NotificationSettings(
            notify_line=False,
            line_token=None,
            notify_email=False,
            email_recipients=None
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return settings

@router.put("/settings", response_model=NotificationSettingsResponse)
async def update_notification_settings(
    settings_data: NotificationSettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_roles("page:settings")),
):
    query = select(NotificationSettings).limit(1)
    result = await db.execute(query)
    existing_settings = result.scalars().first()
    
    old_data = _settings_snapshot(existing_settings)

    cleaned_data = settings_data.model_dump()
    cleaned_data["line_token"] = normalize_multi_value(cleaned_data.get("line_token"))
    cleaned_data["email_recipients"] = normalize_multi_value(cleaned_data.get("email_recipients"))

    if existing_settings:
        for key, value in cleaned_data.items():
            setattr(existing_settings, key, value)
        target_settings = existing_settings
        action_name = "update_notification_settings"
    else:
        target_settings = NotificationSettings(**cleaned_data)
        db.add(target_settings)
        action_name = "create_notification_settings"

    await db.flush()

    await create_audit_log(
        db,
        request,
        current_user,
        action=action_name,
        entity="notification_settings",
        entity_id=str(target_settings.id) if target_settings.id else None,
        old_data=old_data,
        new_data=_settings_snapshot(target_settings),
    )

    await db.commit()
    await db.refresh(target_settings)

    return target_settings

class NotificationTestRequest(BaseModel):
    channel: str = "all"  # 'line' | 'email' | 'all'
    line_token: Optional[str] = None
    email_recipients: Optional[str] = None
    custom_message: Optional[str] = None

class NotificationTestResponse(BaseModel):
    success: bool
    line_result: Optional[dict] = None
    email_result: Optional[dict] = None
    message: str

@router.post("/settings/test", response_model=NotificationTestResponse)
@router.post("/test", response_model=NotificationTestResponse)
async def test_notifications(
    payload: NotificationTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_roles("alerts:rules:edit", "sensors:configs:edit"))
):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    test_msg = payload.custom_message or f"\n[Purifield Water]\n🔔 ทดสอบระบบการแจ้งเตือน Alarm Notification\n⏱ เวลา: {now_str}\nสถานะ: ทำงานปกติ (Test OK)"

    # Fallback to stored settings if not provided in payload
    tokens_to_test = payload.line_token
    emails_to_test = payload.email_recipients

    if tokens_to_test is None or emails_to_test is None:
        query = select(NotificationSettings).limit(1)
        res = await db.execute(query)
        stored = res.scalars().first()
        if stored:
            if tokens_to_test is None:
                tokens_to_test = stored.line_token
            if emails_to_test is None:
                emails_to_test = stored.email_recipients

    line_details = []
    email_details = []
    has_error = False

    # 1. Test LINE Messaging API
    if payload.channel in ("line", "all"):
        if tokens_to_test:
            tokens = split_multi_value(tokens_to_test)
            for t in tokens:
                res = await send_single_line_messaging_api(t, test_msg)
                line_details.append(res)
                if res.get("status") != "success":
                    has_error = True
        else:
            line_details.append({"status": "warning", "message": "ไม่มี LINE Messaging API target ที่ตั้งค่าไว้"})

    # 2. Test Email
    if payload.channel in ("email", "all"):
        if emails_to_test:
            emails = split_multi_value(emails_to_test)
            for em in emails:
                res = await send_single_email(
                    em,
                    "[Purifield Water] ทดสอบระบบแจ้งเตือน Alarm",
                    f"เรียน ผู้ดูแลระบบ,\n\nนี่คืออีเมลทดสอบการแจ้งเตือนจากระบบ Purifield Water Monitoring System\nเวลาที่ทดสอบ: {now_str}\n\nหากคุณได้รับอีเมลนี้ แสดงว่าระบบการแจ้งเตือนพร้อมใช้งานปกติ\n\nPurifield Water Automation"
                )
                email_details.append(res)
                if res.get("status") != "success":
                    has_error = True
        else:
            email_details.append({"status": "warning", "message": "ไม่มี Email ที่ตั้งค่าไว้"})

    line_result = {"total": len(line_details), "details": line_details} if payload.channel in ("line", "all") else None
    email_result = {"total": len(email_details), "details": email_details} if payload.channel in ("email", "all") else None

    return NotificationTestResponse(
        success=not has_error,
        line_result=line_result,
        email_result=email_result,
        message="ดำเนินการทดสอบการแจ้งเตือนเสร็จสิ้น",
    )
