from datetime import datetime
from typing import Optional  # 💡 1. นำเข้า Optional สำหรับกำหนดค่าที่อาจเป็น Null ได้
from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from pydantic import BaseModel, ConfigDict


class SupportTeam(Base):
    __tablename__ = "support_team"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_th: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[str] = mapped_column(String(150), nullable=False)
    role_th: Mapped[str] = mapped_column(String(100), nullable=False)
    role_en: Mapped[str] = mapped_column(String(100), nullable=False)

    # 💡 2. แก้ฝั่ง SQLAlchemy: เปลี่ยนจาก Mapped[str] เป็น Mapped[Optional[str]]
    # และเปลี่ยน nullable=False เป็น True เพื่อให้ Postgres ยอมรับค่า NULL
    profile_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        server_onupdate=func.now(),
    )


# 📋 PYDANTIC SCHEMAS (สำหรับ Validate ข้อมูล)
# ----------------------------------------------------
class SupportTeamBase(BaseModel):
    name_th: str
    name_en: str
    role_th: str
    role_en: str

    # 💡 3. แก้ฝั่ง Pydantic: เปลี่ยนเป็น Optional[str] = None หรือ str | None = None
    # เพื่อให้เวลาดึงค่า NULL จากฐานข้อมูล Pydantic จะไม่บล็อก และแปลงค่าออกไปเป็น null ใน JSON ให้เอง
    profile_image: Optional[str] = None


class SupportTeamResponse(SupportTeamBase):
    id: int

    # เปิดใช้งานเพื่อให้ Pydantic แปลงร่างข้อมูลจาก SQLAlchemy Model เป็น JSON ได้อัตโนมัติ
    model_config = ConfigDict(from_attributes=True)
