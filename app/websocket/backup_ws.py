"""
app/websocket/backup_ws.py
--------------------------
WebSocket connection manager and endpoint for real-time backup & restore progress broadcasting.
Endpoint: /ws/backup
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])


class BackupWsManager:
    """Manages WebSocket clients subscribed to backup progress updates."""

    def __init__(self) -> None:
        self._active_connections: Set[WebSocket] = set()
        self._lock: asyncio.Lock = asyncio.Lock()
        self._last_state: Dict[str, Any] = {
            "status": "idle",
            "job_id": None,
            "job_type": None,
            "backup_type": None,
            "operator_username": None,
            "stage": "idle",
            "progress_percent": 0,
            "records_processed": 0,
            "total_records": 0,
            "files_processed": 0,
            "total_files": 0,
            "started_at": None,
            "elapsed_seconds": 0,
            "estimated_remaining_seconds": 0,
            "error_message": None,
        }

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._active_connections.add(websocket)
            logger.debug("Backup WS Client connected. Total clients: %d", len(self._active_connections))

        # Immediately send current state on connect
        try:
            await websocket.send_text(json.dumps({
                "type": "backup_status",
                "data": self._last_state,
            }))
        except Exception:
            pass

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._active_connections.discard(websocket)
            logger.debug("Backup WS Client disconnected. Remaining: %d", len(self._active_connections))

    def get_current_state(self) -> Dict[str, Any]:
        return self._last_state

    async def broadcast_state(self, state: Dict[str, Any]) -> None:
        self._last_state = state
        payload = json.dumps({
            "type": "backup_status",
            "data": state,
        })

        async with self._lock:
            dead_connections = []
            for ws in list(self._active_connections):
                if ws.client_state != WebSocketState.CONNECTED:
                    dead_connections.append(ws)
                    continue
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead_connections.append(ws)

            for ws in dead_connections:
                self._active_connections.discard(ws)

    async def broadcast_status(self, state: Dict[str, Any]) -> None:
        """Alias for broadcast_state for compatibility."""
        await self.broadcast_state(state)


backup_ws_manager = BackupWsManager()


@router.websocket("/ws/backup")
async def websocket_backup_status(websocket: WebSocket) -> None:
    """Clients connect here to receive live backup and restore updates."""
    await backup_ws_manager.connect(websocket)
    try:
        while True:
            try:
                # Keep-alive receive
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except Exception:
                break
    finally:
        await backup_ws_manager.disconnect(websocket)
