from sqlalchemy import (
    Integer,
    String,
    Boolean,
    Numeric,
    ForeignKey,
    DateTime,
    Text,
    func,
)

from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


# =========================================================
# Auth / RBAC Tables
# =========================================================
class Role(Base):
    __tablename__ = "roles"

    role_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    role_name: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    is_full_access: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    permissions: Mapped[list["RolePermission"]] = relationship(
        back_populates="role",
        cascade="all, delete",
    )

    users: Mapped[list["User"]] = relationship(
        back_populates="role_rel",
    )


class Permission(Base):
    __tablename__ = "permissions"

    permission_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    permission_key: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
    )

    description_th: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    description_en: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    roles: Mapped[list["RolePermission"]] = relationship(
        back_populates="permission",
        cascade="all, delete",
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.role_id", ondelete="CASCADE"),
        primary_key=True,
    )

    permission_id: Mapped[int] = mapped_column(
        ForeignKey("permissions.permission_id", ondelete="CASCADE"),
        primary_key=True,
    )

    role: Mapped["Role"] = relationship(back_populates="permissions")

    permission: Mapped["Permission"] = relationship(back_populates="roles")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    registered_date: Mapped[DateTime] = mapped_column(
        DateTime,
        server_default=func.now(),
    )

    fullname: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
    )

    hashed_password: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    department: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    profile_image: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    role: Mapped[str | None] = mapped_column(
        ForeignKey("roles.role_name", ondelete="CASCADE"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)

    password_changed_at: Mapped[DateTime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    token_version: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    sign_in_attempts: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    last_sign_in_attempt: Mapped[DateTime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    updated_at: Mapped[DateTime | None] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    role_rel: Mapped["Role"] = relationship(back_populates="users")
