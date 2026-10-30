"""Read-only poller for the ESP32 bridge (OpenNeato) on a Gen3 robot's debug port.

Every ESP_POLL_S: state, error, charger, analog (+ motors while cleaning) -> `telemetry`.
Every ESP_POSE_POLL_S while cleaning: `GetRobotPos Smooth` -> `pose`.
Both are broadcast on /api/events. Only cached read endpoints and GetRobotPos are used,
no command that changes what the robot does.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
import urllib.parse
import urllib.request

from sqlalchemy import delete, select

from vacuula_server.db import db_commit2, get_session
from vacuula_server.env import ESP_POLL_S, ESP_POSE_POLL_S, ESP_ROBOT, TELEMETRY_RETENTION_DAYS
from vacuula_server.esp.config import get_esp_host
from vacuula_server.handlers.events import broadcast
from vacuula_server.models.robot import Robot
from vacuula_server.models.telemetry import Pose, Telemetry

logger = logging.getLogger(__name__)

TIMEOUT_S = 5
CLEANUP_INTERVAL_S = 3600
POSE_RE = re.compile(r"X=([-\d.]+), Y=([-\d.]+), Theta=([-\d.]+)")


def is_cleaning(state: dict | None) -> bool:
    # ST_F* = robot is out on a cleaning run (undocking, exploring, cleaning, recovering)
    return bool(state) and str(state.get("robotState", "")).startswith("ST_F")


def parse_pose(raw: str) -> tuple[float, float, float] | None:
    m = POSE_RE.search(raw)
    return (float(m[1]), float(m[2]), float(m[3])) if m else None


class EspPoller:
    def __init__(self, host: str):
        self.host = host
        self.base = f"http://{host}"
        self.last_ok: float | None = None
        self.serial: str | None = None
        self.online: bool | None = None
        self.state: dict | None = None
        self.next_telemetry = 0.0
        self.next_cleanup = 0.0

    def _get(self, path: str) -> dict | None:
        try:
            with urllib.request.urlopen(self.base + path, timeout=TIMEOUT_S) as resp:
                return json.load(resp)
        except Exception as e:
            logger.debug("ESP GET %s failed: %s", path, e)
            return None

    def _pose(self) -> tuple[float, float, float] | None:
        url = f"{self.base}/api/serial?" + urllib.parse.urlencode({"cmd": "GetRobotPos Smooth"})
        try:
            req = urllib.request.Request(url, method="POST")
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                return parse_pose(resp.read().decode("utf-8", "replace"))
        except Exception as e:
            logger.debug("ESP pose failed: %s", e)
            return None

    def _resolve_serial(self) -> str | None:
        if ESP_ROBOT:
            return ESP_ROBOT
        with get_session() as session:
            gen3 = session.execute(select(Robot.serial).where(Robot.type == "neato.gen3")).scalars().all()
        if len(gen3) == 1:
            return gen3[0]
        return None

    def _set_online(self, online: bool) -> None:
        if online:
            self.last_ok = time.time()
        if online != self.online:
            if online:
                logger.info("ESP %s reachable, polling for robot %s", self.base, self.serial)
            else:
                logger.warning("ESP %s not reachable", self.base)
            self.online = online

    def poll_telemetry(self, now: float) -> None:
        state = self._get("/api/state")
        self._set_online(state is not None)
        if state is None:
            return
        self.state = state
        data = {
            "state": state,
            "error": self._get("/api/error"),
            "charger": self._get("/api/charger"),
            "analog": self._get("/api/analog"),
            "motors": self._get("/api/motors") if is_cleaning(state) else None,
        }
        with get_session() as session:
            db_commit2(session, Telemetry(robot=self.serial, ts=now, data=data))
        broadcast("telemetry", {"serial": self.serial, "ts": now, **data})

    def poll_pose(self, now: float) -> None:
        pose = self._pose()
        if pose is None:
            return
        x, y, theta = pose
        with get_session() as session:
            db_commit2(session, Pose(robot=self.serial, ts=now, x=x, y=y, theta=theta))
        broadcast("pose", {"serial": self.serial, "ts": now, "x": x, "y": y, "theta": theta})

    def cleanup(self, now: float) -> None:
        cutoff = now - TELEMETRY_RETENTION_DAYS * 86400
        with get_session() as session:
            session.execute(delete(Telemetry).where(Telemetry.ts < cutoff))
            session.execute(delete(Pose).where(Pose.ts < cutoff))
            session.commit()

    def tick(self) -> None:
        if self.serial is None:
            self.serial = self._resolve_serial()
            if self.serial is None:
                return
        now = time.time()
        if now >= self.next_telemetry:
            self.next_telemetry = now + ESP_POLL_S
            self.poll_telemetry(now)
        elif is_cleaning(self.state):
            # keep the cleaning flag fresh between telemetry samples (ESP caches state for 2 s)
            self.state = self._get("/api/state") or self.state
        if self.online and is_cleaning(self.state):
            self.poll_pose(now)
        if now >= self.next_cleanup:
            self.next_cleanup = now + CLEANUP_INTERVAL_S
            self.cleanup(now)


# aktueller Poller, für den Verbindungsstatus in GET /api/esp
current: EspPoller | None = None


def start() -> None:
    """Läuft immer; fragt nur ab, solange eine ESP-Adresse gesetzt ist. Adresswechsel greifen beim nächsten Takt."""
    global current
    while True:
        started = time.time()
        host = get_esp_host()
        if not host:
            if current:
                logger.info("ESP poller stopped (no address)")
            current = None
            threading.Event().wait(5)
            continue
        if current is None or current.host != host:
            current = EspPoller(host)
            logger.info("ESP poller started for %s", host)
        try:
            current.tick()
        except Exception:
            logger.exception("ESP poller tick failed")
        threading.Event().wait(max(0.5, ESP_POSE_POLL_S - (time.time() - started)))
