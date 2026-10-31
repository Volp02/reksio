"""Befehle an einen Gen3-Roboter aus dem Server heraus (ohne HTTP-Anfrage der App)."""
from __future__ import annotations

import json
import logging

from vacuula_server.conn import Gen2Gen3Conn
from vacuula_server.gen3.commands import build_command, send_chunk
from vacuula_server.state import PendingRequest, pending_requests, robot_connections

logger = logging.getLogger(__name__)


def cloud_command(serial: str | None, cmd: dict, timeout: float = 10) -> dict | None:
    """Befehl senden und die Antwort des Roboters zurückgeben; None, wenn er nicht verbunden ist oder nicht antwortet."""
    conn = robot_connections.get(serial or "")
    if not conn or not isinstance(conn.conn, Gen2Gen3Conn):
        return None
    req_id, msg = build_command(serial, cmd)
    slot = PendingRequest()
    pending_requests[str(req_id)] = slot
    try:
        send_chunk(conn.conn.wfile, msg)
        if not slot.event.wait(timeout):
            return None
        return json.loads(slot.content)
    except Exception as e:
        logger.warning("%s failed: %s", cmd.get("cmd"), e)
        return None
    finally:
        pending_requests.pop(str(req_id), None)
