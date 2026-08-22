import math
import struct
from dataclasses import dataclass
from typing import Literal

from config import DecodeType, ReadingStatus

AnalogStatus = Literal["OK", "UNDER_RANGE", "OVER_RANGE", "NO_SIGNAL"]


@dataclass(frozen=True)
class AnalogDecodeResult:
    value: float
    status: AnalogStatus
    current_ma: float


@dataclass(frozen=True)
class DecodeResult:
    value: float
    status: ReadingStatus = "OK"
    current_ma: float | None = None


def decode_bcd_hex(registers: list[int]) -> DecodeResult:
    if len(registers) != 2:
        return DecodeResult(value=0.0, status="ERROR")
    int_part = f"{registers[0]:04X}"
    dec_part = f"{registers[1]:04X}"
    try:
        val = float(f"{int_part}.{dec_part}")
        return DecodeResult(value=val, status="OK")
    except ValueError:
        return DecodeResult(value=0.0, status="ERROR")


def decode_analog_4_20ma(
    raw: int,
    raw_min: int = 0,
    raw_max: int = 20000,
    range_min: float = 0.0,
    range_max: float = 100.0,
    min_ma: float = 4.0,
    max_ma: float = 20.0,
) -> AnalogDecodeResult:
    """
    Decode analog 4-20mA from Modbus raw value and determine signal status.

    Raw scale:
        0      -> 0 mA
        4000   -> 4 mA
        10000  -> 10 mA
        20000  -> 20 mA

    Engineering range:
        4mA  -> range_min
        20mA -> range_max

    Statuses:
        current < 2.0 mA               -> NO_SIGNAL
        2.0 mA <= current < 3.8 mA     -> UNDER_RANGE
        3.8 mA <= current <= 20.5 mA   -> OK
        current > 20.5 mA              -> OVER_RANGE
    """
    print(
        f"Decoding raw={raw}, "
        f"raw_min={raw_min}, "
        f"raw_max={raw_max}, "
        f"range_min={range_min}, "
        f"range_max={range_max}"
    )

    if raw_max <= raw_min or max_ma <= min_ma or raw <= 0:
        return AnalogDecodeResult(value=range_min, status="NO_SIGNAL", current_ma=0.0)

    current_ma = round(float(raw * max_ma / raw_max), 4)

    if current_ma < 2.0:
        status: AnalogStatus = "NO_SIGNAL"
    elif current_ma < 3.8:
        status = "UNDER_RANGE"
    elif current_ma > 20.5:
        status = "OVER_RANGE"
    else:
        status = "OK"

    value = range_min + (
        (current_ma - min_ma) * (range_max - range_min) / (max_ma - min_ma)
    )

    return AnalogDecodeResult(
        value=round(float(value), 4),
        status=status,
        current_ma=current_ma,
    )


def decode_float32_cdab(registers: list[int]) -> DecodeResult:
    if len(registers) != 2:
        return DecodeResult(value=0.0, status="ERROR")
    try:
        packed = struct.pack(">HH", registers[1], registers[0])
        value = struct.unpack(">f", packed)[0]
        if math.isnan(value) or math.isinf(value):
            return DecodeResult(value=0.0, status="ERROR")
        return DecodeResult(value=float(value), status="OK")
    except Exception:
        return DecodeResult(value=0.0, status="ERROR")


def decode_value(
    registers: list[int], decode_type: DecodeType, config: dict | None = None
) -> DecodeResult:
    if config and config.get("decode_type"):
        decode_type = config["decode_type"]

    if decode_type == "bcd_hex":
        res = decode_bcd_hex(registers)
    elif decode_type == "analog_4_20ma":
        raw = registers[0] if registers else 0
        kwargs = {}
        if config:
            if "raw_min" in config:
                kwargs["raw_min"] = config["raw_min"]
            if "raw_max" in config:
                kwargs["raw_max"] = config["raw_max"]
            if "range_min" in config:
                kwargs["range_min"] = config["range_min"]
            if "range_max" in config:
                kwargs["range_max"] = config["range_max"]
        analog_res = decode_analog_4_20ma(raw, **kwargs)
        res = DecodeResult(
            value=analog_res.value,
            status=analog_res.status,
            current_ma=analog_res.current_ma,
        )
    elif decode_type == "float32_cdab":
        res = decode_float32_cdab(registers)
    else:
        res = DecodeResult(value=0.0, status="ERROR")

    if config and config.get("decimal_places") is not None:
        try:
            dec_places = int(config["decimal_places"])
            res_val = round(float(res.value), dec_places)
            return DecodeResult(value=res_val, status=res.status, current_ma=res.current_ma)
        except (ValueError, TypeError):
            pass

    return res
