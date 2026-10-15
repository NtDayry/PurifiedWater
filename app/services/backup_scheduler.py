"""
app/services/backup_scheduler.py
--------------------------------
Background task that monitors backup configuration and triggers automatic
scheduled backups (Full / Differential / Incremental) and retention cleanups.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.services.backup_service import backup_service

logger = logging.getLogger(__name__)


async def backup_scheduler_worker():
    """Background worker that periodically checks if a scheduled backup is due."""
    logger.info("Starting Backup Scheduler worker...")

    while True:
        try:
            # Check every 60 seconds
            await asyncio.sleep(60)

            config = backup_service.get_config()
            if not config.get("enabled", False):
                continue

            if backup_service.is_busy():
                continue

            now = datetime.now(timezone.utc).astimezone()
            last_run_iso = config.get("last_run_at")
            interval_hours = config.get("schedule_interval_hours", 24)
            full_interval_days = config.get("full_backup_interval_days", 7)
            preferred_type = config.get("auto_backup_type", "incremental")
            include_files = config.get("include_files", True)
            retention_days = config.get("retention_days", 30)
            max_count = config.get("max_backup_count", 50)

            is_due = False
            if not last_run_iso:
                is_due = True
            else:
                try:
                    last_run = datetime.fromisoformat(last_run_iso)
                    elapsed_hours = (now - last_run).total_seconds() / 3600.0
                    if elapsed_hours >= interval_hours:
                        is_due = True
                except Exception:
                    is_due = True

            if is_due:
                stats = backup_service.get_stats()
                last_full_iso = stats.get("last_full_backup_at")
                should_run_full = False

                if not last_full_iso:
                    should_run_full = True
                else:
                    try:
                        last_full = datetime.fromisoformat(last_full_iso)
                        elapsed_days = (now - last_full).total_seconds() / 86400.0
                        if elapsed_days >= full_interval_days:
                            should_run_full = True
                    except Exception:
                        should_run_full = True

                backup_type_to_run = "full" if should_run_full else preferred_type

                logger.info(
                    "Auto Backup triggered: type=%s, include_files=%s",
                    backup_type_to_run,
                    include_files,
                )

                try:
                    await backup_service.create_backup(
                        backup_type=backup_type_to_run,
                        include_files=include_files,
                        note="Automated Scheduled Backup",
                        operator_username="scheduler",
                    )
                except Exception as e:
                    logger.exception("Automated backup failed: %s", e)

                # Run retention cleanup
                try:
                    cleaned = backup_service.cleanup_old_backups(
                        retention_days=retention_days,
                        max_count=max_count,
                    )
                    if cleaned > 0:
                        logger.info("Automated cleanup removed %d old backups", cleaned)
                except Exception as e:
                    logger.warning("Automated backup cleanup encountered an issue: %s", e)

                config["last_run_at"] = now.isoformat()
                backup_service.save_config(config)

        except asyncio.CancelledError:
            logger.info("Backup Scheduler worker cancelled.")
            break
        except Exception as e:
            logger.exception("Error in Backup Scheduler loop: %s", e)
            await asyncio.sleep(60)
