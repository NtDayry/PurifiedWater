import json
import logging
from dataclasses import asdict, is_dataclass
from typing import Any
import httpx
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)


def _to_dict(obj: Any) -> Any:
    if hasattr(obj, "to_dict") and callable(obj.to_dict):
        return obj.to_dict()
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    return obj


class ApiClient:
    def __init__(
        self,
        base_url: str,
        device_token: str,
        redis_url: str = "redis://redis:6379/0",
    ):
        self._client = httpx.AsyncClient(base_url=base_url, timeout=10.0)
        self._headers = {"X-Device-Token": device_token}
        self._redis_url = redis_url
        self._redis = aioredis.from_url(redis_url, decode_responses=True)

    async def post_sensor_data(self, readings: list[Any]) -> bool:
        serialized = [_to_dict(r) for r in readings]
        response = await self._client.post(
            "/ingest/sensor-data", json={"readings": serialized}, headers=self._headers
        )
        response.raise_for_status()
        return True

    async def get_sensor_configs(self) -> list[dict[str, Any]]:
        # 1. Try reading active configs from Redis cache first
        try:
            raw = await self._redis.get("sensor_configs:active")
            if raw:
                configs = json.loads(raw)
                if isinstance(configs, list) and len(configs) > 0:
                    return configs
        except Exception as e:
            logger.warning(f"Redis get_sensor_configs error: {e}")

        # 2. Fallback to HTTP API
        try:
            response = await self._client.get(
                "/sensors/configs", headers=self._headers
            )
            if response.status_code == 200:
                configs = response.json()
                # Update Redis cache
                try:
                    await self._redis.set(
                        "sensor_configs:active", json.dumps(configs)
                    )
                except Exception:
                    pass
                return configs
        except Exception as e:
            logger.error(f"HTTP get_sensor_configs error: {e}")

        return []

    async def get_alert_rules(self) -> list[dict[str, Any]]:
        response = await self._client.get(
            "/alerts/rules?is_active=true", headers=self._headers
        )
        if response.status_code == 200:
            return response.json()
        return []

    async def create_alert_event(self, event_data: Any) -> dict[str, Any]:
        payload = _to_dict(event_data)
        response = await self._client.post(
            "/alerts/events", json=payload, headers=self._headers
        )
        response.raise_for_status()
        return response.json()

    async def end_alert_event(self, event_id: int, ended_at: str) -> bool:
        response = await self._client.put(
            f"/alerts/events/{event_id}/end",
            json={"ended_at": ended_at},
            headers=self._headers,
        )
        response.raise_for_status()
        return True

    async def close(self):
        try:
            await self._redis.aclose()
        except Exception:
            pass
        await self._client.aclose()
