from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select, func, asc, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password, verify_password, create_access_token
from app.core.audit_log import create_audit_log
from app.db.models.auth_model import User
from app.models.db import UserCreate, UserUpdate, MyProfileUpdate
from app.api.routes.auth import (
    get_db,
    require_roles,
    get_current_user,
    has_permission,
    get_permissions_for_role,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.core.config import settings

router = APIRouter(prefix="/users", tags=["users"])


def _user_audit_snapshot(user: User | None) -> dict | None:
    if not user:
        return None

    return {
        "id": user.id,
        "fullname": user.fullname,
        "username": user.username,
        "department": user.department,
        "profile_image": user.profile_image,
        "role": user.role,
        "status": user.status,
        "sign_in_attempts": user.sign_in_attempts,
        "token_version": user.token_version,
    }


# =========================
# Create User
# =========================
@router.post("")
async def create_user(
    payload: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("user:create")),
):
    existing = await db.execute(select(User).where(User.username == payload.username))

    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Username already exists",
        )

    user = User(
        fullname=payload.fullname,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        department=payload.department,
        profile_image=payload.profile_image,
        role=payload.role,
        status=payload.status or "pending",
    )

    db.add(user)

    await db.flush()

    await create_audit_log(
        db,
        request,
        current_user,
        action="create",
        entity="user",
        entity_id=str(user.id),
        new_data=_user_audit_snapshot(user),
    )

    await db.commit()

    await db.refresh(user)

    # Update Redis cache for this user
    try:
        from app.core.redis_client import set_user_cache_from_model

        await set_user_cache_from_model(user)
    except Exception:
        pass

    return {
        "message": "User created",
        "user": {
            "id": user.id,
            "fullname": user.fullname,
            "username": user.username,
            "department": user.department,
            "profile_image": user.profile_image,
            "role": user.role,
            "status": user.status,
            "registered_date": user.registered_date,
        },
    }


# =========================
# List Users
# =========================
@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    sort_key: str = Query("id"),
    sort_dir: str = Query("desc"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("user:read")),
):
    offset = (page - 1) * limit

    # =========================
    # Base Query
    # =========================
    query = select(User)
    count_query = select(func.count()).select_from(User)

    # =========================
    # Search
    # =========================
    if search:
        search_filter = or_(
            User.fullname.ilike(f"%{search}%"),
            User.username.ilike(f"%{search}%"),
            User.department.ilike(f"%{search}%"),
            User.role.ilike(f"%{search}%"),
        )

        query = query.where(search_filter)

        count_query = count_query.where(search_filter)

    # =========================
    # Sort
    # =========================
    allowed_sort_keys = {
        "id": User.id,
        "registered_date": User.registered_date,
        "fullname": User.fullname,
        "username": User.username,
        "department": User.department,
        "profile_image": User.profile_image,
        "role": User.role,
        "status": User.status,
        "password_changed_at": User.password_changed_at,
        "sign_in_attempts": User.sign_in_attempts,
        "last_sign_in_attempt": User.last_sign_in_attempt,
        "token_version": User.token_version,
        "updated_at": User.updated_at,
    }

    sort_column = allowed_sort_keys.get(sort_key, User.id)

    if sort_dir == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))

    # =========================
    # Total Count
    # =========================
    total_result = await db.execute(count_query)
    total_count = total_result.scalar() or 0

    # =========================
    # Pagination
    # =========================
    query = query.offset(offset).limit(limit)

    # =========================
    # Execute Query
    # =========================
    result = await db.execute(query)

    users = result.scalars().all()

    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": -(-total_count // limit),
        "users": [
            {
                "id": user.id,
                "registered_date": user.registered_date,
                "fullname": user.fullname,
                "username": user.username,
                "department": user.department,
                "profile_image": user.profile_image,
                "role": user.role,
                "status": user.status,
                "password_changed_at": user.password_changed_at,
                "sign_in_attempts": user.sign_in_attempts,
                "last_sign_in_attempt": user.last_sign_in_attempt,
                "token_version": user.token_version,
                "updated_at": user.updated_at,
            }
            for user in users
        ],
    }


# =========================
# Get Current User Profile
# =========================
@router.get("/me")
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    id_from_token = current_user.id
    user_role = None  # สร้างตัวแปรไว้เก็บ role ชั่วคราว

    # 1. ลองดึงจาก Redis cache
    try:
        from app.core.redis_client import get_user_cache_by_id

        cached = await get_user_cache_by_id(id_from_token)
    except Exception:
        cached = None

    # ด้านล่างนี้เปลี่ยนลอจิกการเช็คและส่งกลับให้ถูกต้อง 💡
    if cached:
        user_role = cached.get("role")

        # ดึงสิทธิ์ผ่าน role ที่ได้ชัวร์ๆ จาก cache
        try:
            permissions = await get_permissions_for_role(user_role, db)
        except Exception:
            permissions = []

        return {
            "id": cached.get("id"),
            "fullname": cached.get("fullname"),
            "username": cached.get("username"),
            "department": cached.get("department"),
            "profile_image": cached.get("profile_image"),
            "permissions": permissions,
            "role": user_role,
            "status": cached.get("status"),
            "registered_date": cached.get("registered_date"),
            "updated_at": cached.get("updated_at"),
        }

    # 2. Fallback ไปที่ DB หากใน Redis ไม่มีข้อมูลผู้ใช้
    result = await db.execute(select(User).where(User.id == id_from_token))
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    user_role = user.role

    try:
        permissions = await get_permissions_for_role(user_role, db)
    except Exception:
        permissions = []

    return {
        "id": user.id,
        "fullname": user.fullname,
        "username": user.username,
        "department": user.department,
        "profile_image": user.profile_image,
        "role": user_role,
        "permissions": permissions,
        "status": user.status,
        "registered_date": user.registered_date,
        "updated_at": user.updated_at,
    }


# =========================
# Update Current User Profile (ข้อมูลตัวเอง)
# =========================
@router.patch("/me")
async def update_my_profile(
    request: Request,
    response: Response,
    payload: MyProfileUpdate = Depends(),  # รองรับ multipart/form-data และ JSON body
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await db.get(
        User, current_user.id
    )  # ดึงจาก current_user.id โดยตรง ป้องกัน Error 💡

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_data = _user_audit_snapshot(user)

    # Extract parameters supporting both JSON body and multipart/form-data
    content_type = request.headers.get("content-type", "")
    username = payload.username
    fullname = payload.fullname
    department = payload.department
    password = payload.password
    current_password = getattr(payload, "current_password", None)
    new_password = getattr(payload, "new_password", None)
    profile_image = payload.profile_image

    if "application/json" in content_type:
        try:
            body = await request.json()
            if isinstance(body, dict):
                username = body.get("username", username)
                fullname = body.get("fullname", fullname)
                department = body.get("department", department)
                password = body.get("password", password)
                current_password = body.get("current_password", current_password)
                new_password = body.get("new_password", new_password)
        except Exception:
            pass

    # =========================
    # Username Duplicate Check
    # =========================
    if username and username != user.username:
        existing = await db.execute(
            select(User).where(
                User.username == username,
                User.id != user.id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Username already exists")
        user.username = username

    # =========================
    # Password & Token Version
    # =========================
    target_new_password = new_password or password
    password_updated = False

    if target_new_password:
        if not current_password:
            raise HTTPException(
                status_code=400,
                detail="กรุณาระบุรหัสผ่านปัจจุบัน",
            )
        if not verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=400,
                detail="รหัสผ่านปัจจุบันไม่ถูกต้อง",
            )

        user.hashed_password = hash_password(target_new_password)
        user.password_changed_at = func.now()
        user.token_version = str(int(user.token_version or 0) + 1)
        password_updated = True

        # Refresh auth cookies for the current session with updated token version
        access_token = create_access_token(
            {
                "sub": user.username,
                "role": user.role,
                "token_version": user.token_version,
            }
        )
        refresh_token = create_access_token(
            {
                "sub": user.username,
                "token_version": user.token_version,
            },
            expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        )

        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
            max_age=60 * 60 * 24,
        )
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
            max_age=60 * 60 * 24 * REFRESH_TOKEN_EXPIRE_DAYS,
        )

    # =========================
    # Upload Image
    # =========================
    if profile_image:
        if profile_image.content_type not in [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
        ]:
            raise HTTPException(status_code=400, detail="Invalid image type")

        extension = Path(profile_image.filename).suffix
        filename = f"{uuid4().hex}{extension}"
        file_path = settings.UPLOAD_PROFILE_DIR / filename

        with open(file_path, "wb") as f:
            content = await profile_image.read()
            f.write(content)

        if user.profile_image:
            old_file = Path(user.profile_image)
            if old_file.exists():
                old_file.unlink()

        user.profile_image = str(file_path)

    # =========================
    # Update Other Fields
    # =========================
    if fullname is not None:
        user.fullname = fullname
    if department is not None:
        user.department = department

    new_data = _user_audit_snapshot(user)
    if password_updated:
        new_data = dict(new_data or {})
        new_data["password_changed"] = True

    await create_audit_log(
        db,
        request,
        current_user,
        action="update_self",
        entity="user",
        entity_id=str(user.id),
        old_data=old_data,
        new_data=new_data,
    )

    await db.commit()
    await db.refresh(user)

    # Sync Redis Cache
    try:
        from app.core.redis_client import set_user_cache_from_model

        await set_user_cache_from_model(user)
    except Exception:
        pass

    return {
        "message": "Profile updated",
        "user": {
            "id": user.id,
            "username": user.username,
            "fullname": user.fullname,
            "profile_image": user.profile_image,
        },
    }


# =========================
# Get User
# =========================
@router.get("/{id}")
async def get_user(
    id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("user:read")),
):
    # Try Redis cache by id first (id->username mapping)
    try:
        from app.core.redis_client import get_user_cache_by_id

        cached = await get_user_cache_by_id(id)
    except Exception:
        cached = None

    if cached:
        return {
            "id": cached.get("id"),
            "fullname": cached.get("fullname"),
            "username": cached.get("username"),
            "department": cached.get("department"),
            "profile_image": cached.get("profile_image"),
            "role": cached.get("role"),
            "status": cached.get("status"),
            "registered_date": cached.get("registered_date"),
            "updated_at": cached.get("updated_at"),
        }

    # Fallback to DB if not cached
    user = await db.get(User, id)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    return {
        "id": user.id,
        "fullname": user.fullname,
        "username": user.username,
        "department": user.department,
        "profile_image": user.profile_image,
        "role": user.role,
        "status": user.status,
        "registered_date": user.registered_date,
        "updated_at": user.updated_at,
    }


# =========================
# Update User
# =========================
@router.patch("/{id}")
async def update_user(
    id: int,
    request: Request,
    payload: UserUpdate = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("user:edit")),
):
    # =========================
    # Find User
    # =========================
    user = await db.get(User, id)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    old_data = _user_audit_snapshot(user)

    # =========================
    # Username Duplicate
    # =========================
    if payload.username:
        existing = await db.execute(
            select(User).where(
                User.username == payload.username,
                User.id != id,
            )
        )

        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="Username already exists",
            )

    # =========================
    # Password
    # =========================
    if payload.password:
        user.hashed_password = hash_password(
            payload.password,
        )
        user.password_changed_at = func.now()
        user.token_version = str(int(user.token_version or 0) + 1)

    # =========================
    # Upload Image
    # =========================
    if payload.profile_image:
        # validate content type
        if payload.profile_image.content_type not in [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
        ]:
            raise HTTPException(status_code=400, detail="Invalid image type")

        # generate filename
        extension = Path(payload.profile_image.filename).suffix
        filename = f"{uuid4().hex}{extension}"
        file_path = settings.UPLOAD_PROFILE_DIR / filename

        # save file
        with open(file_path, "wb") as f:
            content = await payload.profile_image.read()

            f.write(content)

        # delete old image
        if user.profile_image:
            old_file = Path(user.profile_image)

            if old_file.exists():
                old_file.unlink()

        # save path
        user.profile_image = str(file_path)

    # =========================
    # Authorization: ensure caller has permission for requested changes
    # =========================
    # Changing role requires 'edit_role'
    if payload.role is not None:
        if not await has_permission(current_user, "edit_role", db):
            raise HTTPException(status_code=403, detail="Permission denied")

    # Changing status requires 'edit_status'
    if payload.status is not None:
        if not await has_permission(current_user, "edit_status", db):
            raise HTTPException(status_code=403, detail="Permission denied")

    # Editing user data (fullname/department/password/profile) requires 'edit_user'
    editable_fields = [
        payload.fullname,
        payload.username,
        payload.department,
        payload.password,
        payload.profile_image,
    ]
    if any(f is not None for f in editable_fields):
        if not await has_permission(current_user, "edit_user", db):
            raise HTTPException(status_code=403, detail="Permission denied")

    # =========================
    # Update Fields
    # =========================
    if payload.fullname is not None:
        user.fullname = payload.fullname

    if payload.username is not None:
        user.username = payload.username

    if payload.department is not None:
        user.department = payload.department

    if payload.role is not None:
        user.role = payload.role

    if payload.status is not None:
        user.status = payload.status

    if payload.sign_in_attempts is not None:
        user.sign_in_attempts = payload.sign_in_attempts

    new_data = _user_audit_snapshot(user)
    if payload.password:
        new_data = dict(new_data or {})
        new_data["password_changed"] = True

    await create_audit_log(
        db,
        request,
        current_user,
        action="update",
        entity="user",
        entity_id=str(user.id),
        old_data=old_data,
        new_data=new_data,
    )

    await db.commit()
    await db.refresh(user)

    # Update Redis cache for this user
    try:
        from app.core.redis_client import set_user_cache_from_model

        await set_user_cache_from_model(user)
    except Exception:
        pass

    return {
        "message": "User updated",
        "user": {
            "id": user.id,
            "registered_date": user.registered_date,
            "fullname": user.fullname,
            "username": user.username,
            "department": user.department,
            "profile_image": user.profile_image,
            "role": user.role,
            "status": user.status,
            "password_changed_at": user.password_changed_at,
            "sign_in_attempts": user.sign_in_attempts,
            "last_sign_in_attempt": user.last_sign_in_attempt,
            "token_version": user.token_version,
            "updated_at": user.updated_at,
        },
    }


# =========================
# Delete User
# =========================
@router.delete("/{id}")
async def delete_user(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("user:delete")),
):
    user = await db.get(User, id)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    old_data = _user_audit_snapshot(user)

    # Authorization: require delete_user permission
    if not await has_permission(current_user, "delete_user", db):
        raise HTTPException(status_code=403, detail="Permission denied")

    await create_audit_log(
        db,
        request,
        current_user,
        action="delete",
        entity="user",
        entity_id=str(user.id),
        old_data=old_data,
        new_data={"deleted": True},
    )

    await db.delete(user)

    await db.commit()

    # Remove from Redis cache
    try:
        from app.core.redis_client import delete_user_cache

        await delete_user_cache(user.username)
    except Exception:
        pass

    return {
        "message": "User deleted",
    }
