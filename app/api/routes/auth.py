import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Response, status, Cookie, Request
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import verify_password, create_access_token, decode_token, hash_password
from app.db.session import AsyncSessionLocal
from app.db.models.auth_model import User
from app.core.config import settings

from app.models.db import LoginRequest, RegisterRequest, TokenResponse

from types import SimpleNamespace
from app.core.redis_client import get_user_cache, set_user_cache_from_model
from app.core.audit_log import create_audit_log
from app.db.models.auth_model import Permission, Role, RolePermission
from sqlalchemy import join

router = APIRouter(prefix="/auth", tags=["auth"])
# Refresh token lifetime (days)
REFRESH_TOKEN_EXPIRE_DAYS = 7
logger = logging.getLogger(__name__)


# =========================
# Database
# =========================
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# =========================
# Current User
# =========================
async def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid token",
    )

    if not access_token:
        raise credentials_exception

    try:
        payload = decode_token(access_token)

        username = payload.get("sub")

        token_version = payload.get("token_version")

        if username is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    # Try Redis cache first
    try:
        cached = await get_user_cache(username)
    except Exception:
        cached = None

    if cached:
        # cached is a dict with expected fields
        if str(token_version) != str(cached.get("token_version")):
            raise credentials_exception

        if cached.get("status") != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User inactive",
            )

        # Return a lightweight object compatible with expected attributes
        return SimpleNamespace(**cached)

    # Fallback to DB if not in cache
    result = await db.execute(select(User).where(User.username == username))

    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # =========================
    # Check Token Version
    # =========================
    if str(token_version) != str(user.token_version):
        raise credentials_exception

    # =========================
    # Check User Status
    # =========================
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User inactive",
        )

    # Populate cache for future
    try:
        await set_user_cache_from_model(user)
    except Exception:
        pass

    return user


# =========================
# Role / Permission Checker
# =========================
# This function used to check user.role against a list of role names.
# It has been adapted to treat the provided strings as permission keys
# and verify that the current user has at least one of the permissions.
# This preserves the previous "OR" semantics (any permission allowed).
def require_roles(*permission_or_role_keys: str):
    """Dependency factory that accepts permission keys or explicit role lists.

    Supported forms:
      - permission key (e.g. 'edit_user')
      - explicit role list (prefix 'roles:', e.g. 'roles:admin,operator')

    Backwards-compatible: strings that don't start with 'roles:' are treated as permission keys.
    """

    async def checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        # If no keys passed, allow by default (no-op)
        if not permission_or_role_keys:
            return current_user

        for key in permission_or_role_keys:
            try:
                if isinstance(key, str) and key.startswith("roles:"):
                    # format: roles:role1,role2
                    roles_list = [r.strip() for r in key.split(":", 1)[1].split(",") if r.strip()]
                    if roles_list and getattr(current_user, "role", None) in roles_list:
                        return current_user
                else:
                    # treat as permission key
                    if await has_permission(current_user, key, db):
                        return current_user
            except Exception:
                # If lookup fails, continue to next key
                continue

        # No matching permission or role found
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )

    return checker


async def get_permissions_for_role(role_name: str, db: AsyncSession) -> list[str]:
    """Return list of permission_key for a given role name.

    Try Redis cache first (role:perms:<role_name>), fall back to DB and populate cache.
    """
    if not role_name:
        return []

    # Try Redis cache first
    try:
        from app.core.redis_client import (
            get_role_permissions_cache,
            set_role_permissions_cache,
        )

        cached = await get_role_permissions_cache(role_name)
        if isinstance(cached, list):
            if "*" in cached:
                return ["*"]
            return cached
    except Exception:
        # ignore cache errors and fall through to DB
        pass

    # Fallback to DB
    role_stmt = select(Role).where(Role.role_name == role_name)
    role_res = await db.execute(role_stmt)
    role_obj = role_res.scalar_one_or_none()
    if not role_obj:
        return []

    if getattr(role_obj, "is_full_access", False):
        # populate cache with wildcard
        try:
            await set_role_permissions_cache(role_name, ["*"])
        except Exception:
            pass
        return ["*"]

    perm_stmt = (
        select(Permission.permission_key)
        .select_from(RolePermission)
        .join(Permission, RolePermission.permission_id == Permission.permission_id)
        .where(RolePermission.role_id == role_obj.role_id)
    )
    perm_res = await db.execute(perm_stmt)
    perms = [r[0] for r in perm_res.fetchall()]

    # populate cache for future lookups
    try:
        await set_role_permissions_cache(role_name, perms)
    except Exception:
        pass

    return perms


async def has_permission(
    current_user: User | SimpleNamespace, permission_key: str, db: AsyncSession
) -> bool:
    """Check whether current_user has the given permission key.

    current_user may be a SQLAlchemy User model or a SimpleNamespace from cache.
    """
    # If cached object provides permissions list, use it
    perms = getattr(current_user, "permissions", None)
    if isinstance(perms, list):
        if "*" in perms:
            return True
        return permission_key in perms

    # Fallback: derive from role
    role_name = getattr(current_user, "role", None)
    if not role_name:
        return False

    # Try role-permissions cache in Redis first
    try:
        from app.core.redis_client import (
            get_role_permissions_cache,
            set_role_permissions_cache,
        )

        cached_perms = await get_role_permissions_cache(role_name)
        if isinstance(cached_perms, list):
            if "*" in cached_perms:
                return True
            return permission_key in cached_perms
    except Exception:
        # fall through to DB lookup on error
        pass

    # Fallback to DB and populate cache
    perms = await get_permissions_for_role(role_name, db)
    try:
        await set_role_permissions_cache(role_name, perms)
    except Exception:
        pass

    if "*" in perms:
        return True
    return permission_key in perms


# =========================
# Login
# =========================
@router.post(
    "/login",
    response_model=TokenResponse,
)
async def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == payload.username))

    user = result.scalar_one_or_none()

    # =========================
    # User Not Found
    # =========================
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # =========================
    # User Inactive
    # =========================
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User inactive",
        )

    # =========================
    # Brute Force Protection
    # =========================
    if user.sign_in_attempts >= 5 and user.last_sign_in_attempt:
        diff = datetime.now(timezone.utc) - user.last_sign_in_attempt

        if diff < timedelta(minutes=15):
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts",
            )

    # =========================
    # Verify Password
    # =========================
    if not verify_password(
        payload.password,
        user.hashed_password,
    ):
        user.sign_in_attempts += 1
        user.last_sign_in_attempt = datetime.now(timezone.utc)

        try:
            await create_audit_log(
                db,
                request,
                {"username": payload.username},
                action="login_failed",
                entity="auth",
                entity_id=payload.username,
                new_data={
                    "reason": "invalid_credentials",
                    "sign_in_attempts": user.sign_in_attempts,
                },
            )
            await db.commit()
        except Exception:
            logger.exception(
                "Failed to write audit log for login_failed (username=%s)",
                payload.username,
            )
            await db.rollback()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # =========================
    # Reset Attempts
    # =========================
    user.sign_in_attempts = 0

    await db.commit()

    # =========================
    # Create Tokens
    # =========================
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

    # =========================
    # Set Cookies
    # =========================

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

    # Write the audit log before cache/response enrichment so the login event
    # is persisted as early as possible in the request flow.
    try:
        await create_audit_log(
            db,
            request,
            user,
            action="login",
            entity="auth",
            entity_id=user.username,
            new_data={"status": "success"},
        )
        await db.commit()
    except Exception:
        logger.exception(
            "Failed to write audit log for login (username=%s)",
            user.username,
        )
        await db.rollback()

    # Populate Redis cache for this user
    try:
        await set_user_cache_from_model(user)
    except Exception:
        pass

    # Load permissions for this role and include in response
    try:
        permissions = await get_permissions_for_role(user.role, db)
    except Exception:
        permissions = []

    return TokenResponse(
        id=user.id,
        fullname=user.fullname,
        profile_image=user.profile_image,
        username=user.username,
        role=user.role,
        permissions=permissions,
    )


# =========================
# Logout
# =========================
@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    request: Request,
    refresh_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid token",
    )

    if not refresh_token:
        raise credentials_exception

    try:
        payload = decode_token(refresh_token)

        username = payload.get("sub")
        token_version = payload.get("token_version")

        if username is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    # Try Redis cache first
    try:
        cached = await get_user_cache(username)
    except Exception:
        cached = None

    user = None

    if cached:
        # Validate token version
        if str(token_version) != str(cached.get("token_version")):
            raise credentials_exception

        if cached.get("status") != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User inactive",
            )

        # Build a lightweight user-like object
        user = SimpleNamespace(**cached)
    else:
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

        if str(token_version) != str(user.token_version):
            raise credentials_exception

        if user.status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User inactive",
            )

        # Populate cache for future
        try:
            await set_user_cache_from_model(user)
        except Exception:
            pass

    # Issue new tokens (rotate refresh token)
    access_token = create_access_token(
        {
            "sub": user.username,
            "role": user.role,
            "token_version": user.token_version,
        }
    )

    # rotate refresh token
    refresh_token = create_access_token(
        {
            "sub": user.username,
            "token_version": user.token_version,
        },
        expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )

    # Set cookies (mirror /login)
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

    # Populate Redis cache for this user
    try:
        await set_user_cache_from_model(user)
    except Exception:
        pass

    # Load permissions for this role and include in response
    try:
        permissions = await get_permissions_for_role(user.role, db)
    except Exception:
        permissions = []

    return TokenResponse(
        id=user.id,
        fullname=user.fullname,
        profile_image=user.profile_image,
        username=user.username,
        role=user.role,
        permissions=permissions,
    )



# Logout implementation appended below
@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Invalidate current session: rotate token_version (if user found) and clear cookies.

    This endpoint is idempotent and succeeds even if the incoming cookie is missing or invalid.
    """
    if access_token:
        try:
            payload = decode_token(access_token)
            username = payload.get("sub")
            if username:
                result = await db.execute(select(User).where(User.username == username))
                user = result.scalar_one_or_none()
                if user:
                    # record logout attempt first, then invalidate the session
                    try:
                        await create_audit_log(
                            db,
                            request,
                            user,
                            action="logout",
                            entity="auth",
                            entity_id=user.username,
                            new_data={"status": "success"},
                        )
                    except Exception:
                        logger.exception(
                            "Failed to write audit log for logout (username=%s)",
                            user.username,
                        )
                        await db.rollback()
                        raise

                    # bump token_version to invalidate existing tokens
                    try:
                        user.token_version = (int(user.token_version or 0) + 1)
                        await db.commit()
                        try:
                            await set_user_cache_from_model(user)
                        except Exception:
                            pass
                    except Exception:
                        # ignore DB errors during best-effort invalidate
                        pass
        except Exception:
            # ignore token decoding errors
            pass

    # Clear auth cookies on client
    response.set_cookie(key="access_token", value="", httponly=True, secure=True, samesite="lax", path="/", max_age=0, expires=0)
    response.set_cookie(key="refresh_token", value="", httponly=True, secure=True, samesite="lax", path="/", max_age=0, expires=0)

    return {"ok": True}


# =========================
# Register
# =========================
@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.username == payload.username))

    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    user = User(
        fullname=payload.fullname,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        department=payload.department,
        role="viewer",
        status="pending",
    )

    db.add(user)
    await db.flush()

    try:
        await create_audit_log(
            db,
            request,
            user,
            action="register",
            entity="user",
            entity_id=str(user.id),
            new_data={
                "id": user.id,
                "fullname": user.fullname,
                "username": user.username,
                "department": user.department,
                "role": user.role,
                "status": user.status,
            },
        )
    except Exception:
        logger.exception("Failed to write audit log for registration")

    await db.commit()
    await db.refresh(user)

    return {
        "message": "User registered successfully",
        "user": {
            "id": user.id,
            "fullname": user.fullname,
            "username": user.username,
            "department": user.department,
            "role": user.role,
            "status": user.status,
        },
    }

