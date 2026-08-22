"""Sensor Report endpoint — query historical data from TimescaleDB.

Uses time_bucket() to aggregate sensor_readings, then merges results
with the sensor registry tree (sensor_groups → sensors → sensor_configs)
to return a hierarchical response for the frontend chart view.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import get_db, require_roles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sensors", tags=["sensors"])


# =========================================================
# Schemas
# =========================================================

class SensorReportRequest(BaseModel):
    """Request body for the report endpoint."""
    start_time: str       # ISO timestamp e.g. "2024-01-01T00:00:00Z" or relative "-1d"
    stop_time: str        # ISO timestamp e.g. "2024-01-02T00:00:00Z" or "now()"
    aggregate: str = "30m"  # e.g. "30m", "1h", "1d", "1mo", "1y"
    page: Optional[int] = None       # 1-indexed page number (optional for backend pagination)
    page_size: Optional[int] = None  # number of rows per page (optional)


# =========================================================
# Helpers
# =========================================================

# Bucket expressions aligned to Asia/Bangkok timezone and calendar boundaries
_BUCKET_EXPRESSIONS = {
    "30m": "time_bucket(INTERVAL '30 minutes', time AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'",
    "1h": "date_trunc('hour', time AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'",
    "1d": "date_trunc('day', time AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'",
    "1mo": "date_trunc('month', time AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'",
    "1y": "date_trunc('year', time AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'",
}


def _parse_time(value: str) -> datetime:
    """Parse time string — supports ISO format and relative offsets like '-1d', '-7d', '-1h'."""
    value = value.strip()

    # Handle 'now()'
    if value.lower() in ("now()", "now"):
        return datetime.now(timezone.utc)

    # Handle relative offsets: -1d, -7d, -1h, -30m, -1mo, -1y
    if value.startswith("-"):
        suffix = value[-1]
        amount_str = value[1:-1]

        # Handle special case "-1mo" (month)
        if value.endswith("mo"):
            amount_str = value[1:-2]
            try:
                amount = int(amount_str)
                return datetime.now(timezone.utc) - timedelta(days=amount * 30)
            except ValueError:
                pass

        # Handle special case "-1y" (year)
        if suffix == "y":
            try:
                amount = int(amount_str)
                return datetime.now(timezone.utc) - timedelta(days=amount * 365)
            except ValueError:
                pass

        try:
            amount = int(amount_str)
            if suffix == "d":
                return datetime.now(timezone.utc) - timedelta(days=amount)
            elif suffix == "h":
                return datetime.now(timezone.utc) - timedelta(hours=amount)
            elif suffix == "m":
                return datetime.now(timezone.utc) - timedelta(minutes=amount)
        except ValueError:
            pass

    # Try ISO format
    try:
        # Handle timezone-aware ISO strings
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid time format: {value}. Use ISO format or relative offset like '-1d'.",
        )


# =========================================================
# Report Endpoint
# =========================================================

@router.post("/report")
async def get_sensor_report(
    req: SensorReportRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("page:reports")),
):
    """Query TimescaleDB for historical sensor data grouped by sensor registry.

    Uses time_bucket() to aggregate data from the sensor_readings hypertable,
    then merges with sensor_groups → sensors → sensor_configs to build a
    hierarchical response matching the frontend SensorReportResponse type.
    """
    try:
        # Parse time range
        start_dt = _parse_time(req.start_time)
        stop_dt = _parse_time(req.stop_time)

        # Validate aggregate
        bucket_expr = _BUCKET_EXPRESSIONS.get(req.aggregate)
        if not bucket_expr:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid aggregate: {req.aggregate}. Supported: {list(_BUCKET_EXPRESSIONS.keys())}",
            )

        # ─── 1. Query aggregated sensor data ──────────────────────────
        data_query = text(f"""
            SELECT
                {bucket_expr} AS bucket,
                device_name,
                metric_name,
                AVG(avg_value)  AS avg_value,
                MIN(min_value)  AS min_value,
                MAX(max_value)  AS max_value
            FROM sensor_readings
            WHERE time >= :start AND time < :stop
            GROUP BY bucket, device_name, metric_name
            ORDER BY bucket DESC
        """)

        data_result = await db.execute(
            data_query,
            {
                "start": start_dt,
                "stop": stop_dt,
            },
        )
        rows = data_result.fetchall()

        # Parse results into {metric_name: {timestamp: avg_value, ...}}
        sensor_data: dict[str, dict[str, float | None]] = {}
        timestamps_set: set[str] = set()

        for row in rows:
            metric = row.metric_name
            ts = row.bucket.isoformat() if hasattr(row.bucket, "isoformat") else str(row.bucket)
            val = row.avg_value

            if metric not in sensor_data:
                sensor_data[metric] = {}
            sensor_data[metric][ts] = val
            timestamps_set.add(ts)

        sorted_timestamps = sorted(timestamps_set, reverse=True)
        total_count = len(sorted_timestamps)

        # Pagination calculations
        is_paginated = req.page is not None and req.page_size is not None and req.page_size > 0
        if is_paginated:
            page = max(1, req.page)
            page_size = req.page_size
            total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
        else:
            page = 1
            page_size = total_count
            total_pages = 1
            start_idx = 0
            end_idx = total_count

        # ─── 2. Fetch sensor registry (groups + sensors + configs) ────
        registry_query = text("""
            SELECT
                g.id         AS group_id,
                g.name       AS group_name,
                g.display_name AS group_display_name,
                g.color      AS group_color,
                g.sort_order AS group_sort_order,
                s.id         AS sensor_id,
                s.metric_name,
                s.display_name AS sensor_display_name,
                s.sort_order AS sensor_sort_order,
                sc.unit,
                sc.decimal_places,
                sc.device_name,
                sc.alert_min,
                sc.alert_max
            FROM sensor_groups g
            LEFT JOIN sensors s ON s.group_id = g.id AND s.is_active = true
            LEFT JOIN sensor_configs sc ON sc.metric_name = s.metric_name
                                        AND sc.is_active = true
            WHERE g.is_active = true
            ORDER BY g.sort_order, s.sort_order
        """)

        registry_result = await db.execute(registry_query)
        registry_rows = registry_result.fetchall()

        # ─── 3. Build group tree with sensor data ─────────────────────
        group_map: dict[int, dict] = {}

        for row in registry_rows:
            gid = row.group_id

            # Create group entry if not exists
            if gid not in group_map:
                group_map[gid] = {
                    "group_key": row.group_name,
                    "group_index": row.group_sort_order,
                    "group_name": row.group_display_name,
                    "sub_group_name": None,
                    "sensors": [],
                    "children": [],
                }

            # Skip if no sensor in this group
            if row.sensor_id is None:
                continue

            metric = row.metric_name
            data_map = sensor_data.get(metric, {})
            all_values = [data_map.get(ts) for ts in sorted_timestamps]

            # Statistics (from the full queried data across the entire time range)
            valid_values = [v for v in all_values if v is not None]
            statistics = {
                "min": min(valid_values) if valid_values else None,
                "max": max(valid_values) if valid_values else None,
                "avg": (sum(valid_values) / len(valid_values)) if valid_values else None,
            }

            # If pagination is requested, slice the values array for this page
            if is_paginated:
                page_values = all_values[start_idx:end_idx]
            else:
                page_values = all_values

            sensor_entry = {
                "id": row.sensor_id,
                "key": metric,
                "name": row.sensor_display_name,
                "unit": row.unit or "",
                "color": row.group_color,
                "decimal_places": row.decimal_places if row.decimal_places is not None else 2,
                "values": page_values,
                "statistics": statistics,
                "alert_min": row.alert_min,
                "alert_max": row.alert_max,
            }

            # Avoid duplicate sensors (from multiple config rows)
            existing_keys = {s["key"] for s in group_map[gid]["sensors"]}
            if metric not in existing_keys:
                group_map[gid]["sensors"].append(sensor_entry)

        # Convert to list sorted by group_index
        groups = sorted(group_map.values(), key=lambda g: g.get("group_index") or 0)

        # Time range for meta
        time_range = {
            "start": sorted_timestamps[0] if sorted_timestamps else start_dt.isoformat(),
            "stop": sorted_timestamps[-1] if sorted_timestamps else stop_dt.isoformat(),
        }

        # Timestamps for response (paginated or full)
        response_timestamps = sorted_timestamps[start_idx:end_idx] if is_paginated else sorted_timestamps

        meta_info: dict = {
            "result": "sensor_report",
            "table": 0,
            "timestamps": response_timestamps,
            "time_range": time_range,
            "total_count": total_count,
        }

        if is_paginated:
            meta_info["page"] = page
            meta_info["page_size"] = page_size
            meta_info["total_pages"] = total_pages

        return {
            "status": "success",
            "meta": meta_info,
            "data": groups,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report query error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
