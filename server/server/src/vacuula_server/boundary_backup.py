"""Zonen und No-Go-Linien pro Karte sichern (Gen3).

Die Grenzen liegen nur auf dem Roboter; ein setMapBoundaries ersetzt die ganze Liste. Deshalb sichert der Server vor
jedem Schreiben den Stand vom Roboter und danach den neuen. Gleiche Stände hintereinander werden nur einmal gespeichert,
pro Karte bleiben die letzten KEEP.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from sqlalchemy import delete, select

from vacuula_server.db import db_commit2, get_session
from vacuula_server.gen3.cloud import cloud_command
from vacuula_server.models.boundary_backup import BoundaryBackup

logger = logging.getLogger(__name__)

KEEP = 100


def _key(bounds: list) -> str:
    # relevancy berechnet die App beim Speichern neu, der Roboter liefert ihn nicht immer zurück
    return json.dumps([{k: v for k, v in b.items() if k != "relevancy"} for b in bounds if isinstance(b, dict)],
                      sort_keys=True)


def _same(a: list, b: list) -> bool:
    return _key(a) == _key(b)


def latest(serial: str, map_id: str) -> list[dict[str, Any]] | None:
    with get_session() as session:
        row = session.execute(
            select(BoundaryBackup.boundaries)
            .where(BoundaryBackup.robot == serial, BoundaryBackup.map_id == map_id)
            .order_by(BoundaryBackup.ts.desc()).limit(1)
        ).scalar_one_or_none()
    return row


def store(serial: str, map_id: str, boundaries: list[dict[str, Any]]) -> None:
    """Stand sichern, außer er gleicht dem letzten"""
    prev = latest(serial, map_id)
    if prev is not None and _same(prev, boundaries):
        return
    with get_session() as session:
        if not db_commit2(session, BoundaryBackup(robot=serial, map_id=map_id, ts=time.time(), boundaries=boundaries)):
            return
        old = session.execute(
            select(BoundaryBackup.id)
            .where(BoundaryBackup.robot == serial, BoundaryBackup.map_id == map_id)
            .order_by(BoundaryBackup.ts.desc()).offset(KEEP)
        ).scalars().all()
        if old:
            session.execute(delete(BoundaryBackup).where(BoundaryBackup.id.in_(old)))
            session.commit()
    logger.info("boundaries of %s map %s backed up (%d)", serial, map_id, len(boundaries))


def snapshot(serial: str, map_id: str) -> list[dict[str, Any]] | None:
    """Aktuellen Stand vom Roboter lesen und sichern; None, wenn er nicht antwortet"""
    res = cloud_command(serial, {"cmd": "getMapBoundaries", "params": {"mapId": map_id}})
    bounds = ((res or {}).get("data") or {}).get("boundaries") if (res or {}).get("result") == "ok" else None
    if not isinstance(bounds, list):
        return None
    store(serial, map_id, bounds)
    return bounds


def listing(serial: str, map_id: str) -> list[dict[str, Any]]:
    with get_session() as session:
        rows = session.execute(
            select(BoundaryBackup)
            .where(BoundaryBackup.robot == serial, BoundaryBackup.map_id == map_id)
            .order_by(BoundaryBackup.ts.desc())
        ).scalars().all()
    return [{"id": r.id, "ts": r.ts, "boundaries": r.boundaries} for r in rows]
