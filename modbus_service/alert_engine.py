from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Literal

AlertActionType = Literal["create_event", "end_event"]
AlertSeverity = Literal["warning", "critical", "info"]


@dataclass
class AlertState:
    started_at: datetime
    triggered: bool = False
    event_id: int | None = None


@dataclass
class AlertRule:
    id: int | None
    device_name: str
    metric_name: str
    threshold_min: float | None = None
    threshold_max: float | None = None
    sustained_seconds: int = 0
    severity: AlertSeverity = "warning"


@dataclass
class AlertAction:
    action: AlertActionType
    alert_rule_id: int | None = None
    rule_id: int | None = None
    device_name: str | None = None
    metric_name: str | None = None
    started_at: str | None = None
    triggered_at: str | None = None
    trigger_value: float | None = None
    severity: AlertSeverity | None = None
    event_id: int | None = None
    ended_at: str | None = None
    save_alarm: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


class AlertEngine:
    def __init__(self):
        self._states: dict[tuple[str, str], AlertState] = {}
        self._rules: list[dict[str, Any]] = []

    def update_rules(self, rules: list[dict[str, Any]]):
        self._rules = rules

    def set_event_id(self, device_name: str, metric_name: str, event_id: int | None):
        key = (device_name, metric_name)
        if key in self._states:
            self._states[key].event_id = event_id

    def check(
        self, device_name: str, metric_name: str, value: float, now: datetime
    ) -> list[AlertAction]:
        actions: list[AlertAction] = []

        rule = next(
            (
                r
                for r in self._rules
                if r.get("device_name") == device_name
                and r.get("metric_name") == metric_name
            ),
            None,
        )
        if not rule:
            return actions

        key = (device_name, metric_name)
        threshold_min = rule.get("threshold_min")
        threshold_max = rule.get("threshold_max")
        sustained_seconds = rule.get("sustained_seconds", 0)

        out_of_range = False
        if threshold_min is not None and value < threshold_min:
            out_of_range = True
        if threshold_max is not None and value > threshold_max:
            out_of_range = True

        if out_of_range:
            if key not in self._states:
                self._states[key] = AlertState(started_at=now)

            state = self._states[key]
            if not state.triggered:
                elapsed = (now - state.started_at).total_seconds()
                if elapsed >= sustained_seconds:
                    state.triggered = True
                    actions.append(
                        AlertAction(
                            action="create_event",
                            alert_rule_id=rule.get("id"),
                            rule_id=rule.get("id"),
                            device_name=device_name,
                            metric_name=metric_name,
                            started_at=state.started_at.isoformat(),
                            triggered_at=now.isoformat(),
                            trigger_value=value,
                            severity=rule.get("severity", "warning"),
                            save_alarm=rule.get("save_alarm", True),
                        )
                    )

        else:
            if key in self._states:
                state = self._states[key]
                if state.triggered and state.event_id is not None:
                    actions.append(
                        AlertAction(
                            action="end_event",
                            event_id=state.event_id,
                            ended_at=now.isoformat(),
                        )
                    )
                del self._states[key]

        return actions
