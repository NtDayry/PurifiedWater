from typing import Optional
from sqlalchemy import Integer, String, Boolean, Float, ForeignKey, DateTime, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


# =========================================================
# Sensor Data — TimescaleDB hypertable (1-min aggregates)
# =========================================================

class SensorReading(Base):
    """1-minute aggregated sensor readings.

    Modbus Reader buffers 60 readings (1/sec) in memory,
    calculates avg/min/max, then POSTs the aggregate.
    Raw 1-second data only goes to WebSocket, never to DB.
    """
    __tablename__ = "sensor_readings"

    time: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), primary_key=True,
    )
    device_name: Mapped[str] = mapped_column(String(50), primary_key=True)
    metric_name: Mapped[str] = mapped_column(String(50), primary_key=True)

    # Adjusted values (after calibration/scale)
    avg_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Raw values (before scale)
    raw_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    raw_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    raw_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    sample_count: Mapped[int] = mapped_column(Integer, default=60)
    config_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sensor_configs.id"), nullable=True,
    )

    __table_args__ = (
        Index("idx_sr_device_metric_time", "device_name", "metric_name", "time"),
    )


# =========================================================
# Sensor Groups — device groups with display ordering
# =========================================================

class SensorGroup(Base):
    """Groups of sensors (e.g. water_flow, ro_system).
    
    Controls display ordering and group metadata.
    """
    __tablename__ = "sensor_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    sensors: Mapped[list["Sensor"]] = relationship(
        "Sensor", back_populates="group", order_by="Sensor.sort_order"
    )


# =========================================================
# Sensors — individual metrics with display ordering
# =========================================================

class Sensor(Base):
    """Individual sensor/metric definition within a group.
    
    Controls display ordering and sensor metadata.
    """
    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sensor_groups.id"), nullable=False,
    )
    metric_name: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    group: Mapped["SensorGroup"] = relationship("SensorGroup", back_populates="sensors")
    configs: Mapped[list["SensorConfig"]] = relationship(
        "SensorConfig", back_populates="sensor"
    )

    __table_args__ = (
        Index("idx_sensors_group_id", "group_id"),
        Index("idx_sensors_metric_name", "metric_name"),
    )


# =========================================================
# Sensor Calibration Config — versioned
# =========================================================

class SensorConfig(Base):
    """Sensor calibration/scaling config with versioning.

    On edit: create new row, deactivate old (is_active=False, superseded_by=new_id).
    New data always references the latest active config_id.
    Historical data keeps its original config_id.
    """
    __tablename__ = "sensor_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Link to sensors table
    sensor_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sensors.id"), nullable=True,
    )

    # Kept for backward compatibility with sensor_readings & modbus-reader
    device_name: Mapped[str] = mapped_column(String(50), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(50), nullable=False)

    # Decoder: bcd_hex | analog_4_20ma | float32_cdab
    decode_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Raw range (for 4-20mA)
    raw_min: Mapped[int] = mapped_column(Integer, default=0)
    raw_max: Mapped[int] = mapped_column(Integer, default=20000)

    # Actual range after scaling
    range_min: Mapped[float] = mapped_column(Float, default=0.0)
    range_max: Mapped[float] = mapped_column(Float, default=100.0)

    # Display
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    decimal_places: Mapped[int] = mapped_column(Integer, default=2)

    # Alert convenience fields (also in alert_rules table)
    alert_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    alert_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    alert_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Max range for UI (e.g. water tank full capacity)
    max_range: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Version lifecycle
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    superseded_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sensor_configs.id"), nullable=True,
    )

    created_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(),
    )

    sensor: Mapped[Optional["Sensor"]] = relationship("Sensor", back_populates="configs")

    __table_args__ = (
        Index("idx_sc_device_metric", "device_name", "metric_name"),
        Index("idx_sc_active", "is_active"),
        Index("idx_sc_sensor_id", "sensor_id"),
    )
