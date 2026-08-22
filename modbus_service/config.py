import os
from dataclasses import dataclass
from typing import Literal
from pydantic_settings import BaseSettings

DecodeType = Literal["bcd_hex", "analog_4_20ma", "float32_cdab"]
FunctionCode = Literal[1, 2, 3, 4]
ParityType = Literal["N", "E", "O", "M", "S"]
ReadingStatus = Literal["OK", "UNDER_RANGE", "OVER_RANGE", "NO_SIGNAL", "ERROR"]


@dataclass(frozen=True)
class RegisterConfig:
    start: int
    count: int
    metric: str


@dataclass(frozen=True)
class DeviceConfig:
    slave_id: int
    device_name: str
    decode_type: DecodeType
    registers: list[RegisterConfig]
    function_code: FunctionCode = 4


IS_WINDOWS = os.name == "nt"


class Settings(BaseSettings):
    API_BASE_URL: str = "http://localhost:8000/api" if IS_WINDOWS else "http://app:8000/api"
    DEVICE_TOKEN: str = ""
    SERIAL_PORT: str = "COM3" if IS_WINDOWS else "/dev/ttyUSB0"
    BAUD_RATE: int = 9600
    PARITY: ParityType = "N"
    STOP_BITS: int = 1
    BYTE_SIZE: int = 8
    POLL_INTERVAL: float = 1.0
    AGGREGATE_INTERVAL: int = 60
    WS_URL: str = "ws://localhost:8000/ws/sensor-ingest" if IS_WINDOWS else "ws://app:8000/ws/sensor-ingest"
    REDIS_URL: str = "redis://localhost:6379/0" if IS_WINDOWS else "redis://redis:6379/0"
    CONFIG_REFRESH_INTERVAL: int = 3

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

DEVICES: list[DeviceConfig] = [
    DeviceConfig(
        slave_id=1,
        device_name="water_flow",
        function_code=3,
        decode_type="bcd_hex",
        registers=[
            RegisterConfig(start=0, count=2, metric="water_meter"),
            RegisterConfig(start=2, count=2, metric="flow_rate"),
        ],
    ),
    DeviceConfig(
        slave_id=2,
        device_name="ro_system",
        function_code=4,
        decode_type="analog_4_20ma",
        registers=[
            RegisterConfig(start=0, count=1, metric="ro1_conduct"),
            RegisterConfig(start=1, count=1, metric="ro1_temp"),
            RegisterConfig(start=2, count=1, metric="ro2_conduct"),
            RegisterConfig(start=3, count=1, metric="ro2_temp"),
            RegisterConfig(start=4, count=1, metric="edi_conduct"),
            RegisterConfig(start=5, count=1, metric="edi_temp"),
        ],
    ),
    DeviceConfig(
        slave_id=3,
        device_name="distribution_loop",
        function_code=4,
        decode_type="analog_4_20ma",
        registers=[
            RegisterConfig(start=0, count=1, metric="toc"),
            RegisterConfig(start=1, count=1, metric="toc_temp"),
            RegisterConfig(start=2, count=1, metric="dis_loop_conduct"),
            RegisterConfig(start=3, count=1, metric="dis_loop_temp"),
            RegisterConfig(start=4, count=1, metric="water_level"),
            RegisterConfig(start=5, count=1, metric="uv3"),
        ],
    ),
    DeviceConfig(
        slave_id=4,
        device_name="flow_metrics",
        function_code=3,
        decode_type="float32_cdab",
        registers=[
            RegisterConfig(start=0, count=2, metric="instant_flow_rate"),
            RegisterConfig(start=4, count=2, metric="fluid_velocity"),
        ],
    ),
]
