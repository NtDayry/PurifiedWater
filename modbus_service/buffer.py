import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from config import ReadingStatus


@dataclass
class RawReading:
    raw_value: Any
    adjusted_value: float
    status: ReadingStatus
    config_id: int | None
    decimal_places: int | None = 2


@dataclass
class AggregatedReading:
    time: str
    device_name: str
    metric_name: str
    avg_value: float
    min_value: float
    max_value: float
    raw_avg: float
    raw_min: Any
    raw_max: Any
    sample_count: int
    config_id: int | None
    status: ReadingStatus = "OK"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ReadingBuffer:
    def __init__(self, aggregate_interval: int = 60):
        self._buffer: dict[tuple[str, str], list[RawReading]] = {}
        self._aggregate_interval = aggregate_interval
        self._last_flush: float = time.time()

    def add(
        self,
        device_name: str,
        metric_name: str,
        raw_value: Any,
        adjusted_value: float,
        config_id: int | None,
        status: ReadingStatus = "OK",
        decimal_places: int | None = 2,
    ):
        key = (device_name, metric_name)
        if key not in self._buffer:
            self._buffer[key] = []
        self._buffer[key].append(
            RawReading(
                raw_value=raw_value,
                adjusted_value=adjusted_value,
                status=status,
                config_id=config_id,
                decimal_places=decimal_places,
            )
        )

    def should_flush(self) -> bool:
        return (time.time() - self._last_flush) >= self._aggregate_interval

    def flush(self) -> list[AggregatedReading]:
        bucket_timestamp = datetime.fromtimestamp(
            self._last_flush, tz=timezone.utc
        ).isoformat()
        results: list[AggregatedReading] = []

        for (device_name, metric_name), readings in self._buffer.items():
            if not readings:
                continue

            adjusted_values = [r.adjusted_value for r in readings]
            raw_values = [r.raw_value for r in readings]
            last_status = readings[-1].status
            decimal_places = (
                readings[-1].decimal_places
                if readings[-1].decimal_places is not None
                else 2
            )

            avg_val = sum(adjusted_values) / len(adjusted_values)
            min_val = min(adjusted_values)
            max_val = max(adjusted_values)

            try:
                raw_min = min(raw_values) if isinstance(raw_values[0], (int, float)) else 0
                raw_max = max(raw_values) if isinstance(raw_values[0], (int, float)) else 0
                raw_avg = (
                    sum(raw_values) / len(raw_values)
                    if isinstance(raw_values[0], (int, float))
                    else 0.0
                )
            except TypeError:
                raw_min = 0
                raw_max = 0
                raw_avg = 0.0

            if decimal_places is not None:
                avg_val = round(avg_val, decimal_places)
                min_val = round(min_val, decimal_places)
                max_val = round(max_val, decimal_places)
                if isinstance(raw_avg, float):
                    raw_avg = round(raw_avg, decimal_places)

            results.append(
                AggregatedReading(
                    time=bucket_timestamp,
                    device_name=device_name,
                    metric_name=metric_name,
                    avg_value=avg_val,
                    min_value=min_val,
                    max_value=max_val,
                    raw_avg=raw_avg,
                    raw_min=raw_min,
                    raw_max=raw_max,
                    sample_count=len(readings),
                    config_id=readings[-1].config_id,
                    status=last_status,
                )
            )

        self._buffer.clear()
        self._last_flush = time.time()
        return results
