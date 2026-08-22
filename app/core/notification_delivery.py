import os
import re
import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Optional

import aiohttp

from app.core.config import settings


LINE_MESSAGING_PUSH_URL = "https://api.line.me/v2/bot/message/push"


def mask_secret(value: str, visible: int = 8) -> str:
    value = value.strip()
    return value[:visible] + "..." if len(value) > visible else value


def normalize_multi_value(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    tokens = [t.strip() for t in re.split(r"[,;\n\r]+", raw) if t.strip()]
    if not tokens:
        return None

    seen = set()
    unique_tokens = []
    for token in tokens:
        if token not in seen:
            seen.add(token)
            unique_tokens.append(token)
    return ",".join(unique_tokens)


def split_multi_value(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    return [t.strip() for t in re.split(r"[,;\n\r]+", raw) if t.strip()]


def parse_line_messaging_target(raw: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    value = raw.strip()
    if not value:
        return None, None, "ไม่พบข้อมูล LINE Messaging API"

    for separator in ("|", "::"):
        if separator in value:
            channel_access_token, recipient_id = [
                part.strip() for part in value.split(separator, 1)
            ]
            break
    else:
        env_channel_access_token = (
            os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
            or os.getenv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN")
        )
        env_recipient_id = os.getenv("LINE_MESSAGING_TO") or os.getenv("LINE_TO")

        if env_channel_access_token and value[:1] in {"U", "C", "R"}:
            channel_access_token = env_channel_access_token.strip()
            recipient_id = value
        elif env_recipient_id:
            channel_access_token = value
            recipient_id = env_recipient_id.strip()
        else:
            return (
                None,
                None,
                "รูปแบบ LINE Messaging API ต้องเป็น CHANNEL_ACCESS_TOKEN|USER_ID หรือกำหนด LINE_MESSAGING_TO ใน .env",
            )

    if not channel_access_token:
        return None, None, "ไม่พบ Channel Access Token"
    if not recipient_id:
        return None, None, "ไม่พบ User ID / Group ID / Room ID ปลายทาง"

    return channel_access_token, recipient_id, None


async def send_single_line_messaging_api(target: str, message: str) -> dict:
    channel_access_token, recipient_id, parse_error = parse_line_messaging_target(target)
    display_target = mask_secret(target)

    if parse_error:
        return {
            "target": display_target,
            "token": display_target,
            "status": "failed",
            "message": parse_error,
        }

    headers = {
        "Authorization": f"Bearer {channel_access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "to": recipient_id,
        "messages": [{"type": "text", "text": message.strip()}],
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                LINE_MESSAGING_PUSH_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                status = resp.status
                if status in (200, 202):
                    return {
                        "target": mask_secret(recipient_id),
                        "token": mask_secret(channel_access_token),
                        "status": "success",
                        "message": "ส่งข้อความผ่าน LINE Messaging API สำเร็จ",
                    }
                if status == 401:
                    return {
                        "target": mask_secret(recipient_id),
                        "token": mask_secret(channel_access_token),
                        "status": "failed",
                        "code": 401,
                        "message": "Channel Access Token ไม่ถูกต้องหรือหมดอายุ",
                    }

                try:
                    body = await resp.json()
                    error_message = body.get("message") or str(body)
                except Exception:
                    error_message = await resp.text()
                return {
                    "target": mask_secret(recipient_id),
                    "token": mask_secret(channel_access_token),
                    "status": "failed",
                    "code": status,
                    "message": error_message,
                }
    except Exception as exc:
        return {
            "target": display_target,
            "token": display_target,
            "status": "error",
            "message": str(exc),
        }


async def send_single_email(recipient: str, subject: str, message: str) -> dict:
    clean_email = recipient.strip()
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", clean_email):
        return {
            "recipient": clean_email,
            "status": "failed",
            "message": "รูปแบบอีเมลไม่ถูกต้อง",
        }

    smtp_host = settings.SMTP_HOST or os.getenv("SMTP_HOST")
    from_email = (
        settings.SMTP_FROM_EMAIL
        or os.getenv("SMTP_FROM_EMAIL")
        or settings.SMTP_USER
        or os.getenv("SMTP_USER")
        or "noreply@purifield.com"
    )
    from_name = (
        settings.SMTP_FROM_NAME
        or os.getenv("SMTP_FROM_NAME")
        or "Purifield Water Alarm System"
    )

    if not smtp_host:
        return {
            "recipient": clean_email,
            "status": "warning",
            "message": f"รูปแบบอีเมลถูกต้อง แต่ยังไม่ได้ตั้งค่า SMTP_HOST ใน .env (ส่งในนาม: {from_name} <{from_email}>)",
        }

    try:
        smtp_port = int(settings.SMTP_PORT or os.getenv("SMTP_PORT", "587"))
        smtp_user = settings.SMTP_USER or os.getenv("SMTP_USER")
        smtp_password = settings.SMTP_PASSWORD or os.getenv("SMTP_PASSWORD")
        msg = MIMEText(message, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = formataddr((from_name, from_email))
        msg["To"] = clean_email

        server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
        if settings.SMTP_TLS or os.getenv("SMTP_TLS", "true").lower() in (
            "true",
            "1",
            "yes",
        ):
            server.starttls()
        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)
        server.sendmail(from_email, [clean_email], msg.as_string())
        server.quit()
        return {
            "recipient": clean_email,
            "status": "success",
            "message": f"ส่งอีเมลสำเร็จ (จาก: {from_name} <{from_email}> ผ่าน {smtp_host})",
        }
    except Exception as exc:
        return {
            "recipient": clean_email,
            "status": "error",
            "message": f"SMTP Error: {str(exc)}",
        }
