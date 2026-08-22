from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import get_db, get_current_user, require_roles
from app.core.audit_log import create_audit_log
from app.db.models.auth_model import Role, Permission, RolePermission

# --- New endpoints: get, update, add, remove permissions for a specific role ---
from pydantic import BaseModel
from typing import List, Optional
from app.db.models.auth_model import RolePermission


class PermissionsPayload(BaseModel):
    permissions: List[str]


class SinglePermissionPayload(BaseModel):
    permission_id: Optional[int] = None
    permission_key: Optional[str] = None


router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/roles")
async def list_roles(
    db: AsyncSession = Depends(get_db), _=Depends(require_roles("role:read"))
):
    """Return list of defined role names from DB."""
    try:
        stmt = select(Role.role_name)
        res = await db.execute(stmt)
        rows = [r[0] for r in res.fetchall()]
        return {"roles": rows}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list roles",
        )


@router.post("/role-permissions/{role_name}/invalidate")
async def invalidate_role_permissions(
    role_name: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("permissions:edit")),
):
    """Invalidate role permissions cache for a role. Admin only."""
    try:
        from app.core.redis_client import delete_role_permissions_cache

        await delete_role_permissions_cache(role_name)
        await create_audit_log(
            db,
            request,
            current_user,
            action="invalidate_role_permissions",
            entity="role",
            entity_id=role_name,
            new_data={"cache": "invalidated"},
        )
        await db.commit()
        return {"message": "invalidated", "role": role_name}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to invalidate role permissions",
        )


@router.post("/role-permissions/preload")
async def preload_role_permissions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("permissions:edit")),
):
    """Preload role permissions for all roles into Redis. Admin only."""
    try:
        stmt = select(Role.role_name)
        res = await db.execute(stmt)
        rows = [r[0] for r in res.fetchall()]

        from app.core.redis_client import set_role_permissions_cache

        for role_name in rows:
            # call get_permissions_for_role to load from DB and populate cache
            try:
                # import here to avoid circular import at module load
                from app.api.routes.auth import get_permissions_for_role

                perms = await get_permissions_for_role(role_name, db)
                await set_role_permissions_cache(role_name, perms)
            except Exception:
                continue

        await create_audit_log(
            db,
            request,
            current_user,
            action="preload_role_permissions",
            entity="role",
            entity_id="*",
            new_data={"roles_loaded": len(rows)},
        )
        await db.commit()

        return {"message": "preloaded", "roles_loaded": len(rows)}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to preload role permissions",
        )


@router.get("/permissions")
async def list_permissions(db: AsyncSession = Depends(get_db)):
    """Return list of permission keys defined in the system."""
    try:
        stmt = select(
            Permission.permission_key,
            Permission.description_th,
            Permission.description_en,
        )
        res = await db.execute(stmt)
        rows = [
            {"permission_key": r[0], "description_th": r[1], "description_en": r[2]}
            for r in res.fetchall()
        ]
        return {"permissions": rows}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list permissions",
        )


@router.get("/role-permissions/{role_name}")
async def get_role_permissions(
    role_name: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("role:read")),
):
    """Return list of permission keys for given role (uses cache when available)."""
    try:
        # import helper from auth (uses cache + db fallback)
        from app.api.routes.auth import get_permissions_for_role

        perms = await get_permissions_for_role(role_name, db)
        return {"role": role_name, "permissions": perms}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get role permissions",
        )


@router.put("/role-permissions/{role_name}")
async def set_role_permissions(
    role_name: str,
    request: Request,
    payload: PermissionsPayload,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("permissions:edit")),
):
    """Replace the permission set for a role. Admin only.

    - Use ["*"] (wildcard) to grant full access (will set is_full_access=True).
    - Otherwise, replaces RolePermission entries for the role with the provided keys.
    """
    try:
        stmt = select(Role).where(Role.role_name == role_name)
        res = await db.execute(stmt)
        role_obj = res.scalar_one_or_none()

        if not role_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Role not found"
            )

        from app.api.routes.auth import get_permissions_for_role

        old_permissions = await get_permissions_for_role(role_name, db)
        old_is_full_access = getattr(role_obj, "is_full_access", False)

        # Normalize incoming permission keys
        incoming = [p.strip() for p in payload.permissions if p and isinstance(p, str)]

        # If wildcard, set full access and clear explicit permissions
        if "*" in incoming:
            role_obj.is_full_access = True
            # delete explicit role_permissions rows
            await db.execute(
                delete(RolePermission).where(RolePermission.role_id == role_obj.role_id)
            )
            await db.commit()

            # update cache
            try:
                from app.core.redis_client import (
                    set_role_permissions_cache,
                    delete_role_permissions_cache,
                )

                await delete_role_permissions_cache(role_name)
                await set_role_permissions_cache(role_name, ["*"])
            except Exception:
                pass

            return {"role": role_name, "permissions": ["*"]}

        # Otherwise, ensure is_full_access is False
        role_obj.is_full_access = False

        # Build list of Permission objects, creating missing permission rows
        perm_objs: List[Permission] = []
        for key in incoming:
            stmt = select(Permission).where(Permission.permission_key == key)
            res = await db.execute(stmt)
            perm = res.scalar_one_or_none()
            if not perm:
                perm = Permission(permission_key=key)
                db.add(perm)
                # flush to assign permission_id
                await db.flush()
            perm_objs.append(perm)

        # Clear existing RolePermission entries and insert new ones
        await db.execute(
            delete(RolePermission).where(RolePermission.role_id == role_obj.role_id)
        )
        await db.flush()

        # Use ORM relationship to create RolePermission rows
        new_rps = []
        for perm in perm_objs:
            rp = RolePermission(
                role_id=role_obj.role_id, permission_id=perm.permission_id
            )
            new_rps.append(rp)
            db.add(rp)

        await create_audit_log(
            db,
            request,
            current_user,
            action="set_role_permissions",
            entity="role",
            entity_id=role_name,
            old_data={"permissions": old_permissions, "is_full_access": old_is_full_access},
            new_data={"permissions": incoming, "is_full_access": getattr(role_obj, "is_full_access", False)},
        )

        await db.commit()

        # Update cache
        try:
            from app.core.redis_client import (
                set_role_permissions_cache,
                delete_role_permissions_cache,
            )

            await delete_role_permissions_cache(role_name)
            await set_role_permissions_cache(role_name, incoming)
        except Exception:
            pass

        return {"role": role_name, "permissions": incoming}

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set role permissions: {str(exc)}",
        )


@router.post("/role-permissions/{role_name}/add")
async def add_permission_to_role(
    role_name: str,
    request: Request,
    payload: SinglePermissionPayload,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("permissions:edit")),
):
    """Add a single permission to a role by permission_id or permission_key. Admin only.

    If permission_key doesn't exist, it will be created.
    If role is currently full-access (is_full_access=True), this will unset full access and create explicit mapping.
    """
    try:
        # load role
        stmt = select(Role).where(Role.role_name == role_name)
        res = await db.execute(stmt)
        role_obj = res.scalar_one_or_none()
        if not role_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Role not found"
            )

        from app.api.routes.auth import get_permissions_for_role

        before_permissions = await get_permissions_for_role(role_name, db)

        # determine permission
        perm_obj = None
        if payload.permission_id is not None:
            stmt = select(Permission).where(
                Permission.permission_id == payload.permission_id
            )
            res = await db.execute(stmt)
            perm_obj = res.scalar_one_or_none()
            if not perm_obj:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Permission id not found",
                )
        elif payload.permission_key:
            key = payload.permission_key.strip()
            stmt = select(Permission).where(Permission.permission_key == key)
            res = await db.execute(stmt)
            perm_obj = res.scalar_one_or_none()
            if not perm_obj:
                perm_obj = Permission(permission_key=key)
                db.add(perm_obj)
                await db.flush()
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="permission_id or permission_key required",
            )

        # If role had full access, unset it (we'll switch to explicit permissions)
        if getattr(role_obj, "is_full_access", False):
            role_obj.is_full_access = False

        # check existing mapping
        stmt = select(RolePermission).where(
            RolePermission.role_id == role_obj.role_id,
            RolePermission.permission_id == perm_obj.permission_id,
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        if existing:
            return {
                "role": role_name,
                "permission_id": perm_obj.permission_id,
                "status": "already_present",
            }

        # create mapping
        rp = RolePermission(
            role_id=role_obj.role_id, permission_id=perm_obj.permission_id
        )
        db.add(rp)
        await db.commit()

        # update cache
        perms = before_permissions
        try:
            from app.api.routes.auth import get_permissions_for_role
            from app.core.redis_client import (
                delete_role_permissions_cache,
                set_role_permissions_cache,
            )

            perms = await get_permissions_for_role(role_name, db)
            await delete_role_permissions_cache(role_name)
            await set_role_permissions_cache(role_name, perms)
        except Exception:
            pass

        await create_audit_log(
            db,
            request,
            current_user,
            action="add_permission_to_role",
            entity="role",
            entity_id=role_name,
            old_data={"permissions": before_permissions},
            new_data={
                "permission_id": perm_obj.permission_id,
                "permission_key": getattr(perm_obj, "permission_key", None),
                "permissions": perms,
                "status": "added",
            },
        )
        await db.commit()

        return {
            "role": role_name,
            "permission_id": perm_obj.permission_id,
            "status": "added",
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add permission to role: {str(exc)}",
        )


@router.delete("/role-permissions/{role_name}/remove")
async def remove_permission_from_role(
    role_name: str,
    request: Request,
    payload: SinglePermissionPayload,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("permissions:edit")),
):
    """Remove a single permission from a role by id or key. Admin only.

    If role is full-access (wildcard), caller must unset full access first (PUT with non-wildcard list) before removing explicit mappings.
    """
    try:
        # load role
        stmt = select(Role).where(Role.role_name == role_name)
        res = await db.execute(stmt)
        role_obj = res.scalar_one_or_none()
        if not role_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Role not found"
            )

        from app.api.routes.auth import get_permissions_for_role

        before_permissions = await get_permissions_for_role(role_name, db)

        if getattr(role_obj, "is_full_access", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role has full access (wildcard). Unset wildcard before removing permissions",
            )

        # determine permission
        perm_obj = None
        if payload.permission_id is not None:
            stmt = select(Permission).where(
                Permission.permission_id == payload.permission_id
            )
            res = await db.execute(stmt)
            perm_obj = res.scalar_one_or_none()
            if not perm_obj:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Permission id not found",
                )
        elif payload.permission_key:
            key = payload.permission_key.strip()
            stmt = select(Permission).where(Permission.permission_key == key)
            res = await db.execute(stmt)
            perm_obj = res.scalar_one_or_none()
            if not perm_obj:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Permission key not found",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="permission_id or permission_key required",
            )

        # delete mapping
        await db.execute(
            delete(RolePermission).where(
                RolePermission.role_id == role_obj.role_id,
                RolePermission.permission_id == perm_obj.permission_id,
            )
        )
        await db.commit()

        # update cache
        perms = before_permissions
        try:
            from app.api.routes.auth import get_permissions_for_role
            from app.core.redis_client import (
                delete_role_permissions_cache,
                set_role_permissions_cache,
            )

            perms = await get_permissions_for_role(role_name, db)
            await delete_role_permissions_cache(role_name)
            await set_role_permissions_cache(role_name, perms)
        except Exception:
            pass

        await create_audit_log(
            db,
            request,
            current_user,
            action="remove_permission_from_role",
            entity="role",
            entity_id=role_name,
            old_data={"permissions": before_permissions},
            new_data={
                "permission_id": perm_obj.permission_id,
                "permission_key": getattr(perm_obj, "permission_key", None),
                "permissions": perms,
                "status": "removed",
            },
        )
        await db.commit()

        return {
            "role": role_name,
            "permission_id": perm_obj.permission_id,
            "status": "removed",
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove permission from role: {str(exc)}",
        )
