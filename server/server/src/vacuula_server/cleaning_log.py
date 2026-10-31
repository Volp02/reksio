"""Verlauf der Reinigungen über die Run-Daten des Roboters hinaus (Gen3).

- Aufträge (cleaning_job): eine Zonenfolge oder ein Start des Zeitplans mit allen Versuchen pro Zone. Fehlgeschlagene
  Versuche hinterlassen beim Roboter keinen Run (nur life_stats), deshalb hält der Server sie hier fest.
- Störungen (incident): jeder Fehler/Hinweis des Roboters von Auftreten bis Verschwinden, aus GetErr des ESP und aus
  getRobotState. Codes einheitlich `alert_…` / `error_…` (wie die Übersetzungen der App).
- Berichte (robot_report): life_stats und push_notifications des Roboters roh, Format noch nicht entschlüsselt.
"""
from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from typing import Any

from sqlalchemy import or_, select

from vacuula_server.db import get_session
from vacuula_server.models.cleaning_log import CleaningJob, Incident, RobotReport

logger = logging.getLogger(__name__)

MAX_JOBS = 500
_lock = threading.Lock()


def _row(j: CleaningJob) -> dict[str, Any]:
    return {"id": j.id, "started": j.started, "finished": j.finished, "source": j.source, "planId": j.plan_id,
            "mapId": j.map_id, "status": j.status, "reason": j.reason, "zones": j.zones}


def job_create(serial: str, source: str, plan_id: str | None, map_id: str | None, zones: list[dict], status: str = "running") -> str:
    job_id = str(uuid.uuid4())
    with get_session() as session:
        session.add(CleaningJob(id=job_id, robot=serial, started=time.time(), source=source, plan_id=plan_id,
                                map_id=map_id, status=status, zones=zones))
        session.commit()
    return job_id


def job_update(job_id: str | None, **fields: Any) -> None:
    if not job_id:
        return
    with get_session() as session:
        j = session.get(CleaningJob, job_id)
        if not j:
            return
        for k, v in fields.items():
            setattr(j, k, v)
        session.commit()


def jobs(serial: str, limit: int = MAX_JOBS) -> list[dict[str, Any]]:
    with get_session() as session:
        rows = session.execute(select(CleaningJob).where(CleaningJob.robot == serial)
                               .order_by(CleaningJob.started.desc()).limit(limit)).scalars().all()
        return [_row(j) for j in rows]


def norm_code(code: str, kind: str) -> str:
    """UI_ALERT_X / ui_error_x / nav_x → alert_x / error_x / alert_nav_x"""
    c = code.strip().lower()
    if c.startswith("ui_"):
        c = c[3:]
    return c if c.startswith(("alert_", "error_")) else f"{kind}_{c}"


# offene Störungen pro (Roboter, Quelle): Code → Zeilen-ID
_open: dict[tuple[str, str], dict[str, int]] = {}


def incidents_seen(serial: str, source: str, codes: dict[str, str | None], now: float | None = None) -> None:
    """Aktuellen Stand melden (Code → Text). Neue Codes öffnen eine Störung, verschwundene schließen sie."""
    now = now or time.time()
    key = (serial, source)
    with _lock, get_session() as session:
        if key not in _open:
            # nach einem Neustart: noch offene Zeilen übernehmen
            rows = session.execute(select(Incident.id, Incident.code).where(
                Incident.robot == serial, Incident.source == source, Incident.end_ts.is_(None))).all()
            _open[key] = {code: rid for rid, code in rows}
        cur = _open[key]
        for code in [c for c in cur if c not in codes]:
            row = session.get(Incident, cur.pop(code))
            if row:
                row.end_ts = now
        for code, message in codes.items():
            if code not in cur:
                row = Incident(robot=serial, ts=now, source=source, code=code, message=message)
                session.add(row)
                session.flush()
                cur[code] = row.id
                logger.info("incident on %s (%s): %s", serial, source, code)
        session.commit()


def incidents(serial: str, since: float, until: float) -> list[dict[str, Any]]:
    """Störungen, die sich mit [since, until] überschneiden"""
    with get_session() as session:
        rows = session.execute(select(Incident).where(
            Incident.robot == serial, Incident.ts <= until, or_(Incident.end_ts.is_(None), Incident.end_ts >= since))
            .order_by(Incident.ts)).scalars().all()
        return [{"ts": r.ts, "end": r.end_ts, "source": r.source, "code": r.code, "message": r.message} for r in rows]


def report(serial: str, kind: str, ref: str | None, data: Any) -> None:
    with get_session() as session:
        session.add(RobotReport(robot=serial, ts=time.time(), kind=kind, ref=ref, data=data))
        session.commit()


def robot_state_seen(serial: str, content: Any) -> None:
    """Antwort auf getRobotState (dict oder JSON-Bytes): Hinweis und Fehler als Störungen der Quelle „robot“"""
    try:
        st = content if isinstance(content, dict) else json.loads(content)
    except (ValueError, TypeError):
        return
    if not isinstance(st, dict) or st.get("result") != "ok":
        return
    codes: dict[str, str | None] = {}
    if isinstance(st.get("alert"), str) and st["alert"]:
        codes[norm_code(st["alert"], "alert")] = None
    if isinstance(st.get("error"), str) and st["error"]:
        codes[norm_code(st["error"], "error")] = None
    try:
        incidents_seen(serial, "robot", codes)
    except Exception:
        logger.exception("incident bookkeeping failed")


def backfill_incidents() -> None:
    """Einmalig: Störungen aus der gespeicherten ESP-Telemetrie nachtragen (solange noch keine ESP-Störung erfasst ist)"""
    import re
    from vacuula_server.models.telemetry import Telemetry
    code_re = re.compile(r"\((UI_(?:ALERT|ERROR)_[A-Z0-9_]+)\)")
    with get_session() as session:
        if session.execute(select(Incident.id).where(Incident.source == "esp").limit(1)).first():
            return
        rows = session.execute(select(Telemetry.robot, Telemetry.ts, Telemetry.data).order_by(Telemetry.ts)).all()
        open_: dict[str, dict[str, Incident]] = {}
        added = 0
        for robot, ts, data in rows:
            err = (data or {}).get("error")
            if err is None:
                continue
            codes = {norm_code(c, "alert"): err.get("displayMessage")
                     for c in (code_re.findall(err.get("errorMessage", "")) if err.get("hasError") else []) if not c.endswith("_INVALID")}
            cur = open_.setdefault(robot, {})
            for code in [c for c in cur if c not in codes]:
                cur.pop(code).end_ts = ts
            for code, message in codes.items():
                if code not in cur:
                    cur[code] = Incident(robot=robot, ts=ts, source="esp", code=code, message=message)
                    session.add(cur[code])
                    added += 1
        session.commit()
    logger.info("incidents backfilled from telemetry: %d", added)
