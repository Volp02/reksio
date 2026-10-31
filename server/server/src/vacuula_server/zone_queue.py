"""Mehrere Zonen nacheinander reinigen (Gen3).

Der D7 reinigt pro startCleaning genau eine Zone (houseCleaning basic-4, `boundaryId`). Der Server hält deshalb eine
Warteschlange: erste Zone sofort starten, dann alle POLL_S den Zustand abfragen. Ist Reksio nach einer Zone wieder
im Leerlauf, startet die nächste, sobald der Akku mindestens MIN_CHARGE hat. Stopp, „Zur Basis“ oder ein anderer
Reinigungsstart aus der App brechen die Warteschlange ab (siehe post_robot_command). Fehler am Roboter halten sie an,
bis sie behoben sind. Die Warteschlange liegt in app_setting und übersteht einen Neustart des Servers.
"""
from __future__ import annotations

import json
import logging
import threading
import time

from vacuula_server.db import get_session
from vacuula_server.gen3.cloud import cloud_command
from vacuula_server.handlers.events import broadcast
from vacuula_server.models.app_setting import AppSetting

logger = logging.getLogger(__name__)

POLL_S = 10
START_TIMEOUT_S = 120  # so lange darf es dauern, bis Reksio nach dem Start als beschäftigt gilt
SETTLE_S = 30          # Pause zwischen zwei Zonen (Andocken abschließen)
MIN_CHARGE = 40        # % Akku, ab dem die nächste Zone startet
KEY = "zone_queue:"

STATE_IDLE, STATE_BUSY, STATE_PAUSED, STATE_ERROR = 1, 2, 3, 4
CATEGORY_MAP = 4

_lock = threading.Lock()
_wake = threading.Event()
_queues: dict[str, dict] = {}


def _save(serial: str, q: dict | None) -> None:
    with get_session() as session:
        row = session.get(AppSetting, KEY + serial)
        if q is None:
            if row:
                session.delete(row)
        elif row:
            row.value = json.dumps(q)
        else:
            session.add(AppSetting(key=KEY + serial, value=json.dumps(q)))
        session.commit()


def _publish(serial: str, q: dict | None) -> None:
    _save(serial, q)
    broadcast("zones", {"serial": serial, "queue": q})


def _update(serial: str, q: dict) -> None:
    """Zwischenstand veröffentlichen, außer die Warteschlange wurde inzwischen abgebrochen"""
    with _lock:
        if _queues.get(serial) is not q:
            return
        _save(serial, q)
    broadcast("zones", {"serial": serial, "queue": q})


def get(serial: str) -> dict | None:
    with _lock:
        return _queues.get(serial)


def _current(serial: str, q: dict) -> bool:
    with _lock:
        return _queues.get(serial) is q


def _start_zone(serial: str, q: dict) -> tuple[bool, dict | None]:
    zone = q["zones"][q["index"]]
    res = cloud_command(serial, {"cmd": "startCleaning", "params": {
        "category": CATEGORY_MAP, "mode": q["mode"], "navigationMode": q["navigationMode"],
        "mapId": q["mapId"], "boundaryId": zone["id"],
    }}, timeout=20)
    ok = bool(res) and res.get("result") == "ok"
    logger.info("zone %d/%d (%s) start on %s: %s", q["index"] + 1, len(q["zones"]), zone.get("name"), serial,
                "ok" if ok else (res or {}).get("result", "no answer"))
    return ok, res


def start(serial: str, map_id: str, zones: list[dict], mode: int, navigation_mode: int) -> tuple[dict | None, dict | None]:
    """Erste Zone sofort starten. Rückgabe (Warteschlange, Antwort des Roboters bei Fehler)."""
    cancel(serial, "replaced")
    q = {
        "mapId": map_id, "zones": zones, "index": 0, "mode": mode, "navigationMode": navigation_mode,
        "status": "cleaning", "since": time.time(), "busy": False, "reason": None,
    }
    ok, res = _start_zone(serial, q)
    if not ok:
        return None, res
    with _lock:
        _queues[serial] = q
    _publish(serial, q)
    _wake.set()
    return q, None


def cancel(serial: str, why: str = "stopped") -> None:
    """Rest der Warteschlange verwerfen; die laufende Zone selbst wird nicht angehalten."""
    with _lock:
        q = _queues.pop(serial, None)
    if q is None:
        return
    logger.info("zone queue on %s cancelled (%s)", serial, why)
    _publish(serial, None)


def _finish(serial: str, q: dict, status: str, reason: str | None = None) -> None:
    with _lock:
        if _queues.get(serial) is not q:
            return
        _queues.pop(serial)
    logger.info("zone queue on %s %s%s", serial, status, f" ({reason})" if reason else "")
    _publish(serial, None)
    broadcast("notice", {"serial": serial, "type": "zones_" + status, "reason": reason, "ts": time.time()})


def _step(serial: str, q: dict, now: float) -> None:
    """Ein Takt; ändert q nur, solange es noch die aktuelle Warteschlange ist (cancel() kann jederzeit kommen)."""
    st = cloud_command(serial, {"cmd": "getRobotState"})
    if not st or st.get("result") != "ok" or not _current(serial, q):
        return  # nicht verbunden: später erneut
    state = st.get("state")

    if q["status"] == "cleaning":
        if state in (STATE_BUSY, STATE_PAUSED, STATE_ERROR):
            if not q["busy"]:
                q["busy"] = True
                _update(serial, q)
        elif state == STATE_IDLE:
            if not q["busy"]:
                if now - q["since"] > START_TIMEOUT_S:
                    _finish(serial, q, "failed", "notStarted")
                return
            if q["index"] + 1 >= len(q["zones"]):
                _finish(serial, q, "done")
                return
            q.update(index=q["index"] + 1, status="waiting", since=now, busy=False, reason=None)
            _update(serial, q)

    elif q["status"] == "waiting":
        if state in (STATE_BUSY, STATE_PAUSED):
            # jemand hat am Roboter selbst etwas gestartet
            _finish(serial, q, "stopped", "robotBusy")
            return
        if state != STATE_IDLE or now - q["since"] < SETTLE_S:
            return
        charge = (st.get("details") or {}).get("charge") or 0
        reason = "error" if st.get("error") else "charging" if charge < MIN_CHARGE \
            else None if (st.get("availableCommands") or {}).get("start") else "blocked"
        if reason:
            if q["reason"] != reason:
                q["reason"] = reason
                _update(serial, q)
            return
        if not _current(serial, q):
            return
        ok, res = _start_zone(serial, q)
        if not ok:
            _finish(serial, q, "failed", (res or {}).get("error") or "notStarted")
            return
        q.update(status="cleaning", since=time.time(), busy=False, reason=None)
        _update(serial, q)


def _load() -> None:
    with get_session() as session:
        rows = session.query(AppSetting).filter(AppSetting.key.startswith(KEY)).all()
        for row in rows:
            try:
                _queues[row.key[len(KEY):]] = json.loads(row.value)
            except ValueError:
                pass
    if _queues:
        logger.info("zone queues restored: %s", ", ".join(_queues))


def run() -> None:
    """Hintergrund-Thread: fragt nur, solange eine Warteschlange läuft."""
    _load()
    while True:
        _wake.wait(POLL_S)
        _wake.clear()
        with _lock:
            items = list(_queues.items())
        for serial, q in items:
            try:
                _step(serial, q, time.time())
            except Exception:
                logger.exception("zone queue step failed for %s", serial)
