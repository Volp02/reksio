"""Mehrere Zonen nacheinander reinigen (Gen3).

Der D7 reinigt pro startCleaning genau eine Zone (houseCleaning basic-4, `boundaryId`). Der Server hält deshalb eine
Warteschlange: erste Zone sofort starten, dann alle POLL_S den Zustand abfragen. Ist Reksio nach einer Zone wieder
im Leerlauf, prüft der Server, ob die Zone wirklich gereinigt wurde: nur dann schickt der Roboter einen Run (mit
derselben Startzeit). Ohne Run (z. B. „Position nicht gefunden“, Weg versperrt) gilt der Versuch als fehlgeschlagen und
die Zone wird einmal wiederholt (MAX_ATTEMPTS), danach geht es mit der nächsten weiter. Die nächste Zone startet, sobald
der Akku mindestens MIN_CHARGE hat. Stopp, „Zur Basis“ oder ein anderer Reinigungsstart aus der App brechen die
Warteschlange ab (siehe post_robot_command). Fehler am Roboter halten sie an, bis sie behoben sind. Die Warteschlange
liegt in app_setting und übersteht einen Neustart des Servers; jeder Auftrag mit allen Versuchen und Hinweisen landet
zusätzlich in cleaning_job (cleaning_log).
"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timezone

from sqlalchemy import select

from vacuula_server import cleaning_log
from vacuula_server.db import get_session
from vacuula_server.gen3.cloud import cloud_command
from vacuula_server.handlers.events import broadcast
from vacuula_server.models.app_setting import AppSetting
from vacuula_server.models.run import Gen3__Run

logger = logging.getLogger(__name__)

POLL_S = 10
START_TIMEOUT_S = 120  # so lange darf es dauern, bis Reksio nach dem Start als beschäftigt gilt
SETTLE_S = 30          # Pause zwischen zwei Zonen (Andocken abschließen)
MIN_CHARGE = 40        # % Akku, ab dem die nächste Zone startet
MAX_ATTEMPTS = 2       # Versuche pro Zone
RUN_WAIT_S = 90        # so lange nach dem Ende auf den Run warten (kommt meist nach ~10 s)
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


def _codes(st: dict | None) -> list[str]:
    """Hinweis und Fehler aus getRobotState, einheitlich alert_… / error_…"""
    st = st or {}
    out = []
    for kind in ("alert", "error"):
        if isinstance(st.get(kind), str) and st[kind]:
            out.append(cleaning_log.norm_code(st[kind], kind))
    return out


def _job_zones(q: dict) -> list[dict]:
    return [{"id": z["id"], "name": z.get("name") or "", **r} for z, r in zip(q["zones"], q["results"])]


def _sync(q: dict, **fields) -> None:
    cleaning_log.job_update(q.get("job"), zones=_job_zones(q), **fields)


def _start_zone(serial: str, q: dict, baseline: list[str]) -> tuple[bool, dict | None]:
    zone = q["zones"][q["index"]]
    res = cloud_command(serial, {"cmd": "startCleaning", "params": {
        "category": CATEGORY_MAP, "mode": q["mode"], "navigationMode": q["navigationMode"],
        "mapId": q["mapId"], "boundaryId": zone["id"],
    }}, timeout=20)
    ok = bool(res) and res.get("result") == "ok"
    logger.info("zone %d/%d (%s) start on %s: %s", q["index"] + 1, len(q["zones"]), zone.get("name"), serial,
                "ok" if ok else (res or {}).get("result", "no answer"))
    r = q["results"][q["index"]]
    now = time.time()
    r["attempts"].append({"start": now, "end": None if ok else now, "run": None,
                          "result": None if ok else "notStarted", "reason": None if ok else (res or {}).get("result"), "alerts": []})
    r["status"] = "cleaning" if ok else "failed"
    q["baseline"] = baseline  # Hinweise, die schon vor dem Start da waren (bleiben stehen, bis sie jemand wegklickt)
    return ok, res


def start(serial: str, map_id: str, zones: list[dict], mode: int, navigation_mode: int,
          source: str = "app", plan_id: str | None = None) -> tuple[dict | None, dict | None]:
    """Erste Zone sofort starten. Rückgabe (Warteschlange, Antwort des Roboters bei Fehler)."""
    cancel(serial, "replaced")
    q = {
        "mapId": map_id, "zones": zones, "index": 0, "mode": mode, "navigationMode": navigation_mode,
        "status": "cleaning", "since": time.time(), "busy": False, "reason": None,
        "results": [{"status": "pending", "attempts": []} for _ in zones],
    }
    q["job"] = cleaning_log.job_create(serial, source, plan_id, map_id, _job_zones(q))
    ok, res = _start_zone(serial, q, _codes(cloud_command(serial, {"cmd": "getRobotState"})))
    if not ok:
        for r in q["results"][1:]:
            r["status"] = "skipped"
        _sync(q, status="failed", reason="notStarted", finished=time.time())
        return None, res
    _sync(q)
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
    _close(q, "stopped", why)
    _publish(serial, None)


def _close(q: dict, status: str, reason: str | None) -> None:
    """Auftrag abschließen: offene Zonen als ausgelassen, Ergebnis aus den Zonen"""
    now = time.time()
    for r in q.get("results", []):
        if r["status"] == "cleaning":
            r["status"] = "stopped"
            for a in r["attempts"]:
                if a["end"] is None:
                    a["end"], a["result"] = now, "stopped"
        elif r["status"] == "pending":
            r["status"] = "skipped"
    statuses = [r["status"] for r in q.get("results", [])]
    if status == "done" and "failed" in statuses:
        status = "partial" if "done" in statuses else "failed"
    q["outcome"] = status
    _sync(q, status=status, reason=reason, finished=now)


def _finish(serial: str, q: dict, status: str, reason: str | None = None) -> None:
    with _lock:
        if _queues.get(serial) is not q:
            return
        _queues.pop(serial)
    _close(q, status, reason)
    status = q["outcome"]
    failed = [z.get("name") or "" for z, r in zip(q["zones"], q["results"]) if r["status"] == "failed"]
    logger.info("zone queue on %s %s%s%s", serial, status, f" ({reason})" if reason else "",
                f", failed: {', '.join(failed)}" if failed else "")
    _publish(serial, None)
    broadcast("notice", {"serial": serial, "type": "zones_" + status, "reason": reason, "failed": failed, "ts": time.time()})


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _find_run(serial: str, start: float, claimed: set[str]) -> dict | None:
    """Run des Roboters zu einem Versuch: seine ID ist die Startzeit (UTC), gemessen gleich mit unserem Start.
    Runs, die schon zu einem früheren Versuch gehören, zählen nicht (sehr kurze Zonen)."""
    with get_session() as session:
        rows = session.execute(select(Gen3__Run.id, Gen3__Run.run).where(
            Gen3__Run.robot == serial, Gen3__Run.id >= _iso(start - 30), Gen3__Run.id <= _iso(start + 120))).all()
    rows = [r for r in rows if r[0] not in claimed]
    if not rows:
        return None
    rid, run = min(rows, key=lambda r: abs(datetime.strptime(r[0], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp() - start))
    return {"id": rid, **(run or {})}


def _advance(serial: str, q: dict, now: float) -> None:
    if q["index"] + 1 >= len(q["zones"]):
        _finish(serial, q, "done")
        return
    q.update(index=q["index"] + 1, status="waiting", since=now, busy=False, reason=None)
    _sync(q)
    _update(serial, q)


def _step(serial: str, q: dict, now: float) -> None:
    """Ein Takt; ändert q nur, solange es noch die aktuelle Warteschlange ist (cancel() kann jederzeit kommen)."""
    st = cloud_command(serial, {"cmd": "getRobotState"})
    if not st or st.get("result") != "ok" or not _current(serial, q):
        return  # nicht verbunden: später erneut
    state = st.get("state")

    r = q["results"][q["index"]]
    if not r["attempts"] and q["status"] in ("cleaning", "checking"):
        # Warteschlange aus einer älteren Version: laufenden Versuch nachtragen
        r["attempts"].append({"start": q["since"], "end": None, "run": None, "result": None, "reason": None, "alerts": []})
    attempt = r["attempts"][-1] if r["attempts"] else None

    if q["status"] == "cleaning":
        if state in (STATE_BUSY, STATE_PAUSED, STATE_ERROR):
            new = [c for c in _codes(st) if c not in q.get("baseline", []) and c not in attempt["alerts"]]
            if new:
                attempt["alerts"] += new
                _sync(q)
            if not q["busy"]:
                q["busy"] = True
                _update(serial, q)
        elif state == STATE_IDLE:
            if not q["busy"]:
                if now - q["since"] > START_TIMEOUT_S:
                    attempt.update(end=now, result="notStarted")
                    r["status"] = "failed"
                    _finish(serial, q, "failed", "notStarted")
                return
            attempt["end"] = now
            q.update(status="checking", since=now)
            _sync(q)
            _update(serial, q)
        return

    if q["status"] == "checking":
        claimed = {a["run"] for res in q["results"] for a in res["attempts"] if a.get("run")}
        run = _find_run(serial, attempt["start"], claimed)
        if run is None and now - q["since"] < RUN_WAIT_S:
            return
        if run is not None:
            attempt["run"] = run["id"]
        ok = run is not None and run.get("status") == "complete" and not run.get("error")
        attempt["result"] = "done" if ok else "failed"
        attempt["reason"] = None if ok else ((run or {}).get("error") or (run or {}).get("status")
                                             or next((a for a in attempt["alerts"] if a.startswith("error_") or "fail" in a), None)
                                             or "noRun")
        idle_since = attempt["end"] or now
        if ok:
            r["status"] = "done"
        elif len(r["attempts"]) < MAX_ATTEMPTS:
            logger.info("zone %d/%d on %s failed (%s), retrying", q["index"] + 1, len(q["zones"]), serial, attempt["reason"])
            r["status"] = "pending"
            q.update(status="waiting", since=idle_since, busy=False, reason=None)
            _sync(q)
            _update(serial, q)
            return
        else:
            logger.info("zone %d/%d on %s failed (%s), giving up", q["index"] + 1, len(q["zones"]), serial, attempt["reason"])
            r["status"] = "failed"
        _advance(serial, q, idle_since)
        return

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
        ok, res = _start_zone(serial, q, _codes(st))
        if not ok:
            _finish(serial, q, "failed", (res or {}).get("error") or "notStarted")
            return
        q.update(status="cleaning", since=time.time(), busy=False, reason=None)
        _sync(q)
        _update(serial, q)


def _load() -> None:
    with get_session() as session:
        rows = session.query(AppSetting).filter(AppSetting.key.startswith(KEY)).all()
        for row in rows:
            try:
                q = json.loads(row.value)
                q.setdefault("results", [{"status": "done" if i < q["index"] else "pending", "attempts": []}
                                         for i in range(len(q["zones"]))])
                _queues[row.key[len(KEY):]] = q
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
