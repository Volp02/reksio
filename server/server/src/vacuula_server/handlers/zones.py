"""Zonen nacheinander reinigen: Warteschlange starten, abfragen, abbrechen (siehe zone_queue)."""
from __future__ import annotations

import json

from vacuula_server import boundary_backup, zone_history, zone_queue
from vacuula_server.db import get_session
from vacuula_server.models.persistent_map import PersistentMap
from vacuula_server.generation import get_robot_by_serial
from vacuula_server.state import robot_connections

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from vacuula_server.handlers.router import RouterHandler


def get_zones(req: RouterHandler, serial: str) -> None:
    """GET /robot/<serial>/zones - laufende Warteschlange oder null"""
    req.send_ok(zone_queue.get(serial))


def post_zones(req: RouterHandler, serial: str) -> None:
    """POST /robot/<serial>/zones - {mapId, zones: [{id, name}], mode, navigationMode}; startet die erste Zone sofort"""
    if not (data := req.read_json()):
        return
    if get_robot_by_serial(serial) is None or '-' not in serial:
        return req.send_not_found("Gen3 robot not found")
    if serial not in robot_connections:
        return req.send_bad_request("Robot not connected")
    map_id = data.get("mapId")
    zones = data.get("zones")
    mode = data.get("mode", 1)
    nav = data.get("navigationMode", 1)
    if not isinstance(map_id, str) or not map_id or not isinstance(zones, list) or not zones \
            or not all(isinstance(z, dict) and isinstance(z.get("id"), str) and z["id"] for z in zones) \
            or mode not in (1, 2) or nav not in (1, 2, 3):
        return req.send_bad_request("mapId, zones [{id, name}], mode 1|2 and navigationMode 1|2|3 are required")
    zones = [{"id": z["id"], "name": str(z.get("name") or "")} for z in zones]

    q, res = zone_queue.start(serial, map_id, zones, mode, nav)
    if q is None:
        req.send_response_data(json.dumps(res or {"error": "Robot did not answer in time"}).encode(), True, 409 if res else 504)
        return
    req.send_ok(q)


def delete_zones(req: RouterHandler, serial: str) -> None:
    """DELETE /robot/<serial>/zones - restliche Zonen verwerfen (laufende Zone läuft weiter)"""
    zone_queue.cancel(serial)
    req.send_ok()


def _gen3_map(serial: str, map_id: str) -> bool:
    with get_session() as session:
        m = session.get(PersistentMap, map_id)
    return m is not None and m.robot == serial


def get_boundary_backups(req: RouterHandler, serial: str, map_id: str) -> None:
    """GET /robot/<serial>/maps/<map_id>/backups - gesicherte Stände der Zonen/Linien, neueste zuerst"""
    if not _gen3_map(serial, map_id):
        return req.send_not_found("Map not found")
    if serial in robot_connections:
        boundary_backup.snapshot(serial, map_id)
    req.send_ok(boundary_backup.listing(serial, map_id))


def get_zone_history(req: RouterHandler, serial: str, map_id: str) -> None:
    """GET /robot/<serial>/maps/<map_id>/zone-history - {zoneId: {last, count}} aus den Posen"""
    if not _gen3_map(serial, map_id):
        return req.send_not_found("Map not found")
    req.send_ok(zone_history.history(serial, map_id) or {})
