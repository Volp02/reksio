"""Zeitplan des Servers lesen und ersetzen (siehe plans)."""
from __future__ import annotations

from vacuula_server import plans
from vacuula_server.generation import get_robot_by_serial

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from vacuula_server.handlers.router import RouterHandler


def get_plans(req: RouterHandler, serial: str) -> None:
    """GET /robot/<serial>/plans - Termine mit nächster Startzeit (next) und letztem Ergebnis (last)"""
    if get_robot_by_serial(serial) is None or '-' not in serial:
        return req.send_not_found("Gen3 robot not found")
    req.send_ok(plans.get(serial))


def put_plans(req: RouterHandler, serial: str) -> None:
    """PUT /robot/<serial>/plans - alle Termine ersetzen: [{id?, enabled, days[0=So..6], time "HH:MM", mapId, zones[{id,name}], mode, navigationMode}]"""
    data = req.read_json()
    if data is None:
        return
    if get_robot_by_serial(serial) is None or '-' not in serial:
        return req.send_not_found("Gen3 robot not found")
    valid = plans.validate(data)
    if valid is None:
        return req.send_bad_request("invalid plans")
    req.send_ok(plans.put(serial, valid))
