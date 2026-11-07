"""Hinweise aus den Ereignissen eines Gen4-Roboters für Web-App und Android-App (`notice` auf /api/events).

Gen3 meldet sich über die Telemetrie des ESP, Gen4 hat keinen ESP, schickt aber selbst `peer.state` (Zustand) und
`robots.error_codes` (Fehler mit Schweregrad). Daraus werden dieselben Übergänge wie in der Android-App (Watcher.kt):
gestartet, pausiert, lädt und macht weiter, fährt zur Basis, fertig, dazu Fehler und „nicht erreichbar“, wenn die
Verbindung während einer Reinigung länger als OFFLINE_S weg ist. Jeder Hinweis trägt den Namen des Roboters.
"""
from __future__ import annotations

import logging
import re
import threading
import time

from vacuula_server.generation import get_robot_by_serial
from vacuula_server.handlers.events import broadcast
from vacuula_server.state import robot_connections

logger = logging.getLogger(__name__)

OFFLINE_S = 5 * 60
# nur Ablauf, keine Störung (wie GEN4_QUIET in der Web-App)
QUIET = re.compile(r"^(return_to_|busy_charging|recovering_location|charging_|acquiring_persistent_map_ids|"
                   r"creating_and_uploading_map|routine_cleaning_start$|confirm_start_after_charge|needs_to_recharge|dustbin_emptied)")
REPORTED = ("warning", "error", "critical")

_lock = threading.Lock()
_last: dict[str, dict] = {}       # serial -> {"state", "action"}
_errors: dict[str, set] = {}      # serial -> gemeldete Codes, solange sie anstehen
_offline: dict[str, threading.Timer] = {}


def _name(serial: str) -> str:
    r = get_robot_by_serial(serial)
    return r.name if r else serial


def _notice(serial: str, kind: str, **extra) -> None:
    broadcast("notice", {"serial": serial, "name": _name(serial), "type": kind, "ts": time.time(), **extra})
    logger.info("notice %s for %s %s", kind, serial, extra or "")


def _active(s: dict | None) -> bool:
    return bool(s) and s["state"] in ("busy", "paused", "error") and s["action"] in ("cleaning", "cleaning_standby", "docking")


def transition(prev: dict | None, cur: dict) -> str | None:
    """Übergang zwischen zwei Zuständen, der eine Meldung wert ist (state/action wie in state.show)"""
    if prev is None or prev == cur:
        return None
    if cur["state"] == "paused" and prev["state"] != "paused":
        return "robot_paused"
    if cur["action"] == "cleaning_standby" and prev["action"] != "cleaning_standby":
        return "robot_charging_resume"
    if prev["action"] == "cleaning_standby" and cur["action"] == "cleaning" and cur["state"] == "busy":
        return "robot_resumed"
    if cur["action"] == "docking" and prev["action"] == "cleaning":
        return "robot_returning"
    if cur["state"] == "busy" and cur["action"] == "cleaning" and not _active(prev):
        return "robot_started"
    if _active(prev) and cur["state"] == "idle":
        return "robot_finished"
    return None


def _errors_seen(serial: str, errors: list, complete: bool) -> None:
    """neue Codes melden; `complete` = Liste ist der ganze aktuelle Stand (peer.state), dann verschwundene vergessen"""
    codes = {(e or {}).get("code"): (e or {}).get("severity") for e in errors or []}
    with _lock:
        seen = _errors.setdefault(serial, set())
        new = [(c, sev) for c, sev in codes.items() if c and c not in seen and sev in REPORTED and not QUIET.match(c)]
        seen.update(c for c, _ in new)
        if complete:
            seen.intersection_update(codes)
    for code, sev in new:
        _notice(serial, "robot_error", code=code, severity=sev)


def on_event(serial: str, msg: dict) -> None:
    """vom Gen4-Handler für jedes Ereignis des Roboters"""
    try:
        service = (msg.get("to") or {}).get("service")
        body = msg.get("body") or {}
        if service == "peer.state":
            cur = {"state": body.get("state"), "action": body.get("action")}
            with _lock:
                prev = _last.get(serial)
                _last[serial] = cur
            kind = transition(prev, cur)
            if kind:
                _notice(serial, kind)
            _errors_seen(serial, body.get("errors") or [], complete=True)
        elif service == "robots.error_codes":
            _errors_seen(serial, [body], complete=False)
    except Exception:
        logger.exception("gen4 notice failed for %s", serial)


def seen_state(serial: str, body: dict) -> None:
    """Zustand aus einer Antwort auf state.show: nur merken (Ausgangspunkt für Übergänge), nichts melden"""
    with _lock:
        _last.setdefault(serial, {"state": body.get("state"), "action": body.get("action")})


def connected(serial: str) -> None:
    with _lock:
        t = _offline.pop(serial, None)
    if t:
        t.cancel()


def disconnected(serial: str) -> None:
    """während einer Reinigung getrennt: melden, wenn er nach OFFLINE_S noch nicht wieder da ist"""
    with _lock:
        was_active = _active(_last.get(serial))
        _last.pop(serial, None)
        if not was_active or serial in _offline:
            return

        def check():
            with _lock:
                _offline.pop(serial, None)
            if serial not in robot_connections:
                _notice(serial, "robot_offline")

        t = threading.Timer(OFFLINE_S, check)
        t.daemon = True
        _offline[serial] = t
    t.start()
