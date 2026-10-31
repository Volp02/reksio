from __future__ import annotations

import time
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import select

from vacuula_server.db import get_session
from vacuula_server.models.telemetry import Pose, Telemetry

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from vacuula_server.handlers.router import RouterHandler

DEFAULT_WINDOW_S = 24 * 3600
MAX_ROWS = 20000


def _range(req: RouterHandler) -> tuple[float, float] | None:
    query = parse_qs(urlsplit(req.path).query)
    try:
        until = float(query.get("until", [time.time()])[0])
        since = float(query.get("since", [until - DEFAULT_WINDOW_S])[0])
    except ValueError:
        req.send_bad_request("since/until must be unix timestamps")
        return None
    return since, until


def get_telemetry(req: RouterHandler, serial: str) -> None:
    """GET /robot/<serial>/telemetry?since=&until= - ESP samples, default last 24 h"""
    if not (r := _range(req)): return
    with get_session() as session:
        rows = session.execute(
            select(Telemetry.ts, Telemetry.data)
            .where(Telemetry.robot == serial, Telemetry.ts >= r[0], Telemetry.ts <= r[1])
            .order_by(Telemetry.ts)
            .limit(MAX_ROWS)
        ).all()
    req.send_ok([{"ts": ts, **data} for ts, data in rows])


SLOW_KEYS = ("maintenance", "robotWifi", "warranty")


def get_telemetry_latest(req: RouterHandler, serial: str) -> None:
    """GET /robot/<serial>/telemetry/latest - newest ESP sample; seltene Felder aus den letzten Proben ergänzt"""
    with get_session() as session:
        rows = session.execute(
            select(Telemetry.ts, Telemetry.data)
            .where(Telemetry.robot == serial)
            .order_by(Telemetry.ts.desc())
            .limit(60)  # 10 s Takt -> 10 min, länger als der 5-min-Takt der seltenen Felder
        ).all()
    if not rows:
        req.send_not_found("No telemetry")
        return
    latest = {"ts": rows[0].ts, **rows[0].data}
    for key in SLOW_KEYS:
        if latest.get(key) is None:
            latest[key] = next((r.data[key] for r in rows if r.data.get(key) is not None), None)
    req.send_ok(latest)


def get_poses(req: RouterHandler, serial: str) -> None:
    """GET /robot/<serial>/poses?since=&until= - [ts, x, y, theta] while cleaning, default last 24 h"""
    if not (r := _range(req)): return
    with get_session() as session:
        rows = session.execute(
            select(Pose.ts, Pose.x, Pose.y, Pose.theta)
            .where(Pose.robot == serial, Pose.ts >= r[0], Pose.ts <= r[1])
            .order_by(Pose.ts)
            .limit(MAX_ROWS)
        ).all()
    req.send_ok([list(row) for row in rows])
