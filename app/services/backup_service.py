"""
app/services/backup_service.py
------------------------------
High-Performance, Concurrency-Locked Backup & Restore Service for PurifiedWater.

Key Features:
- Full, Differential, and Incremental backup strategies with automatic chain resolution.
- Exclusive Single-Operator Lock: Only 1 user can backup or restore at any time.
- Real-Time WebSocket Broadcasting: Emits progress stages, percentages, and metrics.
- Instant Cancellation & Safe Cleanup: Operators can cancel an active backup/restore.
- Storage Target Support: Local default, Custom Local Drive, Network Share (SMB/UNC), SFTP.
- Comprehensive Storage Authentication & Integrity Verification.
"""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
import hashlib
import json
import logging
import os
import shutil
import socket
import subprocess
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Literal, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.websocket.backup_ws import backup_ws_manager

logger = logging.getLogger(__name__)

BackupType = Literal["full", "differential", "incremental"]

INDEX_FILE_NAME = "index.json"
CONFIG_FILE_NAME = "config.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def _parse_iso(dt_str: str | None) -> datetime | None:
    if not dt_str:
        return None
    try:
        return datetime.fromisoformat(dt_str)
    except Exception:
        return None


def _calculate_sha256_sync(file_path: Path, cancel_check=None, progress_cb=None) -> str:
    sha = hashlib.sha256()
    total_bytes = file_path.stat().st_size
    read_bytes = 0
    with open(file_path, "rb") as f:
        while chunk := f.read(131072):
            if cancel_check and cancel_check():
                raise asyncio.CancelledError("Checksum computation cancelled by user")
            sha.update(chunk)
            read_bytes += len(chunk)
            if progress_cb:
                progress_cb(read_bytes, total_bytes)
    return sha.hexdigest()


def _ensure_smbclient():
    """Dynamically loads smbclient or auto-installs smbprotocol if unavailable."""
    try:
        import smbclient
        return smbclient
    except ImportError:
        pass

    import importlib
    import site
    import sys

    venv_site = Path("/app/.venv/lib/python3.11/site-packages")
    if venv_site.exists() and str(venv_site) not in sys.path:
        sys.path.insert(0, str(venv_site))

    try:
        import smbclient
        return smbclient
    except ImportError:
        pass

    py_execs = [sys.executable, "/app/.venv/bin/python", "python3", "python"]
    uv_bins = ["/bin/uv", "/uv", "uv", "/root/.local/bin/uv"]

    install_cmds = []
    for py in py_execs:
        install_cmds.append([py, "-m", "pip", "install", "--no-cache-dir", "smbprotocol>=1.15.0"])

    for uv_b in uv_bins:
        for py in py_execs:
            install_cmds.append([uv_b, "pip", "install", "--python", py, "smbprotocol>=1.15.0"])
        install_cmds.append([uv_b, "pip", "install", "--system", "smbprotocol>=1.15.0"])

    for cmd in install_cmds:
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if res.returncode == 0:
                importlib.invalidate_caches()
                try:
                    site.main()
                except Exception:
                    pass
                try:
                    smbclient = importlib.import_module("smbclient")
                    return smbclient
                except ImportError:
                    pass
        except Exception:
            pass

    return None


class BackupService:
    def __init__(self, backup_dir: Optional[Path] = None) -> None:
        self.backup_dir: Path = backup_dir if backup_dir is not None else settings.BACKUP_DIR
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.index_file: Path = self.backup_dir / INDEX_FILE_NAME
        self.config_file: Path = self.backup_dir / CONFIG_FILE_NAME

        self._lock = asyncio.Lock()
        self._current_job: Optional[Dict[str, Any]] = None
        self._cancel_flag: bool = False
        self._cleanup_paths: List[Path] = []

    def is_busy(self) -> bool:
        return self._current_job is not None and self._current_job.get("status") in ("running", "cancelling")

    def get_current_job_state(self) -> Dict[str, Any]:
        if not self._current_job:
            return {"status": "idle"}

        job = dict(self._current_job)
        if job.get("status") == "running" and "_start_ts" in job:
            elapsed = time.time() - job["_start_ts"]
            job["elapsed_seconds"] = round(elapsed, 1)

        job.pop("_start_ts", None)
        return job

    async def _broadcast_progress(self) -> None:
        payload = self.get_current_job_state()
        try:
            await backup_ws_manager.broadcast_state(payload)
        except Exception as e:
            logger.warning("WebSocket broadcast error: %s", e)

    async def acquire_job_lock(
        self,
        job_type: str,
        backup_type: Optional[BackupType],
        operator_username: str = "system",
    ) -> str:
        async with self._lock:
            if self.is_busy():
                active = self._current_job or {}
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail=f"Backup system is currently busy ({active.get('job_type')} running by {active.get('operator_username')}).",
                )

            self._cancel_flag = False
            self._cleanup_paths = []
            now_dt = datetime.now(timezone.utc).astimezone()
            job_id = f"job_{job_type}_{now_dt.strftime('%Y%m%d_%H%M%S')}_{hashlib.sha256(os.urandom(4)).hexdigest()[:6]}"

            self._current_job = {
                "job_id": job_id,
                "job_type": job_type,
                "backup_type": backup_type,
                "operator_username": operator_username,
                "status": "running",
                "stage": "initializing",
                "progress_percent": 0,
                "records_processed": 0,
                "total_records": 0,
                "files_processed": 0,
                "total_files": 0,
                "started_at": now_dt.isoformat(),
                "_start_ts": time.time(),
                "elapsed_seconds": 0,
                "estimated_remaining_seconds": 15,
                "error_message": None,
            }

            await self._broadcast_progress()
            return job_id

    async def update_progress(
        self,
        stage: str,
        progress_percent: int,
        records_processed: Optional[int] = None,
        total_records: Optional[int] = None,
        files_processed: Optional[int] = None,
        total_files: Optional[int] = None,
    ) -> None:
        if self._current_job:
            self._current_job["stage"] = stage
            new_pct = min(100, max(0, progress_percent))
            self._current_job["progress_percent"] = new_pct
            if records_processed is not None:
                self._current_job["records_processed"] = records_processed
            if total_records is not None:
                self._current_job["total_records"] = total_records
            if files_processed is not None:
                self._current_job["files_processed"] = files_processed
            if total_files is not None:
                self._current_job["total_files"] = total_files

            if "_start_ts" in self._current_job:
                elapsed = max(0.1, time.time() - self._current_job["_start_ts"])
                self._current_job["elapsed_seconds"] = round(elapsed, 1)
                if 5 < new_pct < 100:
                    calc_rem = max(1, round(((100 - new_pct) / new_pct) * elapsed))
                    prev_rem = self._current_job.get("estimated_remaining_seconds", 15)
                    if calc_rem < prev_rem:
                        self._current_job["estimated_remaining_seconds"] = calc_rem
                    else:
                        self._current_job["estimated_remaining_seconds"] = min(calc_rem, prev_rem + 1)
                elif new_pct >= 100:
                    self._current_job["estimated_remaining_seconds"] = 0

            await self._broadcast_progress()

    def check_cancelled(self) -> None:
        if self._cancel_flag:
            raise asyncio.CancelledError("Operation cancelled by user request.")

    async def cancel_current_job(self, operator_username: str, reason: str = "") -> Dict[str, Any]:
        async with self._lock:
            if not self.is_busy():
                return {"status": "idle", "message": "No active backup job to cancel."}

            logger.warning(
                "Cancel requested by '%s' for job '%s' (Reason: %s)",
                operator_username,
                self._current_job.get("job_id"),
                reason,
            )
            self._cancel_flag = True

            if self._current_job:
                self._current_job["status"] = "cancelling"
                self._current_job["stage"] = "cleaning_up"
                await self._broadcast_progress()

            self._execute_cleanup_sync()

            cancelled_job_id = self._current_job.get("job_id") if self._current_job else None
            self._current_job = {
                "status": "cancelled",
                "job_id": cancelled_job_id,
                "stage": "cancelled",
                "operator_username": operator_username,
                "error_message": f"Cancelled by {operator_username}. {reason}".strip(),
                "progress_percent": 0,
            }
            await self._broadcast_progress()
            asyncio.create_task(self._reset_to_idle_after_delay())

            return {
                "status": "cancelled",
                "job_id": cancelled_job_id,
                "cancelled_by": operator_username,
                "message": "Backup operation was successfully cancelled.",
            }

    async def _reset_to_idle_after_delay(self, delay: float = 3.0) -> None:
        await asyncio.sleep(delay)
        async with self._lock:
            if self._current_job and self._current_job.get("status") in ("cancelled", "completed", "failed"):
                self._current_job = None
                self._cancel_flag = False
                await self._broadcast_progress()

    def _execute_cleanup_sync(self) -> None:
        for p in self._cleanup_paths:
            try:
                if p.is_file() and p.exists():
                    p.unlink()
                elif p.is_dir() and p.exists():
                    shutil.rmtree(p, ignore_errors=True)
            except Exception as e:
                logger.warning("Error during cleanup of %s: %s", p, e)
        self._cleanup_paths = []

    async def release_job_lock(self, status_result: str = "completed", error_msg: Optional[str] = None) -> None:
        async with self._lock:
            if self._current_job:
                self._current_job["status"] = status_result
                if error_msg:
                    self._current_job["error_message"] = str(error_msg)
                    self._current_job["stage"] = "failed"
                elif status_result == "completed":
                    self._current_job["progress_percent"] = 100
                    self._current_job["stage"] = "completed"

                await self._broadcast_progress()
            asyncio.create_task(self._reset_to_idle_after_delay(3.5))

    # =========================================================================
    # Configuration Management
    # =========================================================================

    def get_config(self) -> dict[str, Any]:
        default_config = {
            "enabled": False,
            "schedule_interval_hours": 24,
            "full_backup_interval_days": 7,
            "auto_backup_type": "incremental",
            "retention_days": 30,
            "max_backup_count": 50,
            "include_files": True,
            "last_run_at": None,
            "storage_target_type": "local",
            "retain_local_copy": True,
            "custom_local": {
                "directory_path": "",
            },
            "network_share": {
                "share_path": "",
                "username": "",
                "password": "",
                "domain": "",
            },
            "sftp": {
                "host": "",
                "port": 22,
                "username": "",
                "password": "",
                "remote_path": "/backups",
            },
        }
        if not self.config_file.exists():
            self.save_config(default_config)
            return default_config

        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
                return {**default_config, **saved}
        except Exception as e:
            logger.warning("Failed to load backup config, using default: %s", e)
            return default_config

    def save_config(self, config: dict[str, Any]) -> None:
        try:
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error("Failed to save backup config: %s", e)

    # =========================================================================
    # Storage Destination Testing & Remote Dispatch
    # =========================================================================

    async def test_storage_connection(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await asyncio.to_thread(self._test_storage_connection_sync, payload)

    def _test_storage_connection_sync(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        import uuid
        target_type = payload.get("storage_target_type", "local")
        t0 = time.time()
        test_token = f"PURIFIED_WATER_VERIFY_{uuid.uuid4().hex[:8]}"

        try:
            if target_type in ("local", "custom_local"):
                if target_type == "local":
                    target_dir = self.backup_dir
                else:
                    custom_cfg = payload.get("custom_local") or {}
                    raw_path = custom_cfg.get("directory_path", "").strip()
                    if not raw_path:
                        raise ValueError("Custom local directory path cannot be empty.")
                    p = Path(raw_path)
                    if not p.is_absolute():
                        raise ValueError(f"Path '{raw_path}' is invalid. Please specify a full absolute path.")
                    target_dir = p

                target_dir.mkdir(parents=True, exist_ok=True)
                test_file = target_dir / f".test_integrity_{int(time.time() * 1000)}.tmp"

                with open(test_file, "w", encoding="utf-8") as f:
                    f.write(test_token)
                with open(test_file, "r", encoding="utf-8") as rf:
                    read_content = rf.read().strip()
                test_file.unlink(missing_ok=True)

                if read_content != test_token:
                    raise IOError("Write/Read integrity check failed.")

                usage = shutil.disk_usage(target_dir)
                total_gb = round(usage.total / (1024**3), 2)
                free_gb = round(usage.free / (1024**3), 2)
                used_gb = round(max(0.0, usage.total - usage.free) / (1024**3), 2)
                used_percent = round((used_gb / total_gb) * 100, 1) if total_gb > 0 else 0.0
                return {
                    "status": "success",
                    "target_type": target_type,
                    "latency_ms": round((time.time() - t0) * 1000, 2),
                    "message": f"Storage path '{target_dir}' verified 100%! Free space: {free_gb} GB free / {total_gb} GB total.",
                    "details": {
                        "path": str(target_dir),
                        "total_gb": total_gb,
                        "free_gb": free_gb,
                        "used_gb": used_gb,
                        "used_percent": used_percent,
                        "write_read_verified": True,
                    },
                }

            elif target_type == "network_share":
                share_cfg = payload.get("network_share") or {}
                raw_path = share_cfg.get("share_path", "").strip()
                username = share_cfg.get("username", "").strip()
                password = share_cfg.get("password", "")
                domain = share_cfg.get("domain", "").strip()

                if not raw_path:
                    raise ValueError("Network share UNC path is required (e.g. \\\\192.168.0.250\\share).")

                clean_path = raw_path.replace("/", "\\")
                parts = [p for p in clean_path.split("\\") if p]
                if len(parts) < 2:
                    raise ValueError(f"Invalid UNC network share format '{raw_path}'. Expected: \\\\server_ip\\share_name")

                host_ip = parts[0]
                share_name = parts[1]
                sub_path = "/".join(parts[2:]) if len(parts) > 2 else ""

                # 1. SMB socket check
                smb_connected = False
                for smb_port in (445, 139):
                    try:
                        sock = socket.create_connection((host_ip, smb_port), timeout=3.0)
                        sock.close()
                        smb_connected = True
                        break
                    except Exception:
                        pass

                if not smb_connected:
                    raise ConnectionError(f"Cannot connect to SMB Host '{host_ip}' (Port 445/139 unreachable).")

                # 2. Strict SMB session authentication using smbclient / smbprotocol
                smb = _ensure_smbclient()
                if smb is None:
                    raise RuntimeError("smbprotocol library is not installed. Unable to verify SMB Network Share.")

                def _purge_smb_session():
                    for p in (445, 139):
                        try:
                            smb.delete_session(host_ip, port=p)
                        except Exception:
                            pass
                    try:
                        from smbclient._pool import _SMB_CONNECTIONS
                        for key in list(_SMB_CONNECTIONS.keys()):
                            if host_ip.lower() in key.lower():
                                conn_obj = _SMB_CONNECTIONS.pop(key, None)
                                if conn_obj:
                                    try:
                                        conn_obj.disconnect(close=True)
                                    except Exception:
                                        pass
                    except Exception:
                        pass
                    try:
                        smb.reset_connection_cache(fail_on_error=False)
                    except Exception:
                        pass

                _purge_smb_session()

                user_spec = f"{domain}\\{username}" if domain else username
                try:
                    smb.register_session(
                        server=host_ip,
                        username=user_spec if username else None,
                        password=password if username else None,
                        port=445,
                        connection_timeout=10.0,
                    )
                except Exception as auth_err:
                    _purge_smb_session()
                    err_str = str(auth_err)
                    err_msg_lower = err_str.lower()
                    if any(k in err_msg_lower for k in ("logon", "password", "authentication", "denied", "1326", "0xc000006d", "invalid")):
                        raise PermissionError(f"Authentication failed for user '{username or 'Guest'}'. Incorrect username or password.")
                    raise PermissionError(f"SMB Network Share access denied: {err_str}")

                unc_base = f"//{host_ip}/{share_name}"
                target_unc_dir = f"{unc_base}/{sub_path}".rstrip("/") if sub_path else unc_base

                try:
                    try:
                        smb.makedirs(target_unc_dir, exist_ok=True)
                    except Exception as mk_err:
                        raise PermissionError(f"Failed to access or create directory on share '{raw_path}': {mk_err}")

                    test_smb_file = f"{target_unc_dir}/.test_integrity_{int(time.time() * 1000)}.tmp"
                    try:
                        with smb.open_file(test_smb_file, mode="w") as f:
                            f.write(test_token)
                        with smb.open_file(test_smb_file, mode="r") as f:
                            read_content = f.read()
                        smb.remove(test_smb_file)
                    except Exception as io_err:
                        raise IOError(f"Network Share File Read/Write integrity check failed: {io_err}")

                    if read_content != test_token:
                        raise IOError("Network Share File Read/Write integrity check failed (data mismatch).")

                    free_gb = 0.0
                    total_gb = 0.0

                    for check_path in (target_unc_dir, unc_base):
                        try:
                            vol = smb.stat_volume(check_path)
                            avail = getattr(vol, "caller_available_size", 0) or getattr(vol, "actual_available_size", 0)
                            tot = getattr(vol, "total_size", 0)
                            if avail > 0:
                                free_gb = round(avail / (1024**3), 2)
                            if tot > 0:
                                total_gb = round(tot / (1024**3), 2)
                            if free_gb > 0:
                                break
                        except Exception as stat_err:
                            logger.debug("smb.stat_volume check failed for %s: %s", check_path, stat_err)

                    if free_gb == 0.0 and os.name == "nt":
                        try:
                            import ctypes
                            free_bytes = ctypes.c_ulonglong(0)
                            total_bytes = ctypes.c_ulonglong(0)
                            unc_path_str = f"\\\\{host_ip}\\{share_name}"
                            if sub_path:
                                unc_path_str += "\\" + sub_path.replace("/", "\\")
                            ret = ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                                unc_path_str,
                                ctypes.byref(free_bytes),
                                ctypes.byref(total_bytes),
                                None,
                            )
                            if ret:
                                free_gb = round(free_bytes.value / (1024**3), 2)
                                total_gb = round(total_bytes.value / (1024**3), 2)
                        except Exception:
                            pass

                    if free_gb == 0.0:
                        try:
                            usage = shutil.disk_usage(Path(clean_path))
                            free_gb = round(usage.free / (1024**3), 2)
                            total_gb = round(usage.total / (1024**3), 2)
                        except Exception:
                            pass

                    user_label = f"User '{username}'" if username else "Guest"
                    if free_gb > 0 and total_gb > 0:
                        free_space_str = f"{free_gb} GB free / {total_gb} GB total"
                    elif free_gb > 0:
                        free_space_str = f"{free_gb} GB free"
                    else:
                        free_space_str = "Available"

                    used_gb = round(max(0.0, total_gb - free_gb), 2) if total_gb > 0 else 0.0
                    used_percent = round((used_gb / total_gb) * 100, 1) if total_gb > 0 else 0.0

                    return {
                        "status": "success",
                        "target_type": "network_share",
                        "latency_ms": round((time.time() - t0) * 1000, 2),
                        "message": f"Verified 100%! Authenticated as {user_label}. Read & Write test passed.",
                        "details": {
                            "share_path": raw_path,
                            "auth_user": username or "Guest",
                            "free_gb": free_gb,
                            "total_gb": total_gb,
                            "used_gb": used_gb,
                            "used_percent": used_percent,
                            "write_read_verified": True,
                        },
                    }
                finally:
                    _purge_smb_session()

            elif target_type == "sftp":
                sftp_cfg = payload.get("sftp") or {}
                host = sftp_cfg.get("host", "").strip()
                port = int(sftp_cfg.get("port", 22))
                username = sftp_cfg.get("username", "").strip()
                password = sftp_cfg.get("password", "")
                remote_path = sftp_cfg.get("remote_path", "/backups").strip()

                if not host or not username:
                    raise ValueError("SFTP Host and Username are required.")

                import paramiko
                ssh = paramiko.SSHClient()
                ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                ssh.connect(hostname=host, port=port, username=username, password=password, timeout=5.0)
                sftp_client = ssh.open_sftp()
                try:
                    sftp_client.chdir(remote_path)
                except Exception:
                    sftp_client.mkdir(remote_path)

                test_file_name = f"{remote_path}/.test_sftp_{int(time.time() * 1000)}.tmp".replace("//", "/")
                with sftp_client.open(test_file_name, "w") as f:
                    f.write(test_token)
                with sftp_client.open(test_file_name, "r") as rf:
                    read_content = rf.read().decode("utf-8").strip()
                sftp_client.remove(test_file_name)

                free_gb = 0.0
                total_gb = 0.0
                try:
                    vfs = sftp_client.statvfs(remote_path)
                    if hasattr(vfs, "f_frsize") and hasattr(vfs, "f_blocks"):
                        total_gb = round((vfs.f_frsize * vfs.f_blocks) / (1024**3), 2)
                        free_gb = round((vfs.f_frsize * vfs.f_bavail) / (1024**3), 2)
                except Exception:
                    pass

                ssh.close()

                if read_content != test_token:
                    raise IOError("SFTP File Read/Write integrity check failed.")

                used_gb = round(max(0.0, total_gb - free_gb), 2) if total_gb > 0 else 0.0
                used_percent = round((used_gb / total_gb) * 100, 1) if total_gb > 0 else 0.0
                free_str = f" (Free space: {free_gb} GB free / {total_gb} GB total)" if free_gb > 0 else ""

                return {
                    "status": "success",
                    "target_type": "sftp",
                    "latency_ms": round((time.time() - t0) * 1000, 2),
                    "message": f"SFTP verified 100%! Authenticated as User '{username}' on '{host}:{port}'.{free_str}",
                    "details": {
                        "host": host,
                        "port": port,
                        "remote_path": remote_path,
                        "auth_user": username,
                        "free_gb": free_gb,
                        "total_gb": total_gb,
                        "used_gb": used_gb,
                        "used_percent": used_percent,
                        "write_read_verified": True,
                    },
                }

            else:
                raise ValueError(f"Unknown storage target type '{target_type}'.")

        except Exception as err:
            logger.warning("Storage connection test failed for %s: %s", target_type, err)
            return {
                "status": "error",
                "target_type": target_type,
                "latency_ms": round((time.time() - t0) * 1000, 2),
                "message": str(err),
            }

    async def _dispatch_to_remote_storage(
        self,
        archive_path: Path,
        manifest: Dict[str, Any],
        config: Dict[str, Any],
    ) -> None:
        target_type = config.get("storage_target_type", "local")
        if target_type == "local":
            return

        logger.info("Dispatching backup archive %s to target: %s", archive_path.name, target_type)

        if target_type == "custom_local":
            raw_path = (config.get("custom_local") or {}).get("directory_path", "").strip()
            if not raw_path:
                raise ValueError("Destination directory for 'custom_local' is not configured.")

            def _copy_custom_local_sync() -> str:
                dest_dir = Path(raw_path)
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest_archive = dest_dir / archive_path.name
                shutil.copy2(archive_path, dest_archive)
                return str(dest_archive)

            dest_archive_str = await asyncio.to_thread(_copy_custom_local_sync)

            manifest["remote_synced"] = True
            manifest["remote_destination"] = dest_archive_str

            retain_local = config.get("retain_local_copy", True)
            if not retain_local and Path(dest_archive_str).exists():
                archive_path.unlink(missing_ok=True)

        elif target_type == "network_share":
            share_cfg = config.get("network_share") or {}
            raw_path = share_cfg.get("share_path", "").strip()
            username = share_cfg.get("username", "").strip()
            password = share_cfg.get("password", "")
            domain = share_cfg.get("domain", "").strip()

            if not raw_path:
                raise ValueError("Destination share path for 'network_share' is not configured.")

            def _copy_network_share_sync() -> str:
                parts = [p for p in raw_path.replace("/", "\\").split("\\") if p]
                if len(parts) < 2:
                    raise ValueError(f"Invalid UNC network share format '{raw_path}'. Expected: \\\\server_ip\\share_name")

                host_ip = parts[0]
                share_name = parts[1]
                sub_path = "/".join(parts[2:]) if len(parts) > 2 else ""

                if os.name == "nt":
                    unc_root = f"\\\\{host_ip}\\{share_name}"
                    user_spec = f"{domain}\\{username}" if domain else username
                    if username:
                        cmd = f'net use "{unc_root}" "{password}" /user:"{user_spec}" /persistent:no'
                        subprocess.run(cmd, shell=True, capture_output=True, timeout=10)

                    dest_dir = Path(raw_path.replace("/", "\\"))
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    dest_archive = dest_dir / archive_path.name
                    shutil.copy2(archive_path, dest_archive)
                    return str(dest_archive)
                else:
                    smb = _ensure_smbclient()
                    if smb is None:
                        raise RuntimeError("smbclient library unavailable for uploading SMB backup on Linux.")

                    user_spec = f"{domain}\\{username}" if domain else username
                    smb.register_session(
                        server=host_ip,
                        username=user_spec if username else None,
                        password=password if username else None,
                        port=445,
                        connection_timeout=15.0,
                    )
                    unc_base = f"//{host_ip}/{share_name}"
                    target_unc_dir = f"{unc_base}/{sub_path}".rstrip("/") if sub_path else unc_base
                    smb.makedirs(target_unc_dir, exist_ok=True)
                    dest_file_path = f"{target_unc_dir}/{archive_path.name}"
                    with open(archive_path, "rb") as src_f:
                        with smb.open_file(dest_file_path, mode="wb") as dest_f:
                            shutil.copyfileobj(src_f, dest_f)
                    return f"smb:{dest_file_path}"

            dest_archive_str = await asyncio.to_thread(_copy_network_share_sync)

            manifest["remote_synced"] = True
            manifest["remote_destination"] = dest_archive_str

            retain_local = config.get("retain_local_copy", True)
            if not retain_local:
                archive_path.unlink(missing_ok=True)

        elif target_type == "sftp":
            sftp_cfg = config.get("sftp") or {}
            host = sftp_cfg.get("host", "").strip()
            port = int(sftp_cfg.get("port", 22))
            user = sftp_cfg.get("username", "").strip()
            pwd = sftp_cfg.get("password", "")
            remote_dir = sftp_cfg.get("remote_path", "/backups").strip()

            import paramiko
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(hostname=host, port=port, username=user, password=pwd, timeout=15.0)
            sftp = ssh.open_sftp()
            try:
                sftp.chdir(remote_dir)
            except Exception:
                sftp.mkdir(remote_dir)
            remote_file_path = f"{remote_dir}/{archive_path.name}".replace("//", "/")
            sftp.put(str(archive_path), remote_file_path)
            ssh.close()

            manifest["remote_synced"] = True
            manifest["remote_destination"] = f"sftp://{host}:{port}{remote_file_path}"

            retain_local = config.get("retain_local_copy", True)
            if not retain_local:
                archive_path.unlink(missing_ok=True)

    async def sync_all_backups_to_remote(self) -> Dict[str, Any]:
        """Iterates over all local backup files in index and dispatches any unsynced archives to remote storage."""
        config = self.get_config()
        target_type = config.get("storage_target_type", "local")
        if target_type == "local":
            return {
                "status": "skipped",
                "message": "Storage target is set to local. No remote sync needed.",
                "synced_count": 0,
                "total_checked": 0,
            }

        index = self.get_index()
        synced_count = 0
        errors = []

        for item in index:
            filename = item.get("filename")
            if not filename:
                continue
            archive_path = self.backup_dir / filename
            if not archive_path.exists():
                continue

            try:
                os.chmod(archive_path, 0o666)
            except Exception:
                pass

            try:
                await self._dispatch_to_remote_storage(archive_path, item, config)
                item["remote_synced"] = True
                if item.get("remote_destination"):
                    item["storage_path"] = item["remote_destination"]
                synced_count += 1
            except Exception as e:
                logger.warning("Failed to sync %s to remote target '%s': %s", filename, target_type, e)
                errors.append(f"{filename}: {str(e)}")

        self.save_index(index)
        return {
            "status": "success" if not errors else "partial",
            "message": f"Successfully synced {synced_count} backup archive(s) to remote storage destination.",
            "synced_count": synced_count,
            "total_checked": len(index),
            "target_type": target_type,
            "errors": errors,
        }

    async def fetch_remote_archive_to_temp(self, backup_item: dict[str, Any]) -> Path | None:
        """If local copy is missing, fetch archive from network share, custom local, or SFTP to temp."""
        filename = backup_item.get("filename")
        remote_dest = backup_item.get("remote_destination")
        if not filename:
            return None

        storage_config = self.get_config()
        target_type = storage_config.get("storage_target_type", "local")

        def _fetch_sync() -> Path | None:
            temp_fetch_dir = Path(tempfile.gettempdir()) / "backup_downloads"
            temp_fetch_dir.mkdir(parents=True, exist_ok=True)
            target_local_path = temp_fetch_dir / filename

            if target_local_path.exists() and target_local_path.stat().st_size > 0:
                return target_local_path

            if target_type == "custom_local" or (remote_dest and Path(remote_dest).exists()):
                src_p = Path(remote_dest) if remote_dest else None
                if src_p and src_p.exists():
                    shutil.copy2(src_p, target_local_path)
                    return target_local_path

            elif target_type == "network_share" or (remote_dest and remote_dest.startswith("smb:")):
                share_cfg = storage_config.get("network_share") or {}
                raw_path = share_cfg.get("share_path", "").strip()
                username = share_cfg.get("username", "").strip()
                password = share_cfg.get("password", "")
                domain = share_cfg.get("domain", "").strip()

                if not raw_path:
                    return None

                parts = [p for p in raw_path.replace("/", "\\").split("\\") if p]
                if len(parts) >= 2:
                    host_ip = parts[0]
                    share_name = parts[1]
                    sub_path = "/".join(parts[2:]) if len(parts) > 2 else ""

                    if os.name == "nt":
                        unc_root = f"\\\\{host_ip}\\{share_name}"
                        user_spec = f"{domain}\\{username}" if domain else username
                        if username:
                            cmd = f'net use "{unc_root}" "{password}" /user:"{user_spec}" /persistent:no'
                            subprocess.run(cmd, shell=True, capture_output=True, timeout=10)

                        src_p = Path(raw_path.replace("/", "\\")) / filename
                        if src_p.exists():
                            shutil.copy2(src_p, target_local_path)
                            return target_local_path
                    else:
                        smb = _ensure_smbclient()
                        if smb is None:
                            return None

                        user_spec = f"{domain}\\{username}" if domain else username
                        smb.register_session(
                            server=host_ip,
                            username=user_spec if username else None,
                            password=password if username else None,
                            port=445,
                            connection_timeout=15.0,
                        )
                        unc_base = f"//{host_ip}/{share_name}"
                        target_unc_dir = f"{unc_base}/{sub_path}".rstrip("/") if sub_path else unc_base
                        remote_file_path = f"{target_unc_dir}/{filename}"

                        with self._open_smb_file_for_read(smb, remote_file_path) as src_f:
                            with open(target_local_path, "wb") as dest_f:
                                shutil.copyfileobj(src_f, dest_f)
                        return target_local_path

            elif target_type == "sftp" or (remote_dest and remote_dest.startswith("sftp://")):
                sftp_cfg = storage_config.get("sftp") or {}
                host = sftp_cfg.get("host", "").strip()
                port = int(sftp_cfg.get("port", 22))
                user = sftp_cfg.get("username", "").strip()
                pwd = sftp_cfg.get("password", "")
                remote_dir = sftp_cfg.get("remote_path", "/backups").strip()

                import paramiko
                ssh = paramiko.SSHClient()
                ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                ssh.connect(hostname=host, port=port, username=user, password=pwd, timeout=15.0)
                sftp = ssh.open_sftp()
                remote_file_path = f"{remote_dir}/{filename}".replace("//", "/")
                sftp.get(remote_file_path, str(target_local_path))
                ssh.close()
                return target_local_path

            return None

        try:
            return await asyncio.to_thread(_fetch_sync)
        except Exception as e:
            logger.warning("Failed to fetch remote backup archive %s: %s", filename, e)
            return None

    def stream_remote_archive_chunks(
        self,
        backup_item: dict[str, Any],
        chunk_size: int = 2 * 1024 * 1024,
    ) -> Generator[bytes, None, None]:
        """
        Yield file chunks from local disk, network share, custom local, or SFTP
        WITHOUT writing to a temp file on disk first.
        """
        filename = backup_item.get("filename")
        remote_dest = backup_item.get("remote_destination")
        if not filename:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Backup item has no filename.",
            )

        # --- 1. Local disk (fastest path) ---
        local_path = self.backup_dir / filename
        if local_path.exists():
            with open(local_path, "rb") as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
            return

        storage_config = self.get_config()
        target_type = storage_config.get("storage_target_type", "local")

        # --- 2. Custom Local (mounted drive / other path) ---
        if target_type == "custom_local" or (remote_dest and not remote_dest.startswith(("smb:", "sftp://"))):
            src_p = Path(remote_dest) if remote_dest else None
            if src_p and src_p.exists():
                with open(src_p, "rb") as f:
                    while True:
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
                return

        # --- 3. Network Share (SMB/UNC) ---
        if target_type == "network_share" or (remote_dest and remote_dest.startswith("smb:")):
            share_cfg = storage_config.get("network_share") or {}
            raw_path = share_cfg.get("share_path", "").strip()
            username = share_cfg.get("username", "").strip()
            password = share_cfg.get("password", "")
            domain = share_cfg.get("domain", "").strip()

            if not raw_path:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Network share path is not configured.",
                )

            parts = [p for p in raw_path.replace("/", "\\").split("\\") if p]
            if len(parts) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid network share path: {raw_path}",
                )

            host_ip = parts[0]
            share_name = parts[1]
            sub_path = "/".join(parts[2:]) if len(parts) > 2 else ""

            if os.name == "nt":
                unc_root = f"\\\\{host_ip}\\{share_name}"
                user_spec = f"{domain}\\{username}" if domain else username
                if username:
                    cmd = f'net use "{unc_root}" "{password}" /user:"{user_spec}" /persistent:no'
                    subprocess.run(cmd, shell=True, capture_output=True, timeout=10)

                src_p = Path(raw_path.replace("/", "\\")) / filename
                if src_p.exists():
                    with open(src_p, "rb") as f:
                        while True:
                            chunk = f.read(chunk_size)
                            if not chunk:
                                break
                            yield chunk
                    return
                else:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Archive file '{filename}' not found on network share.",
                    )
            else:
                smb = _ensure_smbclient()
                if smb is None:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="smbclient is not available on this server.",
                    )

                user_spec = f"{domain}\\{username}" if domain else username
                smb.register_session(
                    server=host_ip,
                    username=user_spec if username else None,
                    password=password if username else None,
                    port=445,
                    connection_timeout=15.0,
                )
                unc_base = f"//{host_ip}/{share_name}"
                target_unc_dir = f"{unc_base}/{sub_path}".rstrip("/") if sub_path else unc_base
                remote_file_path = f"{target_unc_dir}/{filename}"

                with self._open_smb_file_for_read(smb, remote_file_path) as src_f:
                    while True:
                        chunk = src_f.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
                return

        # --- 4. SFTP ---
        if target_type == "sftp" or (remote_dest and remote_dest.startswith("sftp://")):
            sftp_cfg = storage_config.get("sftp") or {}
            host = sftp_cfg.get("host", "").strip()
            port = int(sftp_cfg.get("port", 22))
            user = sftp_cfg.get("username", "").strip()
            pwd = sftp_cfg.get("password", "")
            remote_dir = sftp_cfg.get("remote_path", "/backups").strip()

            import paramiko
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(hostname=host, port=port, username=user, password=pwd, timeout=15.0)
            sftp_client = ssh.open_sftp()
            remote_file_path = f"{remote_dir}/{filename}".replace("//", "/")

            try:
                with sftp_client.open(remote_file_path, "rb") as remote_f:
                    remote_f.prefetch()
                    while True:
                        chunk = remote_f.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
            finally:
                ssh.close()
            return

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Archive file '{filename}' not found on server disk or remote storage.",
        )

    @contextmanager
    def _open_smb_file_for_read(self, smb: Any, remote_file_path: str):
        """Open an SMB archive for shared reading, retrying transient share locks."""
        max_attempts = 5
        for attempt in range(max_attempts):
            try:
                with smb.open_file(remote_file_path, mode="rb", share_access="r") as src_f:
                    yield src_f
                return
            except Exception as exc:
                is_sharing_violation = "0xc0000043" in str(exc).lower() or "sharing violation" in str(exc).lower()
                if not is_sharing_violation or attempt == max_attempts - 1:
                    raise
                delay_seconds = 0.5 * (2**attempt)
                logger.warning(
                    "SMB archive is temporarily locked; retrying read in %.1fs (%d/%d): %s",
                    delay_seconds,
                    attempt + 1,
                    max_attempts,
                    remote_file_path,
                )
                time.sleep(delay_seconds)

    # =========================================================================
    # Index Management
    # =========================================================================

    def get_index(self) -> list[dict[str, Any]]:
        if not self.index_file.exists():
            return self.reindex()

        try:
            with open(self.index_file, "r", encoding="utf-8") as f:
                items = json.load(f)
                if isinstance(items, list):
                    return items
                return []
        except Exception as e:
            logger.warning("Corrupted backup index, reindexing: %s", e)
            return self.reindex()

    def save_index(self, items: list[dict[str, Any]]) -> None:
        try:
            with open(self.index_file, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error("Failed to save backup index: %s", e)

    def reindex(self) -> list[dict[str, Any]]:
        indexed: list[dict[str, Any]] = []
        for file in sorted(self.backup_dir.glob("*.tar.gz")):
            manifest = self.read_manifest_from_archive(file)
            if manifest:
                manifest["filename"] = file.name
                manifest["size_bytes"] = file.stat().st_size
                manifest["storage_path"] = manifest.get("remote_destination") or str(file.resolve())
                indexed.append(manifest)

        indexed.sort(key=lambda x: x.get("created_at") or "")
        self.save_index(indexed)
        return indexed

    def read_manifest_from_archive(self, archive_path: Path) -> dict[str, Any] | None:
        try:
            with tarfile.open(archive_path, "r:*") as tar:
                manifest_member = tar.getmember("manifest.json")
                f = tar.extractfile(manifest_member)
                if f:
                    return json.loads(f.read().decode("utf-8"))
        except Exception as e:
            logger.warning("Could not read manifest from %s: %s", archive_path, e)
        return None

    def get_latest_backup(self, backup_type: Optional[BackupType] = None) -> dict[str, Any] | None:
        index = self.get_index()
        valid = []
        for b in index:
            if b.get("status") != "completed":
                continue
            filename = b.get("filename", "")
            remote_dest = b.get("remote_destination")
            exists_local = (self.backup_dir / filename).exists() if filename else False
            exists_remote = (
                Path(remote_dest).exists()
                if remote_dest and not remote_dest.startswith("sftp://") and not remote_dest.startswith("smb:")
                else False
            )
            if exists_local or exists_remote or b.get("remote_synced"):
                valid.append(b)

        if backup_type:
            valid = [b for b in valid if b.get("backup_type") == backup_type]

        if not valid:
            return None
        return valid[-1]

    def get_backup_by_id(self, backup_id: str) -> dict[str, Any]:
        index = self.get_index()
        for b in index:
            if b.get("backup_id") == backup_id:
                return b
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Backup with ID '{backup_id}' not found.",
        )

    # =========================================================================
    # Backup Creation Logic (Full, Differential, Incremental)
    # =========================================================================

    async def create_backup(
        self,
        backup_type: BackupType = "full",
        include_files: bool = True,
        note: str = "",
        operator_username: str = "system",
        job_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Creates a Full, Differential, or Incremental backup package exclusively."""
        if job_id is None:
            job_id = await self.acquire_job_lock("backup", backup_type, operator_username)

        now_dt = datetime.now(timezone.utc).astimezone()
        now_iso = now_dt.isoformat()
        timestamp_slug = now_dt.strftime("%Y%m%d_%H%M%S")
        random_suffix = hashlib.sha256(os.urandom(8)).hexdigest()[:6]
        backup_id = f"backup_{backup_type}_{timestamp_slug}_{random_suffix}"
        archive_name = f"{backup_id}.tar.gz"
        archive_path = self.backup_dir / archive_name

        self._cleanup_paths.append(archive_path)

        index = self.get_index()
        base_id: Optional[str] = None
        parent_id: Optional[str] = None
        cutoff_dt: Optional[datetime] = None

        if backup_type == "full":
            cutoff_dt = None
            base_id = None
            parent_id = None
        elif backup_type == "differential":
            last_full = self.get_latest_backup("full")
            if not last_full:
                logger.info("No prior full backup found for differential backup. Falling back to Full Backup.")
                backup_type = "full"
                if self._current_job:
                    self._current_job["backup_type"] = backup_type
                cutoff_dt = None
                base_id = None
                parent_id = None
            else:
                base_id = last_full["backup_id"]
                parent_id = last_full["backup_id"]
                cutoff_dt = _parse_iso(last_full["created_at"])
        elif backup_type == "incremental":
            last_backup = self.get_latest_backup()
            last_full = self.get_latest_backup("full")
            if not last_backup or not last_full:
                logger.info("No prior backup found for incremental backup. Falling back to Full Backup.")
                backup_type = "full"
                if self._current_job:
                    self._current_job["backup_type"] = backup_type
                cutoff_dt = None
                base_id = None
                parent_id = None
            else:
                base_id = last_full["backup_id"]
                parent_id = last_backup["backup_id"]
                cutoff_dt = _parse_iso(last_backup["created_at"])

        temp_dir = Path(tempfile.mkdtemp(prefix="backup_work_"))
        temp_dir.mkdir(parents=True, exist_ok=True)
        self._cleanup_paths.append(temp_dir)

        try:
            self.check_cancelled()

            # Step 1: Export Database Tables (0% -> 10%)
            await self.update_progress("exporting_database", 2)
            temp_dir.mkdir(parents=True, exist_ok=True)
            data_file = temp_dir / "data.json"
            table_stats, total_records = await self._export_database_data_to_file(data_file, cutoff_dt)
            self.check_cancelled()

            await self.update_progress("database_exported", 10, records_processed=total_records, total_records=total_records)

            # Step 2: Scan Storage Files (10% -> 15%)
            await self.update_progress("scanning_files", 12)
            cutoff_ts = cutoff_dt.timestamp() if cutoff_dt else 0.0
            files_to_archive, total_file_bytes = await asyncio.to_thread(
                self._scan_storage_files_sync, cutoff_ts if include_files else None
            )
            files_count = len(files_to_archive)
            self.check_cancelled()

            await self.update_progress("files_scanned", 15, files_processed=0, total_files=files_count)

            # Step 3: Create Manifest
            manifest = {
                "backup_id": backup_id,
                "backup_type": backup_type,
                "app_version": settings.APP_VERSION,
                "created_at": now_iso,
                "created_by": operator_username,
                "base_id": base_id,
                "parent_id": parent_id,
                "from_timestamp": cutoff_dt.isoformat() if cutoff_dt else None,
                "to_timestamp": now_iso,
                "include_files": include_files,
                "table_stats": table_stats,
                "records_count": total_records,
                "files_count": files_count,
                "files_size_bytes": total_file_bytes,
                "note": note.strip() or f"{backup_type.capitalize()} Backup",
                "status": "completed",
            }

            temp_dir.mkdir(parents=True, exist_ok=True)
            manifest_file = temp_dir / "manifest.json"
            with open(manifest_file, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)

            # Step 4: Compress into .tar.gz (15% -> 85%)
            await self.update_progress("compressing_archive", 15, files_processed=0, total_files=files_count)
            loop = asyncio.get_running_loop()
            last_broadcast_time = [0.0]
            tar_start_t = time.time()

            def on_tar_progress(done_files: int, total_f: int):
                now_t = time.time()
                pct = 15 + int((done_files / max(1, total_f)) * 70)
                if self._current_job:
                    elapsed_tar = max(0.1, now_t - tar_start_t)
                    self._current_job["stage"] = "compressing_archive"
                    self._current_job["progress_percent"] = min(85, pct)
                    self._current_job["files_processed"] = done_files
                    self._current_job["total_files"] = total_f

                    if done_files > 0:
                        rate = done_files / elapsed_tar
                        rem_files = total_f - done_files
                        est_rem = max(1, round(rem_files / rate)) + 3
                        self._current_job["estimated_remaining_seconds"] = est_rem

                    if (now_t - last_broadcast_time[0] >= 0.25) or done_files >= total_f:
                        last_broadcast_time[0] = now_t
                        asyncio.run_coroutine_threadsafe(self._broadcast_progress(), loop)

            await asyncio.to_thread(
                self._create_tar_archive_sync,
                archive_path=archive_path,
                manifest_file=manifest_file,
                data_file=data_file,
                files_to_archive=files_to_archive if include_files else [],
                progress_cb=on_tar_progress if include_files and files_count > 0 else None,
                cancel_check=lambda: self._cancel_flag,
            )
            self.check_cancelled()

            # Step 5: Compute SHA-256 (85% -> 95%)
            await self.update_progress("computing_checksum", 85)
            archive_size = archive_path.stat().st_size
            last_sha_broadcast = [0.0]
            sha_start_t = time.time()

            def on_sha_progress(done_bytes: int, total_b: int):
                now_t = time.time()
                pct = 85 + int((done_bytes / max(1, total_b)) * 10)
                if self._current_job:
                    elapsed_sha = max(0.1, now_t - sha_start_t)
                    self._current_job["stage"] = "computing_checksum"
                    self._current_job["progress_percent"] = min(95, pct)
                    if done_bytes > 0:
                        rate = done_bytes / elapsed_sha
                        rem_bytes = total_b - done_bytes
                        est_rem = max(1, round(rem_bytes / rate))
                        self._current_job["estimated_remaining_seconds"] = est_rem

                    if (now_t - last_sha_broadcast[0] >= 0.25) or done_bytes >= total_b:
                        last_sha_broadcast[0] = now_t
                        asyncio.run_coroutine_threadsafe(self._broadcast_progress(), loop)

            sha256 = await asyncio.to_thread(
                _calculate_sha256_sync, archive_path, lambda: self._cancel_flag, on_sha_progress
            )
            self.check_cancelled()

            manifest["filename"] = archive_name
            manifest["size_bytes"] = archive_size
            manifest["sha256"] = sha256

            # Step 6: Dispatch to remote storage if configured (95% -> 98%)
            storage_config = self.get_config()
            target_type = storage_config.get("storage_target_type", "local")
            if target_type != "local":
                await self.update_progress("uploading_remote", 95)
                self.check_cancelled()
                await self._dispatch_to_remote_storage(archive_path, manifest, storage_config)
                self.check_cancelled()
                await self.update_progress("uploading_remote", 98)

            # Update index
            index.append(manifest)
            self.save_index(index)

            # Successfully completed: Remove archive from cleanup list
            self._cleanup_paths = [p for p in self._cleanup_paths if p != archive_path]

            await self.update_progress("completed", 100, records_processed=total_records, files_processed=files_count)
            await self.release_job_lock("completed")

            logger.info(
                "Created %s backup %s (size: %.2f MB, records: %d, files: %d)",
                backup_type,
                backup_id,
                archive_size / (1024 * 1024),
                total_records,
                files_count,
            )
            return manifest

        except asyncio.CancelledError as ce:
            logger.warning("Backup cancelled: %s", ce)
            self._execute_cleanup_sync()
            await self.release_job_lock("cancelled", "Operation was cancelled by user.")
            raise HTTPException(
                status_code=status.HTTP_499_CLIENT_CLOSED_REQUEST if hasattr(status, "HTTP_499_CLIENT_CLOSED_REQUEST") else 400,
                detail="Backup creation was cancelled and temporary files cleared.",
            )

        except Exception as e:
            logger.exception("Backup creation failed: %s", e)
            self._execute_cleanup_sync()
            await self.release_job_lock("failed", str(e))
            raise

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    # =========================================================================
    # Database Serialization
    # =========================================================================

    async def _export_database_data_to_file(
        self, target_file: Path, cutoff_dt: Optional[datetime]
    ) -> Tuple[Dict[str, int], int]:
        tables_order = [
            "roles",
            "permissions",
            "role_permissions",
            "users",
            "support_team",
            "audit_logs",
            "alert_rules",
            "alert_events",
            "notification_settings",
            "sensor_groups",
            "sensors",
            "sensor_configs",
            "sensor_readings",
        ]

        table_stats: Dict[str, int] = {}
        total_records = 0

        cutoff_aware: Optional[datetime] = None
        cutoff_naive: Optional[datetime] = None
        if cutoff_dt:
            if cutoff_dt.tzinfo is not None:
                cutoff_aware = cutoff_dt.astimezone(timezone.utc)
                cutoff_naive = cutoff_aware.replace(tzinfo=None)
            else:
                cutoff_naive = cutoff_dt
                cutoff_aware = cutoff_naive.replace(tzinfo=timezone.utc)

        async with AsyncSessionLocal() as session:
            conn: AsyncConnection = await session.connection()

            with open(target_file, "w", encoding="utf-8") as f:
                f.write("{\n")
                first_table = True

                for table_idx, table_name in enumerate(tables_order):
                    self.check_cancelled()

                    if not first_table:
                        f.write(",\n")
                    first_table = False

                    f.write(f'  "{table_name}": [\n')

                    query_sql = f'SELECT * FROM "{table_name}"'
                    params: dict[str, Any] = {}

                    if cutoff_dt:
                        if table_name == "users":
                            query_sql += ' WHERE registered_date >= :cutoff OR (updated_at IS NOT NULL AND updated_at >= :cutoff)'
                            params["cutoff"] = cutoff_naive
                        elif table_name == "support_team":
                            query_sql += ' WHERE created_at >= :cutoff OR (updated_at IS NOT NULL AND updated_at >= :cutoff)'
                            params["cutoff"] = cutoff_aware
                        elif table_name in ("audit_logs", "alert_rules", "alert_events"):
                            query_sql += ' WHERE created_at >= :cutoff'
                            params["cutoff"] = cutoff_aware
                        elif table_name == "notification_settings":
                            query_sql += ' WHERE updated_at >= :cutoff'
                            params["cutoff"] = cutoff_aware
                        elif table_name == "sensor_readings":
                            query_sql += ' WHERE time >= :cutoff'
                            params["cutoff"] = cutoff_aware
                        elif table_name in ("sensor_groups", "sensors", "sensor_configs"):
                            query_sql += ' WHERE created_at >= :cutoff OR (updated_at IS NOT NULL AND updated_at >= :cutoff)'
                            params["cutoff"] = cutoff_aware
                        elif table_name in ("roles", "permissions", "role_permissions"):
                            # Always full copy for these reference tables
                            query_sql = f'SELECT * FROM "{table_name}"'
                            params = {}

                    res = await conn.execute(text(query_sql), params)
                    rows = [dict(r._mapping) for r in res.fetchall()]

                    table_count = 0
                    for idx, row in enumerate(rows):
                        item = {}
                        for k, v in row.items():
                            if isinstance(v, datetime):
                                item[k] = v.isoformat()
                            elif hasattr(v, "__str__") and not isinstance(v, (int, float, bool, str, list, dict, type(None))):
                                item[k] = str(v)
                            else:
                                item[k] = v

                        row_json = json.dumps(item, ensure_ascii=False)
                        if idx > 0:
                            f.write(",\n")
                        f.write(f"    {row_json}")
                        table_count += 1

                    f.write("\n  ]")
                    table_stats[table_name] = table_count
                    total_records += table_count

                    prog = 5 + int((table_idx / len(tables_order)) * 30)
                    await self.update_progress("exporting_database", prog, records_processed=total_records)

                f.write("\n}\n")

        return table_stats, total_records

    # =========================================================================
    # Storage File Scanning & Archiving
    # =========================================================================

    def _scan_storage_files_sync(self, cutoff_ts: Optional[float]) -> Tuple[List[Tuple[Path, str]], int]:
        source_dirs = [
            settings.UPLOAD_DIR,
            settings.UPLOAD_PROFILE_DIR,
        ]

        if cutoff_ts is None:
            cutoff_ts = 0.0

        files_to_archive: List[Tuple[Path, str]] = []
        total_bytes = 0

        for s_dir in source_dirs:
            if not s_dir.exists():
                continue

            rel_root = s_dir.relative_to(settings.STORAGE_DIR) if s_dir.is_relative_to(settings.STORAGE_DIR) else Path(s_dir.name)

            for root, _, files in os.walk(s_dir):
                for f in files:
                    src_file = Path(root) / f
                    try:
                        stat = src_file.stat()
                        if stat.st_mtime >= cutoff_ts:
                            rel_file = src_file.relative_to(s_dir)
                            arc_path = f"storage/{rel_root}/{rel_file}".replace("\\", "/")
                            files_to_archive.append((src_file, arc_path))
                            total_bytes += stat.st_size
                    except Exception as e:
                        logger.warning("Could not stat storage file %s: %s", src_file, e)

        return files_to_archive, total_bytes

    def _create_tar_archive_sync(
        self,
        archive_path: Path,
        manifest_file: Path,
        data_file: Path,
        files_to_archive: List[Tuple[Path, str]],
        progress_cb=None,
        cancel_check=None,
    ) -> None:
        total_files = len(files_to_archive)
        with tarfile.open(archive_path, "w:gz", compresslevel=1) as tar:
            if cancel_check and cancel_check():
                raise asyncio.CancelledError("Tarball packing cancelled")
            tar.add(manifest_file, arcname="manifest.json")
            tar.add(data_file, arcname="data.json")

            for idx, (src_file, arcname) in enumerate(files_to_archive):
                if cancel_check and cancel_check():
                    raise asyncio.CancelledError("Tarball packing cancelled")
                try:
                    tar.add(src_file, arcname=arcname)
                except Exception as e:
                    logger.warning("Failed to add file %s to archive: %s", src_file, e)

                if progress_cb:
                    progress_cb(idx + 1, total_files)

        try:
            os.chmod(archive_path, 0o666)
        except Exception:
            pass

    # =========================================================================
    # Restore Logic & Chain Resolution
    # =========================================================================

    def resolve_restore_chain(self, target_backup_id: str) -> list[dict[str, Any]]:
        index_map = {b["backup_id"]: b for b in self.get_index()}
        target = index_map.get(target_backup_id)
        if not target:
            raise ValueError(f"Backup ID '{target_backup_id}' not found in index.")

        chain: list[dict[str, Any]] = [target]
        curr = target

        visited = {target_backup_id}
        while curr.get("backup_type") != "full":
            parent_id = curr.get("parent_id") or curr.get("base_id")
            if not parent_id or parent_id not in index_map:
                logger.warning("Parent backup '%s' missing for '%s'", parent_id, curr.get("backup_id"))
                break

            if parent_id in visited:
                break

            visited.add(parent_id)
            parent_item = index_map[parent_id]
            chain.insert(0, parent_item)
            curr = parent_item

        return chain

    async def restore_backup(
        self,
        backup_id: str,
        restore_chain: bool = True,
        operator_username: str = "system",
        job_id: Optional[str] = None,
    ) -> dict[str, Any]:
        if job_id is None:
            job_id = await self.acquire_job_lock("restore", None, operator_username)

        try:
            chain = self.resolve_restore_chain(backup_id) if restore_chain else [self.get_backup_by_id(backup_id)]

            logger.info(
                "Starting restore for backup '%s' (Chain length: %d: %s)",
                backup_id,
                len(chain),
                " -> ".join([c["backup_id"] for c in chain]),
            )

            total_restored_records = 0
            total_restored_files = 0
            step_results = []

            for step_idx, backup_item in enumerate(chain, start=1):
                self.check_cancelled()
                archive_path = self.backup_dir / backup_item["filename"]
                fetched_archive: Path | None = None
                if not archive_path.exists():
                    fetched_archive = await self.fetch_remote_archive_to_temp(backup_item)
                    if not fetched_archive:
                        raise FileNotFoundError(
                            f"Backup archive '{backup_item['filename']}' is not available locally or from its remote destination."
                        )
                    archive_path = fetched_archive
                    self._cleanup_paths.append(archive_path)

                await self.update_progress(
                    f"restoring_step_{step_idx}_of_{len(chain)}",
                    int(((step_idx - 1) / len(chain)) * 90),
                )

                curr_sha = await asyncio.to_thread(_calculate_sha256_sync, archive_path)
                expected_sha = backup_item.get("sha256")
                if expected_sha and curr_sha != expected_sha:
                    raise ValueError(f"SHA-256 checksum mismatch for backup archive: {backup_item['filename']}")

                temp_extract = Path(tempfile.mkdtemp(prefix=f"restore_step_{step_idx}_"))
                self._cleanup_paths.append(temp_extract)

                try:
                    await asyncio.to_thread(self._extract_tar_sync, archive_path, temp_extract)
                    self.check_cancelled()

                    # 1. Restore Database
                    data_file = temp_extract / "data.json"
                    step_records = 0
                    if data_file.exists():
                        step_records = await self._import_database_data_from_file(data_file)
                    self.check_cancelled()

                    # 2. Restore Storage Files
                    storage_extract = temp_extract / "storage"
                    step_files = 0
                    if storage_extract.exists():
                        step_files = await asyncio.to_thread(self._import_storage_files_sync, storage_extract)

                    total_restored_records += step_records
                    total_restored_files += step_files
                    step_results.append({
                        "step": step_idx,
                        "backup_id": backup_item["backup_id"],
                        "backup_type": backup_item["backup_type"],
                        "records": step_records,
                        "files": step_files,
                    })

                finally:
                    shutil.rmtree(temp_extract, ignore_errors=True)
                    if fetched_archive:
                        fetched_archive.unlink(missing_ok=True)
                        self._cleanup_paths = [p for p in self._cleanup_paths if p != fetched_archive]

            await self.update_progress("completed", 100, records_processed=total_restored_records, files_processed=total_restored_files)
            await self.release_job_lock("completed")

            return {
                "status": "success",
                "target_backup_id": backup_id,
                "restored_by": operator_username,
                "chain_steps": step_results,
                "total_records": total_restored_records,
                "total_files": total_restored_files,
                "completed_at": _now_iso(),
            }

        except Exception as e:
            logger.exception("Restore failed: %s", e)
            self._execute_cleanup_sync()
            await self.release_job_lock("failed", str(e))
            raise

    def _extract_tar_sync(self, archive_path: Path, dest_dir: Path) -> None:
        with tarfile.open(archive_path, "r:*") as tar:
            destination = dest_dir.resolve()
            for member in tar.getmembers():
                member_path = (destination / member.name).resolve()
                if not member_path.is_relative_to(destination) or member.issym() or member.islnk() or member.isdev():
                    raise ValueError(f"Unsafe path in backup archive: {member.name}")
            tar.extractall(path=destination)

    async def _import_database_data_from_file(self, data_file: Path) -> int:
        total_imported = 0
        with open(data_file, "r", encoding="utf-8") as f:
            db_payload = json.load(f)

        tables_order = [
            "roles",
            "permissions",
            "role_permissions",
            "users",
            "support_team",
            "audit_logs",
            "alert_rules",
            "alert_events",
            "notification_settings",
            "sensor_groups",
            "sensors",
            "sensor_configs",
            "sensor_readings",
        ]

        async with AsyncSessionLocal() as session:
            conn: AsyncConnection = await session.connection()

            for table_name in tables_order:
                rows = db_payload.get(table_name, [])
                if not rows:
                    continue

                for row in rows:
                    cols = list(row.keys())
                    if not cols:
                        continue

                    col_names = ", ".join([f'"{c}"' for c in cols])
                    val_placeholders = ", ".join([f':{c}' for c in cols])

                    update_cols = [c for c in cols if c not in ("id", "created_at")]
                    if update_cols and "id" in cols:
                        update_clause = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in update_cols])
                        sql = f"""
                            INSERT INTO "{table_name}" ({col_names})
                            VALUES ({val_placeholders})
                            ON CONFLICT (id) DO UPDATE SET {update_clause}
                        """
                    elif "id" in cols:
                        sql = f"""
                            INSERT INTO "{table_name}" ({col_names})
                            VALUES ({val_placeholders})
                            ON CONFLICT (id) DO NOTHING
                        """
                    else:
                        sql = f"""
                            INSERT INTO "{table_name}" ({col_names})
                            VALUES ({val_placeholders})
                            ON CONFLICT DO NOTHING
                        """

                    try:
                        await conn.execute(text(sql), row)
                        total_imported += 1
                    except Exception as e:
                        logger.warning("Error importing row into %s: %s", table_name, e)

            await session.commit()

        return total_imported

    def _import_storage_files_sync(self, storage_extract: Path) -> int:
        total_files = 0
        dest_base = settings.STORAGE_DIR

        for root, _, files in os.walk(storage_extract):
            for f in files:
                src_file = Path(root) / f
                rel_path = src_file.relative_to(storage_extract)
                dest_file = dest_base / rel_path

                dest_file.parent.mkdir(parents=True, exist_ok=True)
                try:
                    shutil.copy2(src_file, dest_file)
                    total_files += 1
                except Exception as e:
                    logger.warning("Failed to restore storage file %s: %s", dest_file, e)

        return total_files

    # =========================================================================
    # Retention & Deletion
    # =========================================================================

    def cleanup_old_backups(self, retention_days: int = 30, max_count: int = 50) -> int:
        index = self.get_index()
        if not index:
            return 0

        now = datetime.now(timezone.utc)
        to_keep: list[dict[str, Any]] = []
        to_delete: list[dict[str, Any]] = []

        sorted_backups = sorted(index, key=lambda x: x.get("created_at") or "", reverse=True)

        for idx, item in enumerate(sorted_backups):
            created_dt = _parse_iso(item.get("created_at"))
            is_expired = False
            if created_dt and retention_days > 0:
                age_days = (now - created_dt).total_seconds() / 86400.0
                if age_days > retention_days:
                    is_expired = True

            is_over_count = idx >= max_count if max_count > 0 else False

            if is_expired or is_over_count:
                to_delete.append(item)
            else:
                to_keep.append(item)

        # Never remove a base/parent archive while a retained differential or
        # incremental archive still needs it.
        candidate_ids = {item.get("backup_id") for item in to_delete}
        index_map = {item.get("backup_id"): item for item in index if item.get("backup_id")}
        required_ids: set[str] = set()
        for item in to_keep:
            current = item
            visited: set[str] = set()
            while current.get("backup_type") != "full":
                parent_id = current.get("parent_id") or current.get("base_id")
                if not parent_id or parent_id in visited:
                    break
                visited.add(parent_id)
                required_ids.add(parent_id)
                parent = index_map.get(parent_id)
                if not parent:
                    break
                current = parent

        protected = [item for item in to_delete if item.get("backup_id") in required_ids]
        if protected:
            to_delete = [item for item in to_delete if item.get("backup_id") not in required_ids]
            to_keep.extend(protected)

        deleted_count = 0
        for item in to_delete:
            filename = item.get("filename")
            if filename:
                fpath = self.backup_dir / filename
                if fpath.exists():
                    try:
                        fpath.unlink()
                        deleted_count += 1
                    except Exception as e:
                        logger.warning("Could not delete expired backup file %s: %s", fpath, e)
                        to_keep.append(item)

        to_keep.sort(key=lambda x: x.get("created_at") or "")
        self.save_index(to_keep)
        return deleted_count

    async def delete_backup(self, backup_id: str) -> Dict[str, Any]:
        async with self._lock:
            index = self.get_index()
            target_idx = None
            for idx, b in enumerate(index):
                if b.get("backup_id") == backup_id:
                    target_idx = idx
                    break

            if target_idx is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Backup ID '{backup_id}' not found in catalog.",
                )

            dependent = next(
                (
                    item
                    for item in index
                    if item.get("backup_id") != backup_id
                    and (item.get("parent_id") == backup_id or item.get("base_id") == backup_id)
                ),
                None,
            )
            if dependent:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Backup '{backup_id}' is required by '{dependent.get('backup_id')}'. "
                        "Delete dependent backups first to keep restore chains valid."
                    ),
                )

            item = index.pop(target_idx)
            filename = item.get("filename")
            if filename:
                file_path = self.backup_dir / filename
                file_path.unlink(missing_ok=True)

            self.save_index(index)
            return {
                "status": "success",
                "deleted_backup_id": backup_id,
                "message": f"Backup '{backup_id}' was safely deleted.",
            }

    def get_stats(self) -> Dict[str, Any]:
        index = self.get_index()
        total_size = sum(b.get("size_bytes", 0) for b in index)
        full_count = sum(1 for b in index if b.get("backup_type") == "full")
        diff_count = sum(1 for b in index if b.get("backup_type") == "differential")
        inc_count = sum(1 for b in index if b.get("backup_type") == "incremental")

        last_full = self.get_latest_backup("full")
        last_diff = self.get_latest_backup("differential")
        last_inc = self.get_latest_backup("incremental")
        last_any = self.get_latest_backup()

        return {
            "total_backups": len(index),
            "full_backups": full_count,
            "differential_backups": diff_count,
            "incremental_backups": inc_count,
            "total_size_bytes": total_size,
            "total_size_formatted": f"{total_size / (1024 * 1024):.2f} MB",
            "last_backup_at": last_any.get("created_at") if last_any else None,
            "last_full_backup_at": last_full.get("created_at") if last_full else None,
            "last_differential_backup_at": last_diff.get("created_at") if last_diff else None,
            "last_incremental_backup_at": last_inc.get("created_at") if last_inc else None,
        }


backup_service = BackupService()
