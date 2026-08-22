from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import logging
from sqlalchemy import text
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

logger = logging.getLogger(__name__)

class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """สร้างตาราง database อัตโนมัติจาก SQLAlchemy models

    - import ทุก model เพื่อให้ Base.metadata รู้จักตาราง
    - เปิดใช้ pg_trgm extension (สำหรับ GIN index ค้นหาแบบ fuzzy)
    - สร้างทุกตารางด้วย create_all (checkfirst=True = ข้ามถ้ามีอยู่แล้ว)
    - สร้าง indexes ที่ไม่สามารถกำหนดผ่าน model ได้โดยตรง
    - seed ข้อมูล default จาก assets/sql/default/*.csv (ข้ามถ้ามีข้อมูลแล้ว)
    """
    # === Import ทุก model เพื่อ register เข้า Base.metadata ===
    import app.db.models.auth_model          # noqa: F401  (Role, Permission, RolePermission, User)
    import app.db.models.audit_log_model     # noqa: F401  (AuditLog)
    import app.db.models.support_team_model  # noqa: F401  (SupportTeam)
    import app.db.models.sensor_model        # noqa: F401  (SensorReading, SensorConfig)
    import app.db.models.alert_model         # noqa: F401  (AlertRule, AlertEvent)

    async with engine.begin() as conn:
        # === เปิดใช้ pg_trgm extension (สำหรับ GIN fuzzy search index) ===
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

        # === สร้างตารางทั้งหมดจาก model (ข้ามถ้ามีอยู่แล้ว) ===
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)

        # === สร้าง GIN Indexes (ต้องใช้ pg_trgm จึงสร้างแยกด้วย raw SQL) ===
        gin_indexes = [
            # users — ค้นหาชื่อ/username/แผนก แบบ fuzzy
            "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)",
            "CREATE INDEX IF NOT EXISTS idx_users_fullname_trgm ON users USING GIN (fullname gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING GIN (username gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_users_department_trgm ON users USING GIN (department gin_trgm_ops)",
            # role_permissions
            "CREATE INDEX IF NOT EXISTS idx_role_permissions_perm_id ON role_permissions(permission_id)",
        ]

        # === Schema column migrations for existing tables ===
        migrations = [
            "ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS save_alarm BOOLEAN DEFAULT TRUE;",
        ]
        for sql in migrations:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass

        for sql in gin_indexes:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass

        # === Seed ข้อมูล default จาก CSV (ข้ามถ้าตารางมีข้อมูลอยู่แล้ว) ===
        try:
            from app.db.seed import seed_default_data
            await seed_default_data(conn)
        except Exception:
            logger.exception("Failed to seed default data")
            pass

    # === TimescaleDB: Convert sensor_readings to hypertable ===
    async with engine.begin() as conn:
        try:
            await conn.execute(text(
                "SELECT create_hypertable('sensor_readings', 'time', "
                "if_not_exists => TRUE, migrate_data => TRUE)"
            ))
        except Exception:
            pass

        # === Continuous Aggregate: 1-hour from 1-min data ===
        try:
            await conn.execute(text("""
                CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_readings_1hour
                WITH (timescaledb.continuous) AS
                SELECT
                    time_bucket('1 hour', time) AS bucket,
                    device_name,
                    metric_name,
                    AVG(avg_value)    AS avg_value,
                    MIN(min_value)    AS min_value,
                    MAX(max_value)    AS max_value,
                    AVG(raw_avg)      AS raw_avg,
                    MIN(raw_min)      AS raw_min,
                    MAX(raw_max)      AS raw_max,
                    SUM(sample_count) AS sample_count
                FROM sensor_readings
                GROUP BY bucket, device_name, metric_name
                WITH NO DATA
            """))
        except Exception:
            pass

        # === Retention: 1-min data 6 months ===
        try:
            await conn.execute(text(
                "SELECT add_retention_policy('sensor_readings', "
                "INTERVAL '6 months', if_not_exists => TRUE)"
            ))
        except Exception:
            pass

        # === Retention: 1-hour data 3 years ===
        try:
            await conn.execute(text(
                "SELECT add_retention_policy('sensor_readings_1hour', "
                "INTERVAL '3 years', if_not_exists => TRUE)"
            ))
        except Exception:
            pass

        # === Compression: compress after 7 days ===
        try:
            await conn.execute(text("""
                ALTER TABLE sensor_readings SET (
                    timescaledb.compress,
                    timescaledb.compress_segmentby = 'device_name, metric_name',
                    timescaledb.compress_orderby = 'time DESC'
                )
            """))
            await conn.execute(text(
                "SELECT add_compression_policy('sensor_readings', "
                "INTERVAL '7 days', if_not_exists => TRUE)"
            ))
        except Exception:
            pass

        # === Continuous Aggregate Refresh ===
        try:
            await conn.execute(text(
                "SELECT add_continuous_aggregate_policy('sensor_readings_1hour', "
                "start_offset => INTERVAL '2 hours', "
                "end_offset => INTERVAL '1 hour', "
                "schedule_interval => INTERVAL '1 hour', "
                "if_not_exists => TRUE)"
            ))
        except Exception:
            pass