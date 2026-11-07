"""Befehle an einen Gen4-Roboter aus dem Server heraus (ohne HTTP-Anfrage der App)."""
from __future__ import annotations

import logging

from vacuula_server.conn import Gen4Conn
from vacuula_server.gen4.handlers import robot_send_request
from vacuula_server.state import PendingRequest, pending_requests, robot_connections

logger = logging.getLogger(__name__)


def is_gen4(serial: str | None) -> bool:
    conn = robot_connections.get(serial or "")
    return bool(conn) and isinstance(conn.conn, Gen4Conn)


def gen4_command(serial: str | None, body: dict, timeout: float = 10) -> dict | None:
    """Ability senden ({"ability": ..., ...}) und die Antwort {"code", "body"} zurückgeben; None ohne Verbindung/Antwort."""
    conn = robot_connections.get(serial or "")
    if not conn or not isinstance(conn.conn, Gen4Conn):
        return None
    slot = PendingRequest(serial, body.get("ability"))
    req_id, err = robot_send_request(conn, body, slot)
    if req_id is None:
        logger.warning("%s failed: %s", body.get("ability"), err)
        return None
    try:
        if not slot.event.wait(timeout):
            return None
        return slot.content if isinstance(slot.content, dict) else None
    finally:
        pending_requests.pop(req_id, None)
