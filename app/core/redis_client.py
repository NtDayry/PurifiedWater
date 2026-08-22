import asyncio
import json
import logging
from typing import Any, Dict, Optional
from datetime import datetime, date

from redis.asyncio import Redis

from app.core.config import settings
from app.db.models.auth_model import User, Permission, Role, RolePermission
from app.db.session import AsyncSessionLocal
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Initialize Redis client (async)
redis: Redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)

USER_KEY_PREFIX = "user:"  # key: user:<username>
USER_ID_PREFIX = "user:id:"  # key: user:id:<id> -> username
ROLE_PERMS_PREFIX = "role:perms:"  # key: role:perms:<role_name> -> json list of permission keys


def _user_key(username: str) -> str:
    return f"{USER_KEY_PREFIX}{username}"


async def set_user_cache_from_model(user: User) -> None:
    """Serialize SQLAlchemy User model into Redis as JSON."""

    def _serialize_value(v: Any) -> Any:
        if isinstance(v, (datetime, date)):
            return v.isoformat()
        return v

    payload = {
        "id": _serialize_value(getattr(user, "id", None)),
        "username": _serialize_value(getattr(user, "username", None)),
        "fullname": _serialize_value(getattr(user, "fullname", None)),
        "department": _serialize_value(getattr(user, "department", None)),
        "profile_image": _serialize_value(getattr(user, "profile_image", None)),
        "role": _serialize_value(getattr(user, "role", None)),
        "status": _serialize_value(getattr(user, "status", None)),
        "token_version": _serialize_value(getattr(user, "token_version", None)),
        "password_changed_at": _serialize_value(
            getattr(user, "password_changed_at", None)
        ),
        "sign_in_attempts": _serialize_value(getattr(user, "sign_in_attempts", None)),
        "last_sign_in_attempt": _serialize_value(
            getattr(user, "last_sign_in_attempt", None)
        ),
        "updated_at": _serialize_value(getattr(user, "updated_at", None)),
    }

    # Attach permissions list for user's role (if available)
    try:
        permissions = []
        role_name = getattr(user, "role", None)
        if role_name:
            async with AsyncSessionLocal() as session:
                role_stmt = select(Role).where(Role.role_name == role_name)
                role_res = await session.execute(role_stmt)
                role_obj = role_res.scalar_one_or_none()
                if role_obj:
                    if getattr(role_obj, "is_full_access", False):
                        permissions = ["*"]
                    else:
                        perm_stmt = (
                            select(Permission.permission_key)
                            .select_from(RolePermission)
                            .join(Permission, RolePermission.permission_id == Permission.permission_id)
                            .where(RolePermission.role_id == role_obj.role_id)
                        )
                        perm_res = await session.execute(perm_stmt)
                        permissions = [r[0] for r in perm_res.fetchall()]

        payload["permissions"] = permissions
    except Exception:
        logger.exception("Failed to load permissions for role %s", role_name)

    try:
        await redis.set(_user_key(user.username), json.dumps(payload))
        # also keep an id->username mapping for lookups by id
        try:
            uid = getattr(user, "id", None)
            if uid is not None:
                await redis.set(f"{USER_ID_PREFIX}{uid}", user.username)
        except Exception:
            logger.exception("Failed to set id->username mapping for %s", getattr(user, "username", None))
        # also populate role permissions cache (best-effort)
        try:
            if role_name:
                await set_role_permissions_cache(role_name, permissions)
        except Exception:
            logger.exception("Failed to set role permissions cache for %s", role_name)
    except Exception:
        logger.exception("Failed to set user cache for %s", user.username)


async def set_user_cache(user_dict: Dict[str, Any]) -> None:
    """Store a user dict in redis. Expects 'username' key."""
    username = user_dict.get("username")
    if not username:
        return
    try:
        # ensure datetimes are serialized
        def _serialize_dict(d: Dict[str, Any]) -> Dict[str, Any]:
            out = {}
            for k, v in d.items():
                if isinstance(v, (datetime, date)):
                    out[k] = v.isoformat()
                else:
                    out[k] = v
            return out

        await redis.set(_user_key(username), json.dumps(_serialize_dict(user_dict)))
        # if id present, keep id->username mapping
        try:
            uid = user_dict.get("id")
            if uid is not None:
                await redis.set(f"{USER_ID_PREFIX}{uid}", username)
        except Exception:
            logger.exception("Failed to set id->username mapping for %s", username)
    except Exception:
        logger.exception("Failed to set user cache for %s", username)


async def get_user_cache(username: str) -> Optional[Dict[str, Any]]:
    """Return cached user dict or None."""
    try:
        raw = await redis.get(_user_key(username))
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        logger.exception("Failed to get user cache for %s", username)
        return None


async def get_user_cache_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Lookup username by id then return cached user dict or None."""
    try:
        username = await redis.get(f"{USER_ID_PREFIX}{user_id}")
        if not username:
            return None
        return await get_user_cache(username)
    except Exception:
        logger.exception("Failed to get user cache by id %s", user_id)
        return None


async def set_role_permissions_cache(role_name: str, perms: list) -> None:
    """Store list of permission keys for a role into Redis."""
    if not role_name:
        return
    try:
        await redis.set(f"{ROLE_PERMS_PREFIX}{role_name}", json.dumps(perms))
    except Exception:
        logger.exception("Failed to set role permissions cache for %s", role_name)


async def get_role_permissions_cache(role_name: str) -> Optional[list]:
    """Return cached list of permission keys for a role or None."""
    try:
        raw = await redis.get(f"{ROLE_PERMS_PREFIX}{role_name}")
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        logger.exception("Failed to get role permissions cache for %s", role_name)
        return None


async def delete_role_permissions_cache(role_name: str) -> None:
    try:
        await redis.delete(f"{ROLE_PERMS_PREFIX}{role_name}")
    except Exception:
        logger.exception("Failed to delete role permissions cache for %s", role_name)


async def delete_user_cache(username: str) -> None:
    try:
        # attempt to read cached payload first so we can remove id->username mapping
        try:
            raw = await redis.get(_user_key(username))
            if raw:
                data = json.loads(raw)
                uid = data.get("id")
                if uid is not None:
                    await redis.delete(f"{USER_ID_PREFIX}{uid}")
        except Exception:
            # best-effort: continue to delete main key even if we couldn't read payload
            pass

        # remove main entry
        await redis.delete(_user_key(username))
    except Exception:
        logger.exception("Failed to delete user cache for %s", username)


async def preload_all_users() -> None:
    """Preload active users from DB into Redis in batches.

    This uses id-based pagination (last_id) to avoid large OFFSET scans.
    Callers can schedule this as a background task to avoid delaying startup.
    """
    logger.info("Preloading active users into Redis cache (batch mode)...")
    batch_size = 500
    loaded = 0
    last_id = 0
    max_attempts = 5

    for attempt in range(1, max_attempts + 1):
        try:
            async with AsyncSessionLocal() as session:
                while True:
                    stmt = (
                        select(User)
                        .where(User.status == "active", User.id > last_id)
                        .order_by(User.id)
                        .limit(batch_size)
                    )

                    result = await session.execute(stmt)
                    users = result.scalars().all()
                    if not users:
                        break

                    for u in users:
                        try:
                            await set_user_cache_from_model(u)
                        except Exception:
                            logger.exception(
                                "Failed to set user cache for %s",
                                getattr(u, "username", None),
                            )

                    loaded += len(users)
                    last_id = users[-1].id

            logger.info("Preloaded %d active users into Redis", loaded)
            return
        except Exception:
            if attempt >= max_attempts:
                logger.exception("Failed to preload users into Redis after %d attempts", max_attempts)
                return

            delay = min(2 ** (attempt - 1), 30)
            logger.warning(
                "Failed to preload users into Redis (attempt %d/%d); retrying in %ss",
                attempt,
                max_attempts,
                delay,
                exc_info=True,
            )
            await asyncio.sleep(delay)


SENSOR_CONFIGS_KEY = "sensor_configs:active"
SENSOR_CONFIGS_CHANNEL = "sensor_configs_channel"


async def set_sensor_configs_cache(configs: list[dict[str, Any]]) -> None:
    """Store active sensor configs list in Redis as JSON and publish update event."""
    try:
        payload = json.dumps(configs)
        await redis.set(SENSOR_CONFIGS_KEY, payload)
        await redis.publish(SENSOR_CONFIGS_CHANNEL, json.dumps({"event": "config_updated"}))
        logger.info("Updated %d sensor configs in Redis cache", len(configs))
    except Exception:
        logger.exception("Failed to set sensor configs cache in Redis")


async def get_sensor_configs_cache() -> Optional[list[dict[str, Any]]]:
    """Retrieve active sensor configs from Redis cache."""
    try:
        raw = await redis.get(SENSOR_CONFIGS_KEY)
        if raw:
            return json.loads(raw)
    except Exception:
        logger.exception("Failed to get sensor configs cache from Redis")
    return None


async def preload_sensor_configs_cache() -> None:
    """Preload active sensor configs from DB into Redis."""
    try:
        from app.db.models.sensor_model import SensorConfig, Sensor, SensorGroup
        async with AsyncSessionLocal() as session:
            stmt = (
                select(SensorConfig)
                .outerjoin(Sensor, SensorConfig.sensor_id == Sensor.id)
                .outerjoin(SensorGroup, Sensor.group_id == SensorGroup.id)
                .where(SensorConfig.is_active == True)
                .order_by(
                    SensorGroup.sort_order.asc().nulls_last(),
                    Sensor.sort_order.asc().nulls_last(),
                )
            )
            result = await session.execute(stmt)
            configs = result.scalars().all()

            config_dicts = [
                {
                    "id": c.id,
                    "sensor_id": c.sensor_id,
                    "device_name": c.device_name,
                    "metric_name": c.metric_name,
                    "decode_type": c.decode_type,
                    "raw_min": c.raw_min,
                    "raw_max": c.raw_max,
                    "range_min": c.range_min,
                    "range_max": c.range_max,
                    "unit": c.unit,
                    "decimal_places": c.decimal_places,
                    "is_active": c.is_active,
                    "superseded_by": c.superseded_by,
                }
                for c in configs
            ]
            await set_sensor_configs_cache(config_dicts)
    except Exception:
        logger.exception("Failed to preload sensor configs into Redis")


async def close_redis() -> None:
    try:
        await redis.close()
    except Exception:
        logger.exception("Failed to close Redis client")
