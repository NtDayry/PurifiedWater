import asyncio
from dataclasses import asdict, dataclass
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

import websockets
from pymodbus.client import AsyncModbusSerialClient

from alert_engine import AlertAction, AlertEngine
from api_client import ApiClient
from buffer import ReadingBuffer
from config import (
    DEVICES,
    DecodeType,
    DeviceConfig,
    ReadingStatus,
    RegisterConfig,
    settings,
)
from decoders import decode_float32_cdab, decode_value

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("modbus_reader")


@dataclass
class SensorReading:
    device_name: str
    metric_name: str
    raw_value: Any
    adjusted_value: float
    status: ReadingStatus = "OK"
    config_id: int | None = None
    decimal_places: int | None = 2

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def find_sensor_config(
    sensor_configs: list[dict], device_name: str, metric_name: str
) -> dict | None:
    """Return the matching config for a device metric, if present."""
    return next(
        (
            config
            for config in sensor_configs
            if config.get("device_name") == device_name
            and config.get("metric_name") == metric_name
        ),
        None,
    )


async def read_registers_safe(
    client: AsyncModbusSerialClient,
    start: int,
    count: int,
    slave_id: int,
    fc: int = 4,
):
    """Try common Modbus parameter names across pymodbus versions."""
    read_func = (
        client.read_holding_registers if fc == 3 else client.read_input_registers
    )

    for kwargs in [
        {"slave": slave_id},
        {"device_id": slave_id},
        {"unit": slave_id},
    ]:
        try:
            return await read_func(address=start, count=count, **kwargs)
        except TypeError:
            continue

    # Some pymodbus versions expect positional arguments instead of keyword args.
    try:
        return await read_func(start, count, slave_id)
    except TypeError:
        return await read_func(start, count)


def compute_converted_raw_value(registers: list[int], decode_type: DecodeType) -> Any:
    """Convert raw Modbus register list into a decoded raw scalar value."""
    if not registers:
        return 0
    if decode_type == "analog_4_20ma":
        return registers[0]
    if decode_type == "bcd_hex":
        if len(registers) == 2:
            try:
                int_part = f"{registers[0]:04X}"
                dec_part = f"{registers[1]:04X}"
                return float(f"{int_part}.{dec_part}")
            except ValueError:
                return registers[0]
        return registers[0]
    if decode_type == "float32_cdab":
        if len(registers) == 2:
            res = decode_float32_cdab(registers)
            return res.value if res.status != "ERROR" else registers[0]
        return registers[0]
    return registers[0] if len(registers) == 1 else registers


def build_reading_result(
    device_name: str,
    metric_name: str,
    registers: list[int],
    decode_type: DecodeType,
    config: dict | None,
) -> SensorReading:
    """Normalize a Modbus register response into a single reading dataclass."""
    active_decode_type = (
        config.get("decode_type")
        if (config and config.get("decode_type"))
        else decode_type
    )
    decode_res = decode_value(registers, active_decode_type, config)
    raw_value = compute_converted_raw_value(registers, active_decode_type)
    decimal_places = (
        config.get("decimal_places")
        if (config and config.get("decimal_places") is not None)
        else 2
    )

    adjusted_val = decode_res.value
    if decimal_places is not None and isinstance(adjusted_val, (int, float)):
        adjusted_val = round(float(adjusted_val), decimal_places)

    return SensorReading(
        device_name=device_name,
        metric_name=metric_name,
        raw_value=raw_value,
        adjusted_value=adjusted_val,
        status=decode_res.status,
        config_id=config.get("id") if config else None,
        decimal_places=decimal_places,
    )


async def read_device(
    client: AsyncModbusSerialClient,
    device_def: DeviceConfig,
    sensor_configs: list[dict],
) -> list[SensorReading]:
    """Read all metrics for one device using a bulk read when possible."""
    slave_id = device_def.slave_id
    device_name = device_def.device_name
    decode_type = device_def.decode_type
    fc = device_def.function_code
    registers_def = device_def.registers

    if not registers_def:
        return []

    results: list[SensorReading] = []

    # Read all relevant registers in one request to reduce Modbus overhead.
    min_start = min(r.start for r in registers_def)
    max_end = max(r.start + r.count for r in registers_def)
    total_count = max_end - min_start

    try:
        response = await read_registers_safe(
            client, min_start, total_count, slave_id, fc
        )

        if (
            response is not None
            and not response.isError()
            and hasattr(response, "registers")
        ):
            bulk_registers = response.registers

            if len(bulk_registers) >= total_count:
                for reg_group in registers_def:
                    start = reg_group.start
                    count = reg_group.count
                    metric = reg_group.metric

                    offset = start - min_start
                    register_slice = bulk_registers[offset : offset + count]
                    config = find_sensor_config(
                        sensor_configs, device_name, metric
                    )

                    results.append(
                        build_reading_result(
                            device_name=device_name,
                            metric_name=metric,
                            registers=register_slice,
                            decode_type=decode_type,
                            config=config,
                        )
                    )

                await asyncio.sleep(0.05)
                return results

    except Exception as exc:
        logger.warning(
            "Bulk read failed for %s, falling back to per-metric read: %s",
            device_name,
            exc,
        )

    # If the bulk read fails or is incomplete, retry each metric individually.
    for reg_group in registers_def:
        start = reg_group.start
        count = reg_group.count
        metric = reg_group.metric

        try:
            response = await read_registers_safe(client, start, count, slave_id, fc)
            if response is None or response.isError():
                logger.warning(
                    "Error reading %s/%s at %s", device_name, metric, start
                )
                continue

            config = find_sensor_config(sensor_configs, device_name, metric)
            results.append(
                build_reading_result(
                    device_name=device_name,
                    metric_name=metric,
                    registers=response.registers,
                    decode_type=decode_type,
                    config=config,
                )
            )
        except Exception as exc:
            logger.error("Exception reading %s/%s: %s", device_name, metric, exc)

        await asyncio.sleep(0.05)

    return results


async def connect_ws(ws_url: str):
    """Open a persistent WebSocket connection if available."""
    try:
        return await websockets.connect(ws_url)
    except Exception as exc:
        logger.error("WebSocket connection failed: %s", exc)
        return None


def build_ws_payload(readings: list[SensorReading], timestamp: datetime) -> dict:
    """Convert sensor readings into the payload expected by the front-end."""
    payload = {
        "type": "data",
        "timestamp": timestamp.isoformat(),
        "data": {
            "adjusted": {},
            "raw": {},
            **{reading.device_name: {} for reading in readings},
        },
        "raw_data": {reading.device_name: {} for reading in readings},
        "raw": {},
        "statuses": {},
    }

    for reading in readings:
        # Nested by device
        payload["data"][reading.device_name][reading.metric_name] = (
            reading.adjusted_value
        )
        payload["raw_data"][reading.device_name][reading.metric_name] = (
            reading.raw_value
        )

        # Flat / categorized
        payload["data"]["adjusted"][reading.metric_name] = reading.adjusted_value
        payload["data"]["adjusted"][f"{reading.device_name}_{reading.metric_name}"] = reading.adjusted_value

        payload["data"]["raw"][reading.metric_name] = reading.raw_value
        payload["data"]["raw"][f"{reading.device_name}_{reading.metric_name}"] = reading.raw_value

        payload["raw"][reading.metric_name] = reading.raw_value
        payload["raw"][f"{reading.device_name}_{reading.metric_name}"] = reading.raw_value

        payload["statuses"][reading.metric_name] = reading.status

    return payload


async def send_ws_payload(ws, payload: dict):
    """Ensure the WebSocket is connected before sending the payload."""
    try:
        is_closed = (
            getattr(ws, "closed", False)
            or getattr(ws, "state", None) != websockets.State.OPEN
        )
        if ws is None or is_closed:
            ws = await connect_ws(settings.WS_URL)

        if ws:
            await ws.send(json.dumps(payload))

        return ws
    except Exception as exc:
        logger.error("WebSocket send error: %s", exc)
        return None


async def process_alerts(
    api_client: ApiClient,
    alert_engine: AlertEngine,
    readings: list[SensorReading],
    timestamp: datetime,
):
    """Check each reading against alert rules and send created/closed alert events."""
    for reading in readings:
        actions = alert_engine.check(
            reading.device_name,
            reading.metric_name,
            reading.adjusted_value,
            timestamp,
        )

        for action in actions:
            try:
                if action.action == "create_event":
                    if action.save_alarm:
                        result = await api_client.create_alert_event(action)
                        alert_engine.set_event_id(
                            reading.device_name,
                            reading.metric_name,
                            result.get("id"),
                        )
                    else:
                        logger.info(
                            "Skipping alert event save (save_alarm=False) for %s/%s",
                            reading.device_name,
                            reading.metric_name,
                        )
                elif action.action == "end_event":
                    if action.event_id is not None and action.ended_at is not None:
                        await api_client.end_alert_event(
                            action.event_id, action.ended_at
                        )
            except Exception as exc:
                logger.error("Alert action error: %s", exc)


async def refresh_runtime_config(api_client: ApiClient, alert_engine: AlertEngine):
    """Refresh sensor definitions and alert rules from the API."""
    sensor_configs = await api_client.get_sensor_configs()
    alert_rules = await api_client.get_alert_rules()
    alert_engine.update_rules(alert_rules)
    return sensor_configs


async def main():
    logger.info("Starting Modbus Reader Service")
    logger.info("Serial: %s @ %s", settings.SERIAL_PORT, settings.BAUD_RATE)
    logger.info("API: %s", settings.API_BASE_URL)

    api = ApiClient(settings.API_BASE_URL, settings.DEVICE_TOKEN, settings.REDIS_URL)
    buffer = ReadingBuffer(settings.AGGREGATE_INTERVAL)
    alert_engine = AlertEngine()

    try:
        sensor_configs = await refresh_runtime_config(api, alert_engine)
    except Exception as exc:
        logger.error("Failed to fetch initial configs/rules: %s", exc)
        sensor_configs = []

    modbus = AsyncModbusSerialClient(
        port=settings.SERIAL_PORT,
        baudrate=settings.BAUD_RATE,
        parity=settings.PARITY,
        stopbits=settings.STOP_BITS,
        bytesize=settings.BYTE_SIZE,
        timeout=1,
    )

    connected = await modbus.connect()
    if not connected:
        logger.error("Failed to connect to Modbus device")
        await api.close()
        return

    logger.info("Modbus connected")

    ws = None
    last_config_refresh = time.time()

    try:
        while True:
            loop_start = time.time()
            now = datetime.now(timezone.utc)
            all_readings: list[SensorReading] = []

            # Read every configured device each polling cycle.
            for device_def in DEVICES:
                try:
                    device_readings = await read_device(
                        modbus, device_def, sensor_configs
                    )
                    all_readings.extend(device_readings)
                except Exception as exc:
                    logger.error("Error reading %s: %s", device_def.device_name, exc)

            if all_readings:
                ws_payload = build_ws_payload(all_readings, now)
                ws = await send_ws_payload(ws, ws_payload)

            # Store readings for aggregation and alert evaluation.
            for reading in all_readings:
                buffer.add(
                    reading.device_name,
                    reading.metric_name,
                    reading.raw_value,
                    reading.adjusted_value,
                    reading.config_id,
                    reading.status,
                    reading.decimal_places,
                )

            await process_alerts(api, alert_engine, all_readings, now)

            if buffer.should_flush():
                aggregated = buffer.flush()
                if aggregated:
                    try:
                        await api.post_sensor_data(aggregated)
                        logger.info("Flushed %s aggregated readings", len(aggregated))
                    except Exception as exc:
                        logger.error("Failed to flush: %s", exc)

            if time.time() - last_config_refresh > settings.CONFIG_REFRESH_INTERVAL:
                try:
                    sensor_configs = await refresh_runtime_config(api, alert_engine)
                    last_config_refresh = time.time()
                    logger.info("Configs refreshed")
                except Exception as exc:
                    logger.error("Config refresh error: %s", exc)

            elapsed = time.time() - loop_start
            sleep_time = max(0.0, settings.POLL_INTERVAL - elapsed)
            await asyncio.sleep(sleep_time)

    except asyncio.CancelledError:
        logger.info("Service stopping...")
    finally:
        if modbus.connected:
            modbus.close()
        if ws and not ws.closed:
            await ws.close()
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
