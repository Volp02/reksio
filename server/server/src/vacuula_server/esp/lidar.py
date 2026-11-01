"""LIDAR on demand: GetLDSScan only while someone watches live (POST /api/robot/<serial>/lidar renews a short lease)
and Reksio is cleaning (the LIDAR only spins then). Scans are projected into the pose frame and only broadcast
as `lidar` events, never stored.

Calibration from a recorded run (2026-11-01, D7 firmware 4.5.3): scan angles count counter-clockwise like the
pose theta, 0° points forward (best fit +4°), the LIDAR sits about 7 cm behind the pose origin.
"""
from __future__ import annotations

import math
import threading
import time

LEASE_S = 15
INTERVAL_S = 2
ANGLE_OFFSET_DEG = 4.0
LDS_X_M = -0.07
MAX_DIST_MM = 8000
# Scans taken while turning or driving fast are smeared (one rotation takes 0.2 s, the serial read ~0.5 s)
STEADY_DTHETA_DEG = 4.0
STEADY_DIST_M = 0.08

_lock = threading.Lock()
_until: dict[str, float] = {}


def request(serial: str) -> float:
    """Someone watches live: keep scanning for LEASE_S. Returns the lease end."""
    with _lock:
        _until[serial] = time.time() + LEASE_S
        return _until[serial]


def wanted(serial: str | None, now: float) -> bool:
    with _lock:
        return serial is not None and _until.get(serial, 0) > now


def parse_scan(raw: str) -> list[tuple[int, int]]:
    """GetLDSScan -> [(angle°, distance mm)] of valid points (distance > 0, error code 0)"""
    out = []
    for line in raw.replace("\r", "").split("\n"):
        p = [s.strip() for s in line.split(",")]
        if len(p) >= 4 and p[0].isdigit() and p[1].isdigit():
            dist = int(p[1])
            if 0 < dist <= MAX_DIST_MM and p[3] == "0":
                out.append((int(p[0]), dist))
    return out


def steady(before: tuple[float, float, float], after: tuple[float, float, float]) -> bool:
    dtheta = (after[2] - before[2] + 180) % 360 - 180
    return abs(dtheta) < STEADY_DTHETA_DEG and math.hypot(after[0] - before[0], after[1] - before[1]) < STEADY_DIST_M


def project(points: list[tuple[int, int]], before: tuple[float, float, float],
            after: tuple[float, float, float]) -> list[list[float]]:
    """Scan points -> [x, y] in the pose frame (metres, cm precision), using the mean of both poses"""
    dtheta = (after[2] - before[2] + 180) % 360 - 180
    t = math.radians(before[2] + dtheta / 2 + ANGLE_OFFSET_DEG)
    x = (before[0] + after[0]) / 2 + LDS_X_M * math.cos(t)
    y = (before[1] + after[1]) / 2 + LDS_X_M * math.sin(t)
    out = []
    for angle, dist in points:
        a = t + math.radians(angle)
        out.append([round(x + dist / 1000 * math.cos(a), 2), round(y + dist / 1000 * math.sin(a), 2)])
    return out
