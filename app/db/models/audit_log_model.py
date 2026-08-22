from datetime import datetime
from sqlalchemy import Integer, String, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.db.session import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # =========================
    # User
    # =========================
    user_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    username: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # =========================
    # Action
    # =========================
    action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    # =========================
    # Entity
    # =========================
    entity: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    entity_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # =========================
    # Data Changes
    # =========================
    old_data: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    new_data: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    # =========================
    # Request Info
    # =========================
    ip_address: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    user_agent: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )