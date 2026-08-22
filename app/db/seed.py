"""
app/db/seed.py
--------------
Seed ข้อมูล default เข้า database จากไฟล์ CSV ใน assets/sql/default/

ลำดับการ seed ต้องตาม FK dependency:
  1. roles
  2. permissions
  3. role_permissions   (FK → roles, permissions)
  4. users              (FK → roles.role_name)
  5. support_team       (ไม่มี FK)

แต่ละตารางจะ seed เฉพาะเมื่อตารางนั้น "ว่างเปล่า" เท่านั้น
→ idempotent: restart หลายครั้งก็ไม่ duplicate
"""

from __future__ import annotations

import csv
import logging
from pathlib import Path

from datetime import datetime

from sqlalchemy import text, bindparam
from sqlalchemy.ext.asyncio import AsyncConnection

logger = logging.getLogger(__name__)

# Path ไปยังโฟลเดอร์ CSV (relative จาก project root ที่ uvicorn รัน)
_DEFAULT_DATA_DIR = Path("assets/sql/default")


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _csv_rows(filename: str) -> list[dict]:
    """อ่าน CSV และคืนเป็น list of dict พร้อมแปลง NULL/None/empty string เป็น None"""
    path = _DEFAULT_DATA_DIR / filename
    if not path.exists():
        logger.warning("Seed file not found: %s", path)
        return []

    rows: list[dict] = []
    with path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cleaned = {
                k: (None if v in ("NULL", "None", "") else v)
                for k, v in row.items()
            }
            rows.append(cleaned)
    return rows


def _parse_dt(value: str | None) -> datetime | None:
    """แปลง ISO datetime string จาก CSV เป็น datetime object

    รองรับ format:
    - '2026-05-16 07:54:44.004047'
    - '2026-05-30 06:35:42.263417+00'
    - None / 'NULL' / '' → None
    """
    if value is None:
        return None
    # ตัด trailing timezone offset แบบ '+00' ก่อน fromisoformat (Python < 3.11 ไม่รอง +00)
    v = value.strip()
    if v.endswith("+00"):
        v = v[:-3] + "+00:00"
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        return None


async def _table_is_empty(conn: AsyncConnection, table_name: str) -> bool:
    """ตรวจว่าตารางว่างเปล่า — ใช้ตัดสินใจว่าจะ seed หรือไม่"""
    result = await conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
    count = result.scalar()
    return (count or 0) == 0


# ---------------------------------------------------------------------------
# Seed Functions (ตามลำดับ FK)
# ---------------------------------------------------------------------------

async def _seed_roles(conn: AsyncConnection) -> None:
    rows = _csv_rows("roles.csv")
    if not rows:
        return

    for row in rows:
        await conn.execute(
            text("""
                INSERT INTO roles (role_id, role_name, description, is_full_access)
                VALUES (:role_id, :role_name, :description, :is_full_access)
                ON CONFLICT (role_id) DO UPDATE SET
                    role_name = EXCLUDED.role_name,
                    description = EXCLUDED.description,
                    is_full_access = EXCLUDED.is_full_access
            """),
            {
                "role_id": int(row["role_id"]),
                "role_name": row["role_name"],
                "description": row["description"],
                "is_full_access": str(row["is_full_access"]).strip().lower() == "true"
                    if row["is_full_access"] else False,
            },
        )
    logger.info("roles: synced %d rows.", len(rows))


async def _seed_permissions(conn: AsyncConnection) -> None:
    rows = _csv_rows("permissions.csv")
    if not rows:
        return

    csv_perm_ids = [int(r["permission_id"]) for r in rows]

    # Delete obsolete role permissions and permissions not in CSV
    await conn.execute(
        text("DELETE FROM role_permissions WHERE permission_id NOT IN :ids").bindparams(
            bindparam("ids", expanding=True)
        ),
        {"ids": csv_perm_ids},
    )
    await conn.execute(
        text("DELETE FROM permissions WHERE permission_id NOT IN :ids").bindparams(
            bindparam("ids", expanding=True)
        ),
        {"ids": csv_perm_ids},
    )

    for row in rows:
        await conn.execute(
            text("""
                INSERT INTO permissions (permission_id, permission_key, description_th, description_en)
                VALUES (:permission_id, :permission_key, :description_th, :description_en)
                ON CONFLICT (permission_id) DO UPDATE SET
                    permission_key = EXCLUDED.permission_key,
                    description_th = EXCLUDED.description_th,
                    description_en = EXCLUDED.description_en
            """),
            {
                "permission_id": int(row["permission_id"]),
                "permission_key": row["permission_key"],
                "description_th": row["description_th"],
                "description_en": row["description_en"],
            },
        )
    logger.info("permissions: synced %d rows.", len(rows))


async def _seed_role_permissions(conn: AsyncConnection) -> None:
    rows = _csv_rows("role_permissions.csv")
    if not rows:
        return

    # Clear and re-sync default role permissions
    await conn.execute(text("DELETE FROM role_permissions"))

    for row in rows:
        await conn.execute(
            text("""
                INSERT INTO role_permissions (role_id, permission_id)
                VALUES (:role_id, :permission_id)
                ON CONFLICT DO NOTHING
            """),
            {
                "role_id": int(row["role_id"]),
                "permission_id": int(row["permission_id"]),
            },
        )
    logger.info("role_permissions: synced %d rows.", len(rows))
    try:
        from app.core.redis_client import delete_role_permissions_cache
        for r_name in ["admin", "operator", "viewer", "super admin"]:
            await delete_role_permissions_cache(r_name)
    except Exception:
        pass


async def _seed_users(conn: AsyncConnection) -> None:
    if not await _table_is_empty(conn, "users"):
        logger.debug("users: already has data, skipping seed.")
        return

    # ดึงค่าจาก settings (env vars หรือ default)
    from app.core.config import settings
    from app.core.security import hash_password

    username = settings.APP_ADMIN_USERNAME
    hashed   = hash_password(settings.APP_ADMIN_PASSWORD)
    role     = settings.APP_ADMIN_ROLE

    await conn.execute(
        text("""
            INSERT INTO users (fullname, username, hashed_password, role, status, sign_in_attempts)
            VALUES (:fullname, :username, :hashed_password, :role, :status, :sign_in_attempts)
            ON CONFLICT DO NOTHING
        """),
        {
            "fullname": username,
            "username": username,
            "hashed_password": hashed,
            "role": role,
            "status": "active",
            "sign_in_attempts": 0,
        },
    )
    logger.info("users: seeded default admin user '%s' (role: %s).", username, role)


async def _seed_support_team(conn: AsyncConnection) -> None:
    if not await _table_is_empty(conn, "support_team"):
        logger.debug("support_team: already has data, skipping seed.")
        return

    rows = _csv_rows("support_team.csv")
    if not rows:
        return

    for row in rows:
        await conn.execute(
            text("""
                INSERT INTO support_team (
                    id, name_th, name_en, role_th, role_en,
                    created_at, updated_at, profile_image
                )
                VALUES (
                    :id, :name_th, :name_en, :role_th, :role_en,
                    :created_at, :updated_at, :profile_image
                )
                ON CONFLICT DO NOTHING
            """),
            {
                "id": int(row["id"]),
                "name_th": row["name_th"],
                "name_en": row["name_en"],
                "role_th": row["role_th"],
                "role_en": row["role_en"],
                "created_at": _parse_dt(row["created_at"]),
                "updated_at": _parse_dt(row["updated_at"]),
                "profile_image": row["profile_image"],
            },
        )
    logger.info("support_team: seeded %d rows.", len(rows))


async def _seed_sensor_configs(conn: AsyncConnection) -> None:
    """Seed default sensor configs (idempotent — ข้ามถ้ามีข้อมูลอยู่แล้ว)"""
    if not await _table_is_empty(conn, "sensor_configs"):
        logger.debug("sensor_configs: already has data, skipping seed.")
        return

    default_configs = [
        # water_flow
        {"device_name": "water_flow",         "metric_name": "water_meter",       "decode_type": "bcd_hex",       "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "m³",     "decimal_places": 2},
        {"device_name": "water_flow",         "metric_name": "flow_rate",         "decode_type": "bcd_hex",       "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "m³/h",   "decimal_places": 2},
        # ro_system
        {"device_name": "ro_system",          "metric_name": "ro1_conduct",       "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "µS/cm",  "decimal_places": 2},
        {"device_name": "ro_system",          "metric_name": "ro1_temp",          "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "°C",     "decimal_places": 1},
        {"device_name": "ro_system",          "metric_name": "ro2_conduct",       "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "µS/cm",  "decimal_places": 2},
        {"device_name": "ro_system",          "metric_name": "ro2_temp",          "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "°C",     "decimal_places": 1},
        {"device_name": "ro_system",          "metric_name": "edi_conduct",       "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "µS/cm",  "decimal_places": 2},
        {"device_name": "ro_system",          "metric_name": "edi_temp",          "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "°C",     "decimal_places": 1},
        # distribution_loop
        {"device_name": "distribution_loop",  "metric_name": "toc",               "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "ppb",    "decimal_places": 1},
        {"device_name": "distribution_loop",  "metric_name": "toc_temp",          "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "°C",     "decimal_places": 1},
        {"device_name": "distribution_loop",  "metric_name": "dis_loop_conduct",  "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "µS/cm",  "decimal_places": 2},
        {"device_name": "distribution_loop",  "metric_name": "dis_loop_temp",     "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "°C",     "decimal_places": 1},
        {"device_name": "distribution_loop",  "metric_name": "water_level",       "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 2000.0, "unit": "mm",    "decimal_places": 0},
        {"device_name": "distribution_loop",  "metric_name": "uv3",               "decode_type": "analog_4_20ma", "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "mJ/cm²", "decimal_places": 1},
        # flow_metrics
        {"device_name": "flow_metrics",       "metric_name": "instant_flow_rate", "decode_type": "float32_cdab",  "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 100.0, "unit": "m³/h",   "decimal_places": 2},
        {"device_name": "flow_metrics",       "metric_name": "fluid_velocity",    "decode_type": "float32_cdab",  "raw_min": 0, "raw_max": 20000, "range_min": 0.0, "range_max": 10.0,  "unit": "m/s",    "decimal_places": 3},
    ]

    for cfg in default_configs:
        await conn.execute(
            text("""
                INSERT INTO sensor_configs
                    (device_name, metric_name, decode_type, raw_min, raw_max,
                     range_min, range_max, unit, decimal_places, is_active)
                VALUES
                    (:device_name, :metric_name, :decode_type, :raw_min, :raw_max,
                     :range_min, :range_max, :unit, :decimal_places, true)
                ON CONFLICT DO NOTHING
            """),
            cfg,
        )
    logger.info("sensor_configs: seeded %d default configs.", len(default_configs))


async def _seed_sensor_groups(conn: AsyncConnection) -> None:
    """Seed sensor groups with display ordering."""
    if not await _table_is_empty(conn, "sensor_groups"):
        logger.debug("sensor_groups: already has data, skipping seed.")
        return

    groups = [
        {"name": "water_flow",        "display_name": "Water Flow",        "color": "#34d399", "sort_order": 1},
        {"name": "ro_system",         "display_name": "RO System",         "color": "#818cf8", "sort_order": 2},
        {"name": "distribution_loop", "display_name": "Distribution Loop", "color": "#f43f5e", "sort_order": 3},
        {"name": "flow_metrics",      "display_name": "Flow Metrics",      "color": "#fb923c", "sort_order": 4},
    ]

    for g in groups:
        await conn.execute(
            text("""
                INSERT INTO sensor_groups (name, display_name, color, sort_order, is_active)
                VALUES (:name, :display_name, :color, :sort_order, true)
                ON CONFLICT DO NOTHING
            """),
            g,
        )
    logger.info("sensor_groups: seeded %d groups.", len(groups))


async def _seed_sensors(conn: AsyncConnection) -> None:
    """Seed individual sensors with display ordering within groups."""
    if not await _table_is_empty(conn, "sensors"):
        logger.debug("sensors: already has data, skipping seed.")
        return

    sensors = [
        # water_flow
        {"group_name": "water_flow",        "metric_name": "water_meter",       "display_name": "Water Meter",           "sort_order": 1},
        {"group_name": "water_flow",        "metric_name": "flow_rate",         "display_name": "Flow Rate",             "sort_order": 2},
        # ro_system
        {"group_name": "ro_system",         "metric_name": "ro1_conduct",       "display_name": "RO1 Conductivity",      "sort_order": 1},
        {"group_name": "ro_system",         "metric_name": "ro1_temp",          "display_name": "RO1 Temperature",       "sort_order": 2},
        {"group_name": "ro_system",         "metric_name": "ro2_conduct",       "display_name": "RO2 Conductivity",      "sort_order": 3},
        {"group_name": "ro_system",         "metric_name": "ro2_temp",          "display_name": "RO2 Temperature",       "sort_order": 4},
        {"group_name": "ro_system",         "metric_name": "edi_conduct",       "display_name": "EDI Conductivity",      "sort_order": 5},
        {"group_name": "ro_system",         "metric_name": "edi_temp",          "display_name": "EDI Temperature",       "sort_order": 6},
        # distribution_loop
        {"group_name": "distribution_loop", "metric_name": "toc",               "display_name": "TOC",                   "sort_order": 1},
        {"group_name": "distribution_loop", "metric_name": "toc_temp",          "display_name": "TOC Temperature",       "sort_order": 2},
        {"group_name": "distribution_loop", "metric_name": "dis_loop_conduct",  "display_name": "Loop Conductivity",     "sort_order": 3},
        {"group_name": "distribution_loop", "metric_name": "dis_loop_temp",     "display_name": "Loop Temperature",      "sort_order": 4},
        {"group_name": "distribution_loop", "metric_name": "water_level",       "display_name": "Water Level",           "sort_order": 5},
        {"group_name": "distribution_loop", "metric_name": "uv3",              "display_name": "UV Intensity",           "sort_order": 6},
        # flow_metrics
        {"group_name": "flow_metrics",      "metric_name": "instant_flow_rate", "display_name": "Instant Flow Rate",     "sort_order": 1},
        {"group_name": "flow_metrics",      "metric_name": "fluid_velocity",    "display_name": "Fluid Velocity",        "sort_order": 2},
    ]

    for s in sensors:
        # Lookup group_id by name
        result = await conn.execute(
            text("SELECT id FROM sensor_groups WHERE name = :name"),
            {"name": s["group_name"]},
        )
        row = result.fetchone()
        if not row:
            logger.warning("sensor_groups: group '%s' not found, skipping sensor '%s'", s["group_name"], s["metric_name"])
            continue

        await conn.execute(
            text("""
                INSERT INTO sensors (group_id, metric_name, display_name, sort_order, is_active)
                VALUES (:group_id, :metric_name, :display_name, :sort_order, true)
                ON CONFLICT DO NOTHING
            """),
            {
                "group_id": row[0],
                "metric_name": s["metric_name"],
                "display_name": s["display_name"],
                "sort_order": s["sort_order"],
            },
        )
    logger.info("sensors: seeded %d sensors.", len(sensors))


async def _link_sensor_configs_to_sensors(conn: AsyncConnection) -> None:
    """Backfill sensor_id on sensor_configs by matching device_name/metric_name."""
    try:
        await conn.execute(text("""
            UPDATE sensor_configs sc
            SET sensor_id = s.id
            FROM sensors s
            JOIN sensor_groups sg ON s.group_id = sg.id
            WHERE sc.device_name = sg.name
              AND sc.metric_name = s.metric_name
              AND sc.sensor_id IS NULL
        """))
        logger.info("sensor_configs: linked existing configs to sensors table.")
    except Exception:
        logger.exception("Failed to link sensor_configs to sensors.")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def seed_default_data(conn: AsyncConnection) -> None:
    """Seed ข้อมูล default ทั้งหมดตามลำดับ FK dependency

    เรียกหลัง create_all() ใน init_db()
    แต่ละตารางจะ skip อัตโนมัติถ้ามีข้อมูลอยู่แล้ว (idempotent)
    """
    logger.info("Seeding default data...")
    await _seed_roles(conn)
    await _seed_permissions(conn)
    await _seed_role_permissions(conn)
    await _seed_users(conn)
    await _seed_support_team(conn)
    await _seed_sensor_groups(conn)
    await _seed_sensors(conn)
    await _seed_sensor_configs(conn)
    await _link_sensor_configs_to_sensors(conn)
    logger.info("Default data seeding complete.")
