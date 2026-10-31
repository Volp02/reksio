"""Wann wurde welche Zone zuletzt gereinigt (Gen3)?

Aus den Posen des ESP (siehe docs/step0-koordinaten.md): Posen in Kartenpixel umrechnen und pro Fahrt zählen, wie lange
Reksio in jeder Zone war. Ab MIN_S Sekunden gilt die Zone in dieser Fahrt als gereinigt. Posen werden nach
TELEMETRY_RETENTION_DAYS gelöscht; der letzte Zeitpunkt pro Zone bleibt deshalb zusätzlich in app_setting.
"""
from __future__ import annotations

import json
import time
from typing import Any

from sqlalchemy import select

from vacuula_server import boundary_backup
from vacuula_server.constants import MAPS_DIR
from vacuula_server.db import get_session
from vacuula_server.env import ESP_POSE_POLL_S
from vacuula_server.models.app_setting import AppSetting
from vacuula_server.models.telemetry import Pose

PX_PER_M = 25.5
DOCK_OFFSET = (10.2, -2.3)   # Pose (0,0) = Basis beim Abdocken, gemessen gegen den Dock-Marker
GAP_S = 15 * 60              # längere Pause ohne Posen = neue Fahrt
MIN_S = 60                   # so lange muss Reksio in einer Fahrt in der Zone gewesen sein
KEY = "zone_last:"


def _inside(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def _sessions(rows: list[tuple[float, float, float]]) -> list[list[tuple[float, float, float]]]:
    out: list[list[tuple[float, float, float]]] = []
    for r in rows:
        if not out or r[0] - out[-1][-1][0] > GAP_S:
            out.append([])
        out[-1].append(r)
    return out


def _stored(serial: str, map_id: str) -> dict[str, float]:
    with get_session() as session:
        row = session.get(AppSetting, f"{KEY}{serial}:{map_id}")
    try:
        return json.loads(row.value) if row else {}
    except ValueError:
        return {}


def _save(serial: str, map_id: str, last: dict[str, float]) -> None:
    key = f"{KEY}{serial}:{map_id}"
    with get_session() as session:
        row = session.get(AppSetting, key)
        if row:
            row.value = json.dumps(last)
        else:
            session.add(AppSetting(key=key, value=json.dumps(last)))
        session.commit()


def history(serial: str, map_id: str) -> dict[str, dict[str, Any]] | None:
    """{zoneId: {last: unix ts | None, count: Fahrten in der Zone (seit es Posen gibt)}}; None ohne Karte/Zonen"""
    bounds = boundary_backup.latest(serial, map_id)
    if bounds is None:
        bounds = boundary_backup.snapshot(serial, map_id)
    try:
        with open(MAPS_DIR / serial / map_id / "floormap.json") as f:
            fm = json.load(f)
        w, h, dock = fm["width"], fm["height"], fm["dock"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    if bounds is None:
        return None

    zones = {
        b["id"]: [(u * w, v * h) for u, v in b["vertices"]]
        for b in bounds if b.get("type") == "polygon" and len(b.get("vertices") or []) >= 3
    }
    boxes = {zid: (min(p[0] for p in poly), max(p[0] for p in poly), min(p[1] for p in poly), max(p[1] for p in poly))
             for zid, poly in zones.items()}

    with get_session() as session:
        rows = session.execute(
            select(Pose.ts, Pose.x, Pose.y).where(Pose.robot == serial).order_by(Pose.ts)
        ).all()

    ox, oy = dock["pixel_x"] + DOCK_OFFSET[0], dock["pixel_y"] + DOCK_OFFSET[1]
    need = max(1, round(MIN_S / max(1, ESP_POSE_POLL_S)))
    last = _stored(serial, map_id)
    count = {zid: 0 for zid in zones}
    for run in _sessions([tuple(r) for r in rows]):
        hits: dict[str, list[float]] = {}
        for ts, x, y in run:
            px, py = ox + PX_PER_M * x, oy - PX_PER_M * y
            for zid, poly in zones.items():
                x0, x1, y0, y1 = boxes[zid]
                if x0 <= px <= x1 and y0 <= py <= y1 and _inside(px, py, poly):
                    hits.setdefault(zid, []).append(ts)
        for zid, tss in hits.items():
            if len(tss) >= need:
                count[zid] += 1
                last[zid] = max(last.get(zid, 0), tss[-1])

    last = {zid: ts for zid, ts in last.items() if zid in zones}
    _save(serial, map_id, last)
    return {zid: {"last": last.get(zid), "count": count[zid]} for zid in zones}
