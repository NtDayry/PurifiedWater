from fastapi import APIRouter
from app.api.routes import (
    auth,
    users,
    roles,
    support_team,
    audit_log,
    health,
    sensor_configs,
    sensor_registry,
    sensor_report,
    alerts,
    ingest,
    notification_settings,
)
# ws_sensor_router is registered at root level in main.py (not under /api prefix)

# =========================================================
# Main API Router
# Grouping all PurifieldWater endpoints
# =========================================================

api_router = APIRouter()

# Health Check
api_router.include_router(health.router)

# Authentication & RBAC
api_router.include_router(auth.router)

# User Management
api_router.include_router(users.router)

# Roles & Permissions
api_router.include_router(roles.router)

# Support Team & System Meta
api_router.include_router(support_team.router)

# Audit Log
api_router.include_router(audit_log.router)

# Sensor Registry (Groups & Sensors with ordering)
api_router.include_router(sensor_registry.router)

# Sensor Calibration Configs (Versioned)
api_router.include_router(sensor_configs.router)

# Sensor Report (TimescaleDB historical aggregate)
api_router.include_router(sensor_report.router)

# Alerts (Rules & Events)
api_router.include_router(alerts.router)

# Notification Settings (Global LINE/Email config)
api_router.include_router(notification_settings.router)

# Sensor Data Ingest (1-min aggregated data from Modbus Reader)
api_router.include_router(ingest.router)