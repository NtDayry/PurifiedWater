"""
app/api/routes/backup.py
------------------------
REST Endpoints for Full, Differential, and Incremental Backup & Restore operations.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import urllib.parse
from pathlib import Path
from typing import Any, List, Literal, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import get_current_user, get_db, require_roles
from app.core.audit_log import create_audit_log
from app.services.backup_service import BackupType, backup_service, _calculate_sha256_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backup", tags=["backup"])


class CreateBackupPayload(BaseModel):
    backup_type: BackupType = Field(default="full", description="full | differential | incremental")
    include_files: bool = Field(default=True, description="Include images and storage files")
    note: Optional[str] = Field(default="", max_length=500, description="Optional note or description")


class RestoreBackupPayload(BaseModel):
    backup_id: str = Field(..., min_length=1, description="Target backup ID to restore")
    restore_chain: bool = Field(
        default=True,
        description="Whether to automatically restore base/parent backups in chain",
    )


class CancelBackupPayload(BaseModel):
    reason: Optional[str] = Field(default="User initiated cancellation", max_length=200)


class CustomLocalConfig(BaseModel):
    directory_path: str = Field(default="", description="Path on local machine or mounted drive e.g. D:/backups")


class NetworkShareConfig(BaseModel):
    share_path: str = Field(default="", description="UNC or SMB path e.g. //192.168.1.100/backups")
    username: Optional[str] = Field(default="", description="Domain/Share username")
    password: Optional[str] = Field(default="", description="Domain/Share password")
    domain: Optional[str] = Field(default="", description="Windows Domain / Workgroup")


class SFTPConfig(BaseModel):
    host: str = Field(default="", description="SFTP Host / IP")
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(default="", description="SSH Username")
    password: Optional[str] = Field(default="", description="SSH Password")
    remote_path: str = Field(default="/backups", description="Destination directory on remote host")


class BackupConfigPayload(BaseModel):
    enabled: bool = Field(default=False)
    schedule_interval_hours: int = Field(default=24, ge=1, le=720)
    full_backup_interval_days: int = Field(default=7, ge=1, le=365)
    auto_backup_type: Literal["incremental", "differential"] = Field(default="incremental")
    retention_days: int = Field(default=30, ge=1, le=3650)
    max_backup_count: int = Field(default=50, ge=1, le=1000)
    include_files: bool = Field(default=True)
    storage_target_type: Literal["local", "custom_local", "network_share", "sftp"] = Field(default="local")
    retain_local_copy: bool = Field(default=True)
    custom_local: Optional[CustomLocalConfig] = None
    network_share: Optional[NetworkShareConfig] = None
    sftp: Optional[SFTPConfig] = None


class TestStorageConnectionPayload(BaseModel):
    storage_target_type: Literal["local", "custom_local", "network_share", "sftp"] = Field(default="local")
    custom_local: Optional[CustomLocalConfig] = None
    network_share: Optional[NetworkShareConfig] = None
    sftp: Optional[SFTPConfig] = None


# =============================================================================
# Routes
# =============================================================================

@router.get("/current-job")
async def get_current_backup_job(
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Retrieve current backup/restore job state, progress, and operator info."""
    return backup_service.get_current_job_state()


@router.post("/cancel")
async def cancel_backup_job(
    payload: Optional[CancelBackupPayload] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Cancel currently running backup/restore job, safely cleanup partial files and reset lock."""
    username = getattr(current_user, "username", "admin")
    reason = payload.reason if payload else "User requested stop"
    result = await backup_service.cancel_current_job(operator_username=username, reason=reason)

    if request:
        await create_audit_log(
            db=db,
            request=request,
            current_user=current_user,
            action="CANCEL_BACKUP_JOB",
            entity="BACKUP",
            entity_id=result.get("job_id"),
            old_data=None,
            new_data=result,
        )
        await db.commit()

    return result


@router.get("/stats")
async def get_backup_stats(
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Retrieve statistical overview of backup storage and history."""
    return backup_service.get_stats()


@router.get("/config")
async def get_backup_config(
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Retrieve current backup automation and schedule settings."""
    return backup_service.get_config()


@router.put("/config")
async def update_backup_config(
    payload: BackupConfigPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Update backup automation, schedule, and retention settings."""
    old_config = backup_service.get_config()
    new_data = payload.model_dump()
    backup_service.save_config(new_data)

    await create_audit_log(
        db=db,
        request=request,
        current_user=current_user,
        action="UPDATE_BACKUP_CONFIG",
        entity="BACKUP_CONFIG",
        entity_id=None,
        old_data=old_config,
        new_data=new_data,
    )
    # If remote storage is selected, trigger background sync for any unsynced local backups
    target_type = new_data.get("storage_target_type", "local")
    if target_type != "local":
        asyncio.create_task(backup_service.sync_all_backups_to_remote())

    return {
        "status": "success",
        "message": "Backup configuration updated successfully.",
        "config": new_data,
    }


@router.post("/sync-remote")
async def sync_remote_storage(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Sync all unsynced local backups to the currently configured remote storage destination."""
    res = await backup_service.sync_all_backups_to_remote()
    try:
        await create_audit_log(
            db=db,
            request=request,
            current_user=current_user,
            action="SYNC_BACKUP_STORAGE",
            entity="BACKUP",
            entity_id=None,
            old_data=None,
            new_data=res,
        )
        await db.commit()
    except Exception:
        pass
    return res


@router.post("/config/test-connection")
@router.post("/test-connection")
async def test_storage_connection(
    payload: TestStorageConnectionPayload,
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Test read/write permissions, path validity, and latency of target storage destination."""
    return await backup_service.test_storage_connection(payload.model_dump())


@router.get("/list")
async def get_backup_list(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Paginated list of completed backup archives."""
    all_backups = backup_service.get_index()

    filtered = []
    for b in all_backups:
        filename = b.get("filename", "")
        rem_dest = b.get("remote_destination")
        storage_path = b.get("storage_path") or rem_dest or str((backup_service.backup_dir / filename).resolve() if filename else "")
        b["storage_path"] = storage_path

        if type and type != "all" and b.get("backup_type") != type:
            continue
        if search:
            q = search.lower()
            match_id = q in b.get("backup_id", "").lower()
            match_file = q in filename.lower()
            match_note = q in b.get("note", "").lower()
            match_path = q in storage_path.lower()
            if not (match_id or match_file or match_note or match_path):
                continue
        filtered.append(b)

    filtered.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    total = len(filtered)
    total_pages = max(1, (total + limit - 1) // limit)
    start = (page - 1) * limit
    end = start + limit
    items = filtered[start:end]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "items": items,
    }


@router.get("/info/{backup_id}")
async def get_backup_info(
    backup_id: str,
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Retrieve full manifest and restore chain details for a specific backup."""
    backup_item = backup_service.get_backup_by_id(backup_id)
    chain = backup_service.resolve_restore_chain(backup_id)
    return {
        "backup": backup_item,
        "restore_chain": chain,
    }


@router.post("/create")
async def create_backup_endpoint(
    payload: CreateBackupPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Create a Full, Differential, or Incremental backup package asynchronously."""
    username = getattr(current_user, "username", "admin")
    job_id = await backup_service.acquire_job_lock("backup", payload.backup_type, username)

    async def _run_backup():
        try:
            await backup_service.create_backup(
                backup_type=payload.backup_type,
                include_files=payload.include_files,
                note=payload.note or "",
                operator_username=username,
                job_id=job_id,
            )
        except Exception as e:
            logger.exception("Async backup execution failed: %s", e)

    try:
        await create_audit_log(
            db=db,
            request=request,
            current_user=current_user,
            action="CREATE_BACKUP",
            entity="BACKUP",
            entity_id=None,
            old_data=None,
            new_data={"backup_type": payload.backup_type, "include_files": payload.include_files, "note": payload.note},
        )
        await db.commit()
    except Exception:
        await backup_service.release_job_lock("failed", "Could not record backup audit log.")
        raise

    asyncio.create_task(_run_backup())

    return {
        "status": "initiated",
        "job_id": job_id,
        "message": f"{payload.backup_type.capitalize()} backup process started in background.",
        "operator": username,
    }


@router.post("/restore")
async def restore_backup_endpoint(
    payload: RestoreBackupPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Restore database and files from target backup package."""
    username = getattr(current_user, "username", "admin")
    if payload.restore_chain:
        backup_service.resolve_restore_chain(payload.backup_id)
    else:
        backup_service.get_backup_by_id(payload.backup_id)
    job_id = await backup_service.acquire_job_lock("restore", None, username)

    async def _run_restore():
        try:
            await backup_service.restore_backup(
                backup_id=payload.backup_id,
                restore_chain=payload.restore_chain,
                operator_username=username,
                job_id=job_id,
            )
        except Exception as e:
            logger.exception("Async restore execution failed: %s", e)

    try:
        await create_audit_log(
            db=db,
            request=request,
            current_user=current_user,
            action="RESTORE_BACKUP",
            entity="BACKUP",
            entity_id=payload.backup_id,
            old_data=None,
            new_data={"backup_id": payload.backup_id, "restore_chain": payload.restore_chain},
        )
        await db.commit()
    except Exception:
        await backup_service.release_job_lock("failed", "Could not record restore audit log.")
        raise

    asyncio.create_task(_run_restore())

    return {
        "status": "initiated",
        "job_id": job_id,
        "message": f"Restore process for '{payload.backup_id}' started in background.",
        "operator": username,
    }


@router.get("/download/{backup_id}")
async def download_backup_file(
    backup_id: str,
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """
    Download backup archive file via streaming pipeline (Zero Temp Disk, Fast TTFB).
    Streams chunks directly: Local Disk / NAS / SFTP -> RAM Chunk -> HTTP Client.
    """
    backup_item = backup_service.get_backup_by_id(backup_id)
    filename = backup_item["filename"]
    encoded_filename = urllib.parse.quote(filename)
    size_bytes = backup_item.get("size_bytes", 0)

    # Pre-verify and peek first chunk before sending 200 OK headers
    stream = backup_service.stream_remote_archive_chunks(backup_item)
    try:
        first_chunk = next(stream)
    except StopIteration:
        first_chunk = b""
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to open backup archive stream for %s: %s", filename, e)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Archive file '{filename}' not found or inaccessible.",
        )

    def _chained_stream():
        if first_chunk:
            yield first_chunk
        yield from stream

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"; filename*=UTF-8\'\'{encoded_filename}',
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache, no-transform",
    }
    if size_bytes > 0:
        headers["Content-Length"] = str(size_bytes)

    return StreamingResponse(
        content=_chained_stream(),
        media_type="application/gzip",
        headers=headers,
    )


@router.post("/upload")
async def upload_backup_file(
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Upload an external backup archive into server backup storage."""
    filename = Path(file.filename or "").name
    if not filename or not (filename.lower().endswith(".tar.gz") or filename.lower().endswith(".tar")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a .tar.gz or .tar backup archive.",
        )

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=backup_service.backup_dir, prefix=".upload_", suffix=".tmp", delete=False
        ) as buffer:
            temp_path = Path(buffer.name)
            shutil.copyfileobj(file.file, buffer)

        manifest = backup_service.read_manifest_from_archive(temp_path)
        if not manifest:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid backup archive: manifest.json not found.",
            )

        dest_path = backup_service.backup_dir / filename
        if dest_path.exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A backup archive named '{filename}' already exists.",
            )

        index = backup_service.get_index()
        if any(b.get("backup_id") == manifest.get("backup_id") for b in index):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Backup ID '{manifest.get('backup_id')}' already exists in the catalog.",
            )

        temp_path.replace(dest_path)
        temp_path = None
        try:
            os.chmod(dest_path, 0o666)
        except Exception:
            pass
        manifest["filename"] = filename
        manifest["size_bytes"] = dest_path.stat().st_size
        manifest["storage_path"] = str(dest_path)

        if not manifest.get("sha256"):
            try:
                manifest["sha256"] = await asyncio.to_thread(_calculate_sha256_sync, dest_path)
            except Exception as e:
                logger.warning("Could not calculate sha256 for uploaded backup %s: %s", filename, e)

        # Dispatch to configured storage destination (custom_local, network_share, sftp)
        storage_config = backup_service.get_config()
        target_type = storage_config.get("storage_target_type", "local")
        if target_type != "local":
            try:
                await backup_service._dispatch_to_remote_storage(dest_path, manifest, storage_config)
                if manifest.get("remote_destination"):
                    manifest["storage_path"] = manifest["remote_destination"]
            except Exception as dispatch_err:
                logger.error(
                    "Failed to dispatch uploaded backup '%s' to target '%s': %s",
                    filename,
                    target_type,
                    dispatch_err,
                )
                dest_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to dispatch uploaded backup to storage destination '{target_type}': {dispatch_err}",
                )

        index.append(manifest)
        backup_service.save_index(index)

        if request:
            await create_audit_log(
                db=db,
                request=request,
                current_user=current_user,
                action="UPLOAD_BACKUP_FILE",
                entity="BACKUP",
                entity_id=manifest.get("backup_id"),
                old_data=None,
                new_data={"filename": file.filename, "size_bytes": manifest["size_bytes"]},
            )
            await db.commit()

        target_msg = f" and dispatched to '{target_type}'" if target_type != "local" else ""
        return {
            "status": "success",
            "message": f"Backup file '{filename}' uploaded{target_msg} successfully.",
            "backup": manifest,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to upload backup file: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process uploaded file: {e}",
        )
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)


@router.delete("/{backup_id}")
async def delete_backup(
    backup_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("system:backup_restore", "page:settings")),
):
    """Delete a backup archive and update catalog."""
    result = await backup_service.delete_backup(backup_id)

    await create_audit_log(
        db=db,
        request=request,
        current_user=current_user,
        action="DELETE_BACKUP",
        entity="BACKUP",
        entity_id=backup_id,
        old_data=None,
        new_data=result,
    )
    await db.commit()

    return result
