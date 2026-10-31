"""Zeitplan des Servers (Gen3): ganze Karte oder mehrere Zonen nacheinander, zu festen Zeiten.

Der Zeitplan des D7 kann pro Termin höchstens eine Zone. Deshalb startet der Server die Termine selbst: zur Startzeit
ganze Karte (startCleaning, Kategorie Karte) oder die Zonen über die Zonenfolge (zone_queue). Ist Reksio dann nicht
bereit (reinigt, Fehler, Akku unter zone_queue.MIN_CHARGE, nicht verbunden), wird es bis WINDOW_S nach der Startzeit
jede Minute erneut versucht, danach gilt der Termin als ausgelassen. Termine liegen in app_setting; `lastDue` verhindert,
dass ein Termin nach einem Neustart des Servers doppelt startet.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from vacuula_server import zone_queue
from vacuula_server.db import get_session
from vacuula_server.gen3.cloud import cloud_command
from vacuula_server.handlers.events import broadcast
from vacuula_server.models.app_setting import AppSetting
from vacuula_server.server_tz import server_timezone

logger = logging.getLogger(__name__)

KEY = "plans:"
TICK_S = 30
WINDOW_S = 60 * 60
CATEGORY_HOUSE, CATEGORY_MAP = 2, 4
STATE_IDLE = 1
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

_lock = threading.Lock()


def _read(serial: str) -> list[dict]:
    with get_session() as session:
        row = session.get(AppSetting, KEY + serial)
    try:
        return json.loads(row.value) if row else []
    except ValueError:
        return []


def _write(serial: str, plans: list[dict]) -> None:
    with get_session() as session:
        row = session.get(AppSetting, KEY + serial)
        if row:
            row.value = json.dumps(plans)
        else:
            session.add(AppSetting(key=KEY + serial, value=json.dumps(plans)))
        session.commit()


def _serials() -> list[str]:
    with get_session() as session:
        rows = session.query(AppSetting.key).filter(AppSetting.key.startswith(KEY)).all()
    return [k[len(KEY):] for (k,) in rows]


def validate(raw) -> list[dict] | None:
    """Termine aus der App prüfen und normalisieren; None bei ungültigen Daten"""
    if not isinstance(raw, list) or len(raw) > 50:
        return None
    out = []
    for p in raw:
        if not isinstance(p, dict):
            return None
        days = p.get("days")
        zones = p.get("zones") or []
        if not isinstance(days, list) or not days or not all(isinstance(d, int) and 0 <= d <= 6 for d in days) \
                or not isinstance(p.get("time"), str) or not TIME_RE.match(p["time"]) \
                or p.get("mode", 1) not in (1, 2) or p.get("navigationMode", 1) not in (1, 2, 3) \
                or not isinstance(zones, list) \
                or not all(isinstance(z, dict) and isinstance(z.get("id"), str) and z["id"] for z in zones) \
                or (zones and not isinstance(p.get("mapId"), str)):
            return None
        out.append({
            "id": p["id"] if isinstance(p.get("id"), str) and p["id"] else str(uuid.uuid4()),
            "enabled": bool(p.get("enabled", True)),
            "days": sorted(set(days)),
            "time": p["time"],
            "mapId": p.get("mapId") if isinstance(p.get("mapId"), str) else None,
            "zones": [{"id": z["id"], "name": str(z.get("name") or "")} for z in zones],
            "mode": p.get("mode", 1),
            "navigationMode": p.get("navigationMode", 1),
        })
    return out


def _tz() -> ZoneInfo:
    return ZoneInfo(server_timezone())


def _due(plan: dict, now: datetime) -> datetime | None:
    """Startzeit heute, falls heute ein Termin-Tag ist (0 = Sonntag wie beim Roboter)"""
    if (now.weekday() + 1) % 7 not in plan["days"]:
        return None
    h, m = map(int, plan["time"].split(":"))
    return now.replace(hour=h, minute=m, second=0, microsecond=0)


def next_run(plan: dict, now: datetime) -> float | None:
    if not plan["enabled"]:
        return None
    for i in range(8):
        day = now + timedelta(days=i)
        due = _due(plan, day)
        if due and due > now:
            return due.timestamp()
    return None


def get(serial: str) -> list[dict]:
    now = datetime.now(_tz())
    with _lock:
        plans = _read(serial)
    return [{**p, "next": next_run(p, now)} for p in plans]


def put(serial: str, plans: list[dict]) -> list[dict]:
    """Termine ersetzen; Stand der bisherigen (lastDue, last) bleibt erhalten"""
    with _lock:
        old = {p["id"]: p for p in _read(serial)}
        for p in plans:
            for k in ("lastDue", "last"):
                if k in old.get(p["id"], {}):
                    p[k] = old[p["id"]][k]
            if p["id"] not in old:
                # neu angelegt: ein heute schon vergangener Termin startet nicht mehr nachträglich
                now = datetime.now(_tz())
                due = _due(p, now)
                if due and due <= now:
                    p["lastDue"] = due.isoformat()
        _write(serial, plans)
    broadcast("plans", {"serial": serial})
    return get(serial)


def _ready(serial: str) -> str | None:
    """Grund, warum jetzt nicht gestartet werden kann, sonst None"""
    if zone_queue.get(serial):
        return "busy"
    st = cloud_command(serial, {"cmd": "getRobotState"})
    if not st or st.get("result") != "ok":
        return "offline"
    if st.get("state") != STATE_IDLE:
        return "busy"
    if st.get("error"):
        return "error"
    if ((st.get("details") or {}).get("charge") or 0) < zone_queue.MIN_CHARGE:
        return "charging"
    if not (st.get("availableCommands") or {}).get("start"):
        return "busy"
    return None


def _start(serial: str, plan: dict) -> str | None:
    """Termin starten; Rückgabe Fehlergrund oder None"""
    if plan["zones"]:
        q, res = zone_queue.start(serial, plan["mapId"], plan["zones"], plan["mode"], plan["navigationMode"])
        return None if q else ((res or {}).get("error") or "notStarted")
    params = {"mode": plan["mode"], "navigationMode": plan["navigationMode"]}
    if plan.get("mapId"):
        # ganze Karte: Kategorie Karte, damit No-Go-Linien gelten
        res = cloud_command(serial, {"cmd": "startCleaning", "params": {**params, "category": CATEGORY_MAP, "mapId": plan["mapId"]}}, timeout=20)
        if res and res.get("result") == "ok":
            return None
        logger.warning("plan %s: map cleaning refused (%s), trying house cleaning", plan["id"], (res or {}).get("result"))
    res = cloud_command(serial, {"cmd": "startCleaning", "params": {**params, "category": CATEGORY_HOUSE}}, timeout=20)
    return None if res and res.get("result") == "ok" else ((res or {}).get("error") or "notStarted")


def _record(serial: str, plan_id: str, **changes) -> None:
    with _lock:
        plans = _read(serial)
        for p in plans:
            if p["id"] == plan_id:
                p.update(changes)
        _write(serial, plans)
    broadcast("plans", {"serial": serial})


def _tick() -> None:
    now = datetime.now(_tz())
    for serial in _serials():
        with _lock:
            plans = _read(serial)
        for plan in plans:
            if not plan.get("enabled"):
                continue
            due = _due(plan, now)
            if not due or now < due or plan.get("lastDue") == due.isoformat():
                continue
            if (now - due).total_seconds() > WINDOW_S:
                reason = (plan.get("last") or {}).get("reason") if (plan.get("last") or {}).get("due") == due.isoformat() else None
                _record(serial, plan["id"], lastDue=due.isoformat(),
                        last={"due": due.isoformat(), "ts": time.time(), "result": "skipped", "reason": reason or "late"})
                logger.info("plan %s on %s skipped (%s)", plan["id"], serial, reason or "late")
                broadcast("notice", {"serial": serial, "type": "plan_skipped", "reason": reason, "ts": time.time()})
                continue
            reason = _ready(serial)
            if reason is None:
                reason = _start(serial, plan)
                if reason is None:
                    _record(serial, plan["id"], lastDue=due.isoformat(),
                            last={"due": due.isoformat(), "ts": time.time(), "result": "started", "reason": None})
                    logger.info("plan %s on %s started (%s)", plan["id"], serial,
                                f"{len(plan['zones'])} zones" if plan["zones"] else "whole map")
                    broadcast("notice", {"serial": serial, "type": "plan_started", "ts": time.time()})
                    return  # höchstens ein Start pro Takt
            if (plan.get("last") or {}).get("reason") != reason or (plan.get("last") or {}).get("due") != due.isoformat():
                _record(serial, plan["id"], last={"due": due.isoformat(), "ts": time.time(), "result": "waiting", "reason": reason})


def run() -> None:
    while True:
        try:
            _tick()
        except Exception:
            logger.exception("plan tick failed")
        time.sleep(TICK_S)
