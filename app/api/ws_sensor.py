"""WebSocket endpoint for real-time sensor data relay.

The Modbus Reader pushes 1-second readings via WebSocket.
This endpoint relays them to all connected browser clients.
"""

import asyncio
import json
import logging
from typing import Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()

# =========================================================
# Connected clients
# =========================================================
_dashboard_clients: Set[WebSocket] = set()
_reader_ws: WebSocket | None = None


# =========================================================
# Dashboard client endpoint — browsers connect here
# =========================================================
@router.websocket("/ws/sensor-data")
async def ws_sensor_data(websocket: WebSocket):
    """WebSocket for browser dashboard clients.

    Receives real-time sensor data relayed from the Modbus Reader
    and sends it to all connected browser clients.
    """
    await websocket.accept()
    _dashboard_clients.add(websocket)
    logger.info(f"Dashboard client connected. Total: {len(_dashboard_clients)}")

    try:
        while True:
            # Keep connection alive — client can send pings
            data = await websocket.receive_text()
            # Optionally handle client messages (e.g., config updates)
            if data:
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except json.JSONDecodeError:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        _dashboard_clients.discard(websocket)
        logger.info(f"Dashboard client disconnected. Total: {len(_dashboard_clients)}")


# =========================================================
# Modbus Reader ingress endpoint — modbus reader pushes here
# =========================================================
@router.websocket("/ws/sensor-ingest")
async def ws_sensor_ingest(websocket: WebSocket):
    """WebSocket for the Modbus Reader service.

    The reader pushes sensor data every 1 second.
    This endpoint relays it to all connected dashboard clients.
    """
    await websocket.accept()
    logger.info("Modbus Reader WebSocket connected")

    try:
        while True:
            raw = await websocket.receive_text()

            # Broadcast to all dashboard clients
            if _dashboard_clients:
                disconnected = set()
                for client in _dashboard_clients:
                    try:
                        await client.send_text(raw)
                    except Exception:
                        disconnected.add(client)

                # Clean up disconnected clients
                for client in disconnected:
                    _dashboard_clients.discard(client)
    except WebSocketDisconnect:
        pass
    finally:
        logger.info("Modbus Reader WebSocket disconnected")


# =========================================================
# Helper: broadcast to all dashboard clients (for use by
# other parts of the app, e.g., alert notifications)
# =========================================================
async def broadcast_to_dashboards(message: dict):
    """Send a message to all connected dashboard WebSocket clients."""
    if not _dashboard_clients:
        return

    payload = json.dumps(message)
    disconnected = set()

    for client in _dashboard_clients:
        try:
            await client.send_text(payload)
        except Exception:
            disconnected.add(client)

    for client in disconnected:
        _dashboard_clients.discard(client)


async def broadcast_config_updated():
    """Broadcast config_updated event to all connected clients."""
    await broadcast_to_dashboards({"type": "config_updated"})
