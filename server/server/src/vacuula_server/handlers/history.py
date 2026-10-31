"""Aufträge (Zonenfolgen, Zeitplan) und Störungen für den Verlauf in der App (siehe cleaning_log)."""
from __future__ import annotations

import time
from urllib.parse import parse_qs, urlsplit

from vacuula_server import cleaning_log
from vacuula_server.generation import get_robot_by_serial

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from vacuula_server.handlers.router import RouterHandler


def get_jobs(req: RouterHandler, serial: str) -> None:
    """GET /robot/<serial>/jobs - Aufträge, neueste zuerst"""
    if get_robot_by_serial(serial) is None:
        return req.send_not_found("Robot not found")
    req.send_ok(cleaning_log.jobs(serial))


def get_incidents(req: RouterHandler, serial: str) -> None:
    """GET /robot/<serial>/incidents?since=&until= - Störungen im Zeitraum (Standard: letzte 24 h)"""
    if get_robot_by_serial(serial) is None:
        return req.send_not_found("Robot not found")
    query = parse_qs(urlsplit(req.path).query)
    try:
        until = float(query.get("until", [time.time()])[0])
        since = float(query.get("since", [until - 86400])[0])
    except ValueError:
        return req.send_bad_request("since/until must be unix timestamps")
    req.send_ok(cleaning_log.incidents(serial, since, until))
