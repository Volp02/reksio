"""Posen aus dem Reinigungsverlauf des ESP (OpenNeato) nachtragen.

Der ESP zeichnet jede Reinigung selbst auf (/api/history, NDJSON: session, Posen x/y/t/ts, recharge, summary).
Fehlen für eine abgeschlossene Sitzung Posen in der Datenbank (Server war aus, Fahrt vor dem Pose-Poller), werden
sie einmalig übernommen. `ts` der Posen ist die Uhr des Roboters, nicht Unix-Zeit: umgerechnet relativ zum Beginn der
Sitzung und auf deren Ende begrenzt. Für Spur und Zonen-Verlauf reicht das, die Reihenfolge stimmt.
"""
from __future__ import annotations

import json
import logging
import urllib.request

from sqlalchemy import func, select

from vacuula_server.db import get_session
from vacuula_server.models.app_setting import AppSetting
from vacuula_server.models.telemetry import Pose

logger = logging.getLogger(__name__)

KEY = "esp_history_imported:"
TIMEOUT_S = 30
MIN_SNAPSHOTS = 10
MAX_DONE = 500


def _done(serial: str) -> set[str]:
    with get_session() as session:
        row = session.get(AppSetting, KEY + serial)
    try:
        return set(json.loads(row.value)) if row else set()
    except ValueError:
        return set()


def _mark(serial: str, done: set[str]) -> None:
    value = json.dumps(sorted(done)[-MAX_DONE:])
    with get_session() as session:
        row = session.get(AppSetting, KEY + serial)
        if row:
            row.value = value
        else:
            session.add(AppSetting(key=KEY + serial, value=value))
        session.commit()


def parse(raw: str, start: float, end: float) -> list[tuple[float, float, float, float]]:
    """Posen (Unix-Zeit, x, y, theta) aus einer Sitzungsdatei; kaputte Zeilen (Abbruch beim Schreiben) überspringen"""
    out: list[tuple[float, float, float, float]] = []
    t0 = None
    for line in raw.splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if not isinstance(e, dict) or "type" in e or not all(isinstance(e.get(k), (int, float)) for k in ("x", "y", "t", "ts")):
            continue
        if t0 is None:
            t0 = e["ts"]
        ts = min(end, start + max(0.0, e["ts"] - t0))
        out.append((ts, e["x"], e["y"], e["t"]))
    return out


def _has_poses(serial: str, start: float, end: float) -> bool:
    with get_session() as session:
        n = session.execute(select(func.count(Pose.id)).where(Pose.robot == serial, Pose.ts >= start, Pose.ts <= end)).scalar()
    return bool(n)


def run(base: str, serial: str) -> int:
    """Alle noch nicht übernommenen, abgeschlossenen Sitzungen prüfen; Rückgabe: Anzahl übernommener Sitzungen"""
    with urllib.request.urlopen(f"{base}/api/history", timeout=TIMEOUT_S) as resp:
        sessions = json.load(resp)
    done = _done(serial)
    imported = 0
    for s in sessions:
        name, sess, summary = s.get("name"), s.get("session") or {}, s.get("summary") or {}
        if not name or name in done or s.get("recording") or not summary:
            continue
        start, end = sess.get("time"), summary.get("time")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or end < start:
            done.add(name)
            continue
        # zu kurz oder schon live aufgezeichnet
        if (summary.get("snapshots") or 0) < MIN_SNAPSHOTS or _has_poses(serial, start, end):
            done.add(name)
            continue
        with urllib.request.urlopen(f"{base}/api/history/{name}", timeout=TIMEOUT_S) as resp:
            poses = parse(resp.read().decode("utf-8", "replace"), start, end)
        with get_session() as session:
            session.add_all(Pose(robot=serial, ts=ts, x=x, y=y, theta=th) for ts, x, y, th in poses)
            session.commit()
        done.add(name)
        imported += 1
        logger.info("ESP history %s: %d poses imported for %s", name, len(poses), serial)
    _mark(serial, done)
    return imported
