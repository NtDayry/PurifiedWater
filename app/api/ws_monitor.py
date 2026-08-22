"""WebSocket endpoint for real-time system monitoring.

Pushes CPU, memory, disk, network, and Docker container stats
to all connected browser clients every 2 seconds using psutil.
"""

import asyncio
import json
import logging
import os
import subprocess
from datetime import datetime, timezone
from typing import Set

import psutil
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()
_monitor_clients: Set[WebSocket] = set()

MONITOR_INTERVAL = 2  # seconds

# =========================================================
# Collect system metrics via psutil
# =========================================================
def _get_cpu_stats() -> dict:
    return {"usage": psutil.cpu_percent(interval=None)}

def _get_cpu_temp() -> dict:
    """Get CPU temperature if available."""
    # Linux: ใช้ psutil ก่อน ถ้าไม่มีค่อย fallback ไป vcgencmd
    temps = psutil.sensors_temperatures()
    if temps:
        for name, entries in temps.items():
            if entries:
                return {"temp": float(entries[0].current)}

    output = subprocess.check_output(["vcgencmd", "measure_temp"], stderr=subprocess.DEVNULL).decode()
    temp_str = output.replace("temp=", "").replace("'C\n", "")
    return {"temp": float(temp_str)}

def _get_memory_stats() -> dict:
    mem = psutil.virtual_memory()
    return {
        "usage": mem.percent,
        "used_gb": round(mem.used / (1024 ** 3), 2),
        "total_gb": round(mem.total / (1024 ** 3), 2),
    }


def _get_disk_stats() -> dict:
    disk = psutil.disk_usage("/")
    return {
        "usage": disk.percent,
        "used_gb": round(disk.used / (1024 ** 3), 1),
        "total_gb": round(disk.total / (1024 ** 3), 1),
    }


def _get_network_stats() -> dict:
    net = psutil.net_io_counters()
    return {
        "bytes_sent_mb": round(net.bytes_sent / (1024 ** 2), 2),
        "bytes_recv_mb": round(net.bytes_recv / (1024 ** 2), 2),
    }


def _get_docker_stats() -> dict:
    """Get Docker container info via the Docker socket.

    Falls back gracefully if the Docker SDK is not installed
    or the socket is not accessible.
    """
    instances = []
    try:
        import docker
        client = docker.from_env()
        containers = client.containers.list()
        for c in containers:
            instances.append({
                "name": c.name,
                "status": "ok" if c.status == "running" else "error",
                "queues": {},
            })
    except Exception:
        # Docker SDK not installed or socket not available — silent fallback
        pass

    return {
        "app_count": len(instances),
        "instances": instances,
    }


def _collect_payload() -> dict:
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cpu": _get_cpu_stats(),
        "cpu_temp": _get_cpu_temp(),
        "memory": _get_memory_stats(),
        "disk": _get_disk_stats(),
        "network": _get_network_stats(),
        "docker": _get_docker_stats(),
    }


# =========================================================
# Background broadcaster
# =========================================================

async def _broadcast_loop():
    """Continuously collect metrics and broadcast to all clients."""
    # Prime the CPU percent measurement (first call always returns 0)
    psutil.cpu_percent(interval=None)

    while True:
        if _monitor_clients:
            payload = _collect_payload()
            data = json.dumps(payload)

            disconnected: set[WebSocket] = set()
            for ws in _monitor_clients:
                try:
                    await ws.send_text(data)
                except Exception:
                    disconnected.add(ws)

            for ws in disconnected:
                _monitor_clients.discard(ws)

        await asyncio.sleep(MONITOR_INTERVAL)


# Keep a reference so we only start one background task
_broadcast_task: asyncio.Task | None = None


def _ensure_broadcast_started():
    global _broadcast_task
    if _broadcast_task is None or _broadcast_task.done():
        _broadcast_task = asyncio.get_event_loop().create_task(_broadcast_loop())


# =========================================================
# WebSocket endpoint — browser clients connect here
# =========================================================

@router.websocket("/ws/monitor")
async def ws_monitor(websocket: WebSocket):
    """WebSocket for system monitoring dashboard clients."""
    # Authenticate and check permission
    token = websocket.cookies.get("access_token") or websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4003, reason="Unauthorized")
        return

    try:
        from app.core.security import decode_token
        from app.core.redis_client import get_user_cache
        from app.api.routes.auth import get_permissions_for_role
        from app.db.session import AsyncSessionLocal

        payload = decode_token(token)
        username = payload.get("sub")
        role = payload.get("role")
        if not username:
            await websocket.close(code=4003, reason="Unauthorized")
            return

        if role != "super admin":
            perms = []
            cached = await get_user_cache(username)
            if cached and isinstance(cached.get("permissions"), list):
                perms = cached["permissions"]
            else:
                async with AsyncSessionLocal() as session:
                    perms = await get_permissions_for_role(role, session)

            if "*" not in perms and "page:system_monitor" not in perms:
                await websocket.close(code=4003, reason="Forbidden")
                return
    except Exception:
        await websocket.close(code=4003, reason="Invalid token")
        return

    await websocket.accept()
    _monitor_clients.add(websocket)
    _ensure_broadcast_started()
    logger.info(f"Monitor client connected. Total: {len(_monitor_clients)}")

    try:
        while True:
            # Keep connection alive — client may send pings
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        _monitor_clients.discard(websocket)
        logger.info(f"Monitor client disconnected. Total: {len(_monitor_clients)}")
