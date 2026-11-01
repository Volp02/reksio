"""Read-only poller for the ESP32 bridge (OpenNeato) on a Gen3 robot's debug port.

Every ESP_POLL_S: state, error, charger, GetAnalogSensors, GetAccel (+ GetMotors while cleaning) -> `telemetry`.
Analog, accel and motors are read raw via /api/serial and parsed here, so the ESP needs no parser of its own
(its /api/motors misses Vacuum_mA and ROTATION_SPEED on the D7).
Every ESP_POSE_POLL_S while cleaning: `GetRobotPos Smooth` -> `pose` (kept forever).
Only while someone watches live and Reksio cleans: `GetLDSScan` -> `lidar` events (see lidar.py, not stored).
Telemetry older than TELEMETRY_RETENTION_DAYS is thinned to one sample per TELEMETRY_THIN_S, never deleted.
Every HISTORY_IMPORT_S when idle: missing poses of finished runs from the ESP's own history (history_import).
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

from sqlalchemy import Integer, delete, func, select

from vacuula_server import cleaning_log
from vacuula_server.db import db_commit2, get_session
from vacuula_server.env import ESP_POLL_S, ESP_POSE_POLL_S, ESP_ROBOT, TELEMETRY_RETENTION_DAYS, TELEMETRY_THIN_S
from vacuula_server.esp import history_import, lidar
from vacuula_server.esp.config import get_esp_host
from vacuula_server.handlers.events import broadcast
from vacuula_server.models.app_setting import AppSetting
from vacuula_server.models.robot import Robot
from vacuula_server.models.telemetry import Pose, Telemetry

logger = logging.getLogger(__name__)

TIMEOUT_S = 5
CLEANUP_INTERVAL_S = 3600
THINNED_KEY = "telemetry_thinned_until"
HISTORY_IMPORT_S = 600
SLOW_POLL_S = 300  # Wartungszähler, Roboter-WLAN, Lebensdauer: ändern sich selten
POSE_RE = re.compile(r"X=([-\d.]+), Y=([-\d.]+), Theta=([-\d.]+)")
CODE_RE = re.compile(r"\((UI_(?:ALERT|ERROR)_[A-Z0-9_]+)\)")

# GetDigitalSensors-Namen -> Schlüssel in telemetry.data["sensors"]
SENSOR_KEYS = {
    "SNSR_DUSTBIN_IS_IN": "dustbinIn",
    "SNSR_DC_JACK_IS_IN": "dcJackIn",
    "SNSR_LEFT_WHEEL_EXTENDED": "leftWheelExtended",
    "SNSR_RIGHT_WHEEL_EXTENDED": "rightWheelExtended",
    "LSIDEBIT": "bumperLeftSide",
    "LFRONTBIT": "bumperLeftFront",
    "LLDSBIT": "bumperLeftLds",
    "RSIDEBIT": "bumperRightSide",
    "RFRONTBIT": "bumperRightFront",
    "RLDSBIT": "bumperRightLds",
}

# GetAnalogSensors (SensorName,Unit,Value) -> Schlüssel in telemetry.data["analog"], Faktor
# Kompass, IMU und Magnetsensoren lässt der D7 auf 0, auch beim Reinigen
ANALOG_KEYS = {
    "BatteryVoltage": ("batteryVoltageV", 0.001),
    "BatteryCurrent": ("batteryCurrentMA", 1),
    "BatteryTemperature": ("batteryTemperatureC", 0.001),
    "ExternalVoltage": ("externalVoltageV", 0.001),
    "VacuumCurrent": ("vacuumMA", 1),
    "SideBrushCurrent": ("sideBrushMA", 1),
    "WallSensor": ("wallMM", 1),
    "DropSensorLeft": ("dropLeftMM", 1),
    "DropSensorRight": ("dropRightMM", 1),
}

# GetMotors -> Schlüssel in telemetry.data["motors"] (dieselben Namen wie /api/motors des ESP)
MOTOR_KEYS = {
    "Brush_RPM": "brushRPM", "Brush_mA": "brushMA",
    "Vacuum_RPM": "vacuumRPM", "Vacuum_mA": "vacuumMA",
    "LeftWheel_RPM": "leftWheelRPM", "LeftWheel_Load%": "leftWheelLoad",
    "LeftWheel_PositionInMM": "leftWheelPositionMM", "LeftWheel_Speed": "leftWheelSpeed",
    "RightWheel_RPM": "rightWheelRPM", "RightWheel_Load%": "rightWheelLoad",
    "RightWheel_PositionInMM": "rightWheelPositionMM", "RightWheel_Speed": "rightWheelSpeed",
    "SideBrush_mA": "sideBrushMA",
}

# GetAccel -> Schlüssel in telemetry.data["accel"]
ACCEL_KEYS = {
    "PitchInDegrees": "pitchDeg", "RollInDegrees": "rollDeg", "SumInG": "sumG",
    "XInDPS": "gyroXDps", "YInDPS": "gyroYDps", "ZInDPS": "gyroZDps",
}


def to_num(v: str | None) -> int | float | None:
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else f


def is_cleaning(state: dict | None) -> bool:
    # ST_F* = robot is out on a cleaning run (undocking, exploring, cleaning, recovering)
    return bool(state) and str(state.get("robotState", "")).startswith("ST_F")


def parse_csv(raw: str) -> dict[str, str]:
    """'Name, Wert'-Zeilen einer Serial-Antwort (erste Zeile = Befehl)"""
    out: dict[str, str] = {}
    for line in raw.replace("\r", "").split("\n")[1:]:
        if "," in line:
            k, v = line.split(",", 1)
            out[k.strip()] = v.strip()
    return out


def parse_sensors(raw: str) -> dict | None:
    kv = parse_csv(raw)
    sensors = {key: kv[name] == "1" for name, key in SENSOR_KEYS.items() if name in kv}
    return sensors or None


def parse_analog(raw: str) -> dict | None:
    out: dict[str, int | float] = {}
    for line in raw.replace("\r", "").split("\n")[1:]:
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 3 and parts[0] in ANALOG_KEYS and (v := to_num(parts[2])) is not None:
            key, factor = ANALOG_KEYS[parts[0]]
            out[key] = round(v * factor, 3) if factor != 1 else v
    return out or None


def parse_motors(raw: str) -> dict | None:
    kv = parse_csv(raw)
    out = {key: v for name, key in MOTOR_KEYS.items() if (v := to_num(kv.get(name))) is not None}
    # LIDAR-Drehzahl: der D7 meldet Umdrehungen pro Sekunde (im Stand bleibt der letzte Wert stehen)
    if (hz := to_num(kv.get("ROTATION_SPEED"))) is not None:
        out["laserRPM"] = round(hz * 60)
    return out or None


def parse_accel(raw: str) -> dict | None:
    kv = parse_csv(raw)
    out = {key: v for name, key in ACCEL_KEYS.items() if (v := to_num(kv.get(name))) is not None}
    return out or None


def parse_user_settings(raw: str) -> dict | None:
    """Behälter- und Wartungszähler aus GetUserSettings"""
    def num(pattern: str) -> int | None:
        m = re.search(pattern, raw)
        return int(m.group(1)) if m else None
    data = {
        # der Roboter zählt die Laufzeit seit dem letzten Leeren in Millisekunden
        "binRuntimeMin": (ms // 60000) if (ms := num(r"Current Dirt Bin Runtime is:\s*(\d+)")) is not None else None,
        "binFullCount": num(r"Dust Bin was Full is:\s*(\d+)"),
        "binReminderMin": num(r"Dirt Bin Alert Reminder Interval \(minutes\),\s*(\d+)"),
        "filterChangeS": num(r"Filter Change Time \(seconds\),\s*(\d+)"),
        "brushChangeS": num(r"Brush Change Time \(seconds\),\s*(\d+)"),
    }
    return data if any(v is not None for v in data.values()) else None


def parse_robot_wifi(raw: str) -> dict | None:
    kv = parse_csv(raw)
    if not kv:
        return None
    return {
        "ssid": kv.get("SSID"), "bssid": kv.get("BSSID"), "ip": kv.get("IPADDR"),
        "signal": kv.get("SignalStrength"),
        "cloud": kv.get("Linked to Beehive") == "yes" and kv.get("Nucleo Connected") == "yes",
    }


def error_codes(err: dict | None) -> list[str]:
    if not err or not err.get("hasError"):
        return []
    return [c for c in CODE_RE.findall(err.get("errorMessage", "")) if not c.endswith("_INVALID")]


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
        self.next_slow = 0.0
        self.next_history = time.time() + 60
        self.next_lidar = 0.0
        self.last_bin_in: bool | None = None
        self.last_bin_clear = 0.0

    def _get(self, path: str) -> dict | None:
        try:
            with urllib.request.urlopen(self.base + path, timeout=TIMEOUT_S) as resp:
                return json.load(resp)
        except Exception as e:
            logger.debug("ESP GET %s failed: %s", path, e)
            return None

    def _serial(self, cmd: str) -> str | None:
        """Lesender Serial-Befehl über den ESP (Headless-Firmware lässt nur Get… durch)"""
        url = f"{self.base}/api/serial?" + urllib.parse.urlencode({"cmd": cmd})
        try:
            req = urllib.request.Request(url, method="POST")
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as e:
            logger.debug("ESP serial %r failed: %s", cmd, e)
            return None

    def _pose(self) -> tuple[float, float, float] | None:
        raw = self._serial("GetRobotPos Smooth")
        return parse_pose(raw) if raw else None

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
        raw_sensors = self._serial("GetDigitalSensors")
        raw_analog = self._serial("GetAnalogSensors")
        raw_accel = self._serial("GetAccel")
        raw_motors = self._serial("GetMotors") if is_cleaning(state) else None
        data = {
            "state": state,
            "error": self._get("/api/error"),
            "charger": self._get("/api/charger"),
            "analog": parse_analog(raw_analog) if raw_analog else None,
            "accel": parse_accel(raw_accel) if raw_accel else None,
            "motors": parse_motors(raw_motors) if raw_motors else None,
            "sensors": parse_sensors(raw_sensors) if raw_sensors else None,
        }
        # selten: nur in diesen Proben gesetzt, /telemetry/latest füllt sie aus älteren auf
        if now >= self.next_slow:
            self.next_slow = now + SLOW_POLL_S
            raw_us = self._serial("GetUserSettings")
            raw_wifi = self._serial("GetWifiStatus")
            data["maintenance"] = parse_user_settings(raw_us) if raw_us else None
            data["robotWifi"] = parse_robot_wifi(raw_wifi) if raw_wifi else None
            data["warranty"] = self._get("/api/warranty")
        self._auto_clear_bin(data)
        if data["error"] is not None:
            err = data["error"]
            cleaning_log.incidents_seen(self.serial, "esp", {
                cleaning_log.norm_code(c, "alert"): err.get("displayMessage") for c in error_codes(err)}, now)
        with get_session() as session:
            db_commit2(session, Telemetry(robot=self.serial, ts=now, data=data))
        broadcast("telemetry", {"serial": self.serial, "ts": now, **data})

    def _auto_clear_bin(self, data: dict) -> None:
        """Staubbehälter geleert -> Hinweis „voll“ selbst quittieren (am Roboter per ESP und in der Cloud)."""
        sensors = data.get("sensors") or {}
        bin_in = sensors.get("dustbinIn")
        reinserted = self.last_bin_in is False and bin_in is True
        if bin_in is not None:
            self.last_bin_in = bin_in
        codes = error_codes(data.get("error"))
        emptied_error = "UI_ERROR_DUST_BIN_EMPTIED" in codes
        if not (reinserted or (emptied_error and bin_in is not False)) or time.time() - self.last_bin_clear < 120:
            return
        self.last_bin_clear = time.time()
        logger.info("dust bin emptied (%s), clearing bin alerts", "re-inserted" if reinserted else "UI_ERROR_DUST_BIN_EMPTIED")
        try:
            req = urllib.request.Request(f"{self.base}/api/clear-errors", data=b"", method="POST")
            urllib.request.urlopen(req, timeout=TIMEOUT_S).read()
        except Exception as e:
            logger.warning("clear-errors on ESP failed: %s", e)
        dismiss_cloud_alert(self.serial)
        broadcast("notice", {"serial": self.serial, "type": "dustbin_emptied", "ts": time.time()})

    def poll_pose(self, now: float) -> tuple[float, float, float] | None:
        pose = self._pose()
        if pose is None:
            return None
        x, y, theta = pose
        with get_session() as session:
            db_commit2(session, Pose(robot=self.serial, ts=now, x=x, y=y, theta=theta))
        broadcast("pose", {"serial": self.serial, "ts": now, "x": x, "y": y, "theta": theta})
        return pose

    def poll_lidar(self, now: float) -> None:
        """Pose, Scan, Pose: nur ruhige Scans (kaum Drehung/Fahrt dazwischen) gehen raus, beide Posen zählen normal."""
        before = self.poll_pose(now)
        raw = self._serial("GetLDSScan") if before else None
        after = self.poll_pose(time.time()) if raw else None
        if not (before and raw and after) or not lidar.steady(before, after):
            return
        points = lidar.project(lidar.parse_scan(raw), before, after)
        broadcast("lidar", {"serial": self.serial, "ts": now, "points": points})

    def cleanup(self, now: float) -> None:
        """Telemetrie älter als TELEMETRY_RETENTION_DAYS ausdünnen: pro Roboter und TELEMETRY_THIN_S nur die erste
        Messung behalten. Nur der Bereich seit dem letzten Lauf (THINNED_KEY), damit es nicht jedes Mal alles liest."""
        cutoff = now - TELEMETRY_RETENTION_DAYS * 86400
        with get_session() as session:
            row = session.get(AppSetting, THINNED_KEY)
            since = float(row.value) if row else 0.0
            if cutoff <= since:
                return
            bucket = func.cast(Telemetry.ts / TELEMETRY_THIN_S, Integer)
            window = (Telemetry.ts >= since - TELEMETRY_THIN_S, Telemetry.ts < cutoff)
            keep = select(func.min(Telemetry.id)).where(*window).group_by(Telemetry.robot, bucket)
            result = session.execute(delete(Telemetry).where(*window, Telemetry.id.not_in(keep)))
            if row:
                row.value = str(cutoff)
            else:
                session.add(AppSetting(key=THINNED_KEY, value=str(cutoff)))
            session.commit()
        if result.rowcount:
            logger.info("telemetry thinned: %d samples before %s removed", result.rowcount, time.strftime("%Y-%m-%d %H:%M", time.localtime(cutoff)))

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
            if lidar.wanted(self.serial, now) and now >= self.next_lidar:
                self.next_lidar = now + lidar.INTERVAL_S
                self.poll_lidar(now)
            else:
                self.poll_pose(now)
        if self.online and not is_cleaning(self.state) and now >= self.next_history:
            self.next_history = now + HISTORY_IMPORT_S
            try:
                history_import.run(self.base, self.serial)
            except Exception as e:
                logger.info("ESP history import failed: %s", e)
        if now >= self.next_cleanup:
            self.next_cleanup = now + CLEANUP_INTERVAL_S
            self.cleanup(now)


def dismiss_cloud_alert(serial: str | None) -> None:
    """dismissCurrentAlert über das Cloud-Protokoll (Gen3), Antwort höchstens 10 s abwarten"""
    from vacuula_server.gen3.cloud import cloud_command
    cloud_command(serial, {"cmd": "dismissCurrentAlert"})


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
